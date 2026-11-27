import type { DocumentState, ExecutionContext, Id, RefSource, Slot, Value, Variable } from './types';
import { GLOBAL_SCOPE_ID } from './types';

/** Read-only helpers over `DocumentState`. None of these mutate. */

export function getSlot(doc: DocumentState, objectId: Id, slotId: Id): Slot | undefined {
  return doc.objects[objectId]?.slots.find((s) => s.id === slotId);
}

export function findSlotByName(doc: DocumentState, objectId: Id, name: string): Slot | undefined {
  return doc.objects[objectId]?.slots.find((s) => s.name === name);
}

export function readRefSource(doc: DocumentState, source: RefSource): Value | undefined {
  if (source.kind === 'variable') return doc.variables[source.variableId]?.value;
  return getSlot(doc, source.objectId, source.slotId)?.value;
}

export function describeRefSource(doc: DocumentState, source: RefSource): string {
  if (source.kind === 'variable') return doc.variables[source.variableId]?.name ?? '<missing variable>';
  const o = doc.objects[source.objectId];
  const slot = getSlot(doc, source.objectId, source.slotId);
  if (!o || !slot) return '<missing slot>';
  const owner = `${o.name ?? o.typeName}@${o.serial}`;
  return o.kind === 'array' || o.kind === 'matrix' ? `${owner}[${slot.name}]` : `${owner}.${slot.name}`;
}

/** The scope new variables are declared in: the top stack frame, else global. */
export function currentScopeId(doc: DocumentState): Id {
  for (let i = doc.callStack.length - 1; i >= 0; i--) {
    const f = doc.frames[doc.callStack[i]];
    if (f && f.status === 'active') return f.id;
  }
  return GLOBAL_SCOPE_ID;
}

export function scopeName(doc: DocumentState, scopeId: Id): string {
  if (scopeId === GLOBAL_SCOPE_ID) return 'global';
  return doc.frames[scopeId]?.name ?? `<missing frame ${scopeId}>`;
}

export function isScopeLive(doc: DocumentState, scopeId: Id): boolean {
  if (scopeId === GLOBAL_SCOPE_ID) return true;
  return doc.frames[scopeId]?.status === 'active';
}

export function variablesInScope(doc: DocumentState, scopeId: Id): Variable[] {
  return Object.values(doc.variables).filter((v) => v.scopeId === scopeId);
}

export function activeContext(doc: DocumentState): ExecutionContext | undefined {
  const id = doc.activeContextPath[doc.activeContextPath.length - 1];
  return id ? doc.contexts[id] : undefined;
}

/** All references stored in the document, keyed by their source. */
export function allReferences(doc: DocumentState): { source: RefSource; targetId: Id }[] {
  const out: { source: RefSource; targetId: Id }[] = [];
  for (const v of Object.values(doc.variables)) {
    if (v.value.kind === 'ref') out.push({ source: { kind: 'variable', variableId: v.id }, targetId: v.value.targetId });
  }
  for (const o of Object.values(doc.objects)) {
    for (const s of o.slots) {
      if (s.value.kind === 'ref') out.push({ source: { kind: 'slot', objectId: o.id, slotId: s.id }, targetId: s.value.targetId });
      if (s.key?.kind === 'ref') out.push({ source: { kind: 'slot', objectId: o.id, slotId: s.id }, targetId: s.key.targetId });
    }
  }
  return out;
}

/** Objects reachable from roots (variables in live scopes, return values of live frames, the marked result). */
export function reachableObjectIds(doc: DocumentState): Set<Id> {
  const roots: Id[] = [];
  for (const v of Object.values(doc.variables)) {
    if (isScopeLive(doc, v.scopeId) && v.value.kind === 'ref') roots.push(v.value.targetId);
  }
  for (const f of Object.values(doc.frames)) {
    if (f.returnValue?.kind === 'ref') roots.push(f.returnValue.targetId);
  }
  if (doc.result?.value.kind === 'ref') roots.push(doc.result.value.targetId);
  const seen = new Set<Id>();
  const stack = [...roots];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    const o = doc.objects[id];
    if (!o) continue;
    seen.add(id);
    for (const s of o.slots) {
      if (s.value.kind === 'ref') stack.push(s.value.targetId);
      if (s.key?.kind === 'ref') stack.push(s.key.targetId);
    }
  }
  return seen;
}

/** Follows a named reference field (default `next`) from a start object. Read-only, cycle-safe. */
export function walkChain(
  doc: DocumentState,
  startId: Id | null,
  fieldName = 'next',
  limit = 10_000,
): { ids: Id[]; end: 'null' | 'uninitialized' | 'cycle' | 'dangling' | 'primitive' | 'missing-field' | 'limit' } {
  const ids: Id[] = [];
  const seen = new Set<Id>();
  let cur: Id | null = startId;
  while (cur !== null) {
    if (seen.has(cur)) return { ids, end: 'cycle' };
    const o = doc.objects[cur];
    if (!o) return { ids, end: 'dangling' };
    if (ids.length >= limit) return { ids, end: 'limit' };
    seen.add(cur);
    ids.push(cur);
    const slot = o.slots.find((s) => s.name === fieldName);
    if (!slot) return { ids, end: 'missing-field' };
    const v = slot.value;
    if (v.kind === 'null') return { ids, end: 'null' };
    if (v.kind === 'uninitialized') return { ids, end: 'uninitialized' };
    if (v.kind !== 'ref') return { ids, end: 'primitive' };
    cur = v.targetId;
  }
  return { ids, end: 'null' };
}

/** The ancestry of a context (outermost first), following lexical parents. */
export function contextAncestry(doc: DocumentState, contextId: Id): Id[] {
  const chain: Id[] = [];
  const seen = new Set<Id>();
  let cur: Id | undefined = contextId;
  while (cur && doc.contexts[cur] && !seen.has(cur)) {
    seen.add(cur);
    chain.unshift(cur);
    cur = doc.contexts[cur].parentId;
  }
  return chain;
}
