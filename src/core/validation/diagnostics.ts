import type { DocumentState, Id } from '../model/types';
import { GLOBAL_SCOPE_ID } from '../model/types';
import { describeRefSource, isScopeLive, reachableObjectIds, scopeName } from '../model/queries';
import { formatValue, objectLabel, valuesEqual } from '../model/values';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface Diagnostic {
  id: string;
  code:
    | 'cycle'
    | 'unreachable'
    | 'null-reference'
    | 'uninitialized-variable'
    | 'uninitialized-field'
    | 'dangling-reference'
    | 'duplicate-variable'
    | 'missing-scope'
    | 'set-duplicate'
    | 'out-of-scope';
  severity: DiagnosticSeverity;
  message: string;
  /** Explains why this might be intentional (for informational findings). */
  note?: string;
  elementIds: Id[];
}

/**
 * Explicitly invoked, read-only analysis of the current state.
 * Returns observations; never changes or "fixes" anything.
 */
export function runDiagnostics(doc: DocumentState): Diagnostic[] {
  const out: Diagnostic[] = [];
  let n = 0;
  const push = (d: Omit<Diagnostic, 'id'>) => out.push({ ...d, id: `d${++n}` });

  // Invalid reference targets.
  for (const v of Object.values(doc.variables)) {
    if (v.value.kind === 'ref' && !doc.objects[v.value.targetId]) {
      push({ code: 'dangling-reference', severity: 'error', message: `${v.name} references a deleted object (${v.value.targetId})`, elementIds: [v.id] });
    }
  }
  for (const o of Object.values(doc.objects)) {
    for (const s of o.slots) {
      if (s.value.kind === 'ref' && !doc.objects[s.value.targetId]) {
        push({
          code: 'dangling-reference',
          severity: 'error',
          message: `${describeRefSource(doc, { kind: 'slot', objectId: o.id, slotId: s.id })} references a deleted object`,
          elementIds: [o.id],
        });
      }
    }
  }

  // Duplicate variable names in the same scope; variables in missing scopes.
  const byScope = new Map<Id, Map<string, Id[]>>();
  for (const v of Object.values(doc.variables)) {
    if (v.scopeId !== GLOBAL_SCOPE_ID && !doc.frames[v.scopeId]) {
      push({ code: 'missing-scope', severity: 'error', message: `${v.name} belongs to a scope that no longer exists`, elementIds: [v.id] });
    }
    const m = byScope.get(v.scopeId) ?? new Map<string, Id[]>();
    m.set(v.name, [...(m.get(v.name) ?? []), v.id]);
    byScope.set(v.scopeId, m);
  }
  for (const [scopeId, names] of byScope) {
    for (const [name, ids] of names) {
      if (ids.length > 1) {
        push({
          code: 'duplicate-variable',
          severity: 'error',
          message: `${ids.length} variables named "${name}" in scope ${scopeName(doc, scopeId)}`,
          elementIds: ids,
        });
      }
    }
  }

  // Uninitialized variables (live scopes) and out-of-scope locals.
  for (const v of Object.values(doc.variables)) {
    if (!isScopeLive(doc, v.scopeId)) {
      if (doc.frames[v.scopeId]) {
        push({
          code: 'out-of-scope',
          severity: 'info',
          message: `${v.name} belongs to returned frame ${scopeName(doc, v.scopeId)} and is out of scope`,
          elementIds: [v.id],
        });
      }
      continue;
    }
    if (v.value.kind === 'uninitialized') {
      push({ code: 'uninitialized-variable', severity: 'warning', message: `${v.name} is declared but not initialized`, elementIds: [v.id] });
    }
  }

  // Null and uninitialized fields.
  for (const o of Object.values(doc.objects)) {
    for (const s of o.slots) {
      const where = describeRefSource(doc, { kind: 'slot', objectId: o.id, slotId: s.id });
      if (s.value.kind === 'null' && s.kind !== 'primitive') {
        push({ code: 'null-reference', severity: 'info', message: `${where} is null`, note: 'Often intentional, e.g. the end of a list.', elementIds: [o.id] });
      } else if (s.value.kind === 'uninitialized') {
        push({ code: 'uninitialized-field', severity: 'warning', message: `${where} is uninitialized`, elementIds: [o.id] });
      }
    }
  }
  for (const v of Object.values(doc.variables)) {
    if (v.value.kind === 'null' && isScopeLive(doc, v.scopeId)) {
      push({ code: 'null-reference', severity: 'info', message: `${v.name} is null`, elementIds: [v.id] });
    }
  }

  // Cycles in the object graph (any reference slot).
  for (const cycle of findCycles(doc)) {
    push({
      code: 'cycle',
      severity: 'info',
      message: `Circular reference: ${cycle.map((id) => objectLabel(doc, id)).join(' → ')} → ${objectLabel(doc, cycle[0])}`,
      note: 'Cycles can be intentional (graphs, circular lists) or a bug (lost list termination).',
      elementIds: cycle,
    });
  }

  // Unreachable objects.
  const reachable = reachableObjectIds(doc);
  for (const o of Object.values(doc.objects)) {
    if (!reachable.has(o.id)) {
      push({
        code: 'unreachable',
        severity: 'info',
        message: `${objectLabel(doc, o.id)} is not reachable from any live variable`,
        note: 'May be intentional in an intermediate state. DataCanvas never garbage-collects it.',
        elementIds: [o.id],
      });
    }
  }

  // Structure invariants.
  for (const o of Object.values(doc.objects)) {
    if (o.kind === 'container' && o.flavor === 'set') {
      for (let i = 0; i < o.slots.length; i++) {
        for (let j = i + 1; j < o.slots.length; j++) {
          const a = o.slots[i].value;
          const b = o.slots[j].value;
          if (a.kind !== 'uninitialized' && valuesEqual(a, b)) {
            push({ code: 'set-duplicate', severity: 'warning', message: `${objectLabel(doc, o.id)} contains ${formatValue(a, doc)} twice`, elementIds: [o.id] });
          }
        }
      }
    }
  }

  const order: Record<DiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Finds elementary cycles reachable through reference slots (one representative per strongly connected loop). */
export function findCycles(doc: DocumentState): Id[][] {
  const cycles: Id[][] = [];
  const state = new Map<Id, 0 | 1 | 2>();
  const stack: Id[] = [];
  const seenCycleKeys = new Set<string>();

  const visit = (id: Id) => {
    state.set(id, 1);
    stack.push(id);
    const o = doc.objects[id];
    for (const s of o?.slots ?? []) {
      if (s.value.kind !== 'ref' || !doc.objects[s.value.targetId]) continue;
      const t = s.value.targetId;
      const st = state.get(t) ?? 0;
      if (st === 0) visit(t);
      else if (st === 1) {
        const cyc = stack.slice(stack.indexOf(t));
        const key = [...cyc].sort().join(',');
        if (!seenCycleKeys.has(key)) {
          seenCycleKeys.add(key);
          cycles.push(cyc);
        }
      }
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const id of Object.keys(doc.objects)) if ((state.get(id) ?? 0) === 0) visit(id);
  return cycles;
}
