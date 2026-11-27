import { enablePatches, produceWithPatches, type Patch } from 'immer';
import { getStructure } from '../model/structures';
import type {
  Annotation,
  DocumentState,
  ExecutionContext,
  HeapObject,
  Id,
  LoopContext,
  Operand,
  RefSource,
  Slot,
  Value,
  Variable,
} from '../model/types';
import { GLOBAL_SCOPE_ID, refSourceKey } from '../model/types';
import { currentScopeId, describeRefSource, getSlot, scopeName } from '../model/queries';
import { cloneValue, formatValue, objectLabel, UNINITIALIZED } from '../model/values';
import { LOOP_PHASES, PHASE_LABELS } from '../execution/loops';
import { describeCondition, describeOperand, readOperand } from '../execution/conditions';
import { CommandError, type Command, type OperationKind, type ValueSource } from './types';

enablePatches();

export interface CommandOutcome {
  description: string;
  ops: OperationKind[];
}

export interface AppliedCommand extends CommandOutcome {
  doc: DocumentState;
  patches: Patch[];
  inversePatches: Patch[];
}

/**
 * Applies a command to a document, returning the new document and reversible
 * patches. Throws `CommandError` for commands that cannot be applied (the
 * document is left untouched in that case).
 */
export function applyCommand(doc: DocumentState, command: Command): AppliedCommand {
  let outcome: CommandOutcome = { description: '', ops: [] };
  const [next, patches, inversePatches] = produceWithPatches(doc, (draft) => {
    outcome = mutate(draft as DocumentState, command);
  });
  return { doc: next, patches, inversePatches, ...outcome };
}

function nextId(d: DocumentState, prefix: string): Id {
  d.seq += 1;
  return `${prefix}${d.seq}`;
}

function requireObject(d: DocumentState, id: Id): HeapObject {
  const o = d.objects[id];
  if (!o) throw new CommandError(`Object ${id} does not exist`);
  return o;
}

function requireVariable(d: DocumentState, id: Id): Variable {
  const v = d.variables[id];
  if (!v) throw new CommandError(`Variable ${id} does not exist`);
  return v;
}

function requireContext(d: DocumentState, id: Id): ExecutionContext {
  const c = d.contexts[id];
  if (!c) throw new CommandError(`Execution context ${id} does not exist`);
  return c;
}

function requireLoop(d: DocumentState, id: Id): LoopContext {
  const c = requireContext(d, id);
  if (c.kind !== 'loop') throw new CommandError(`${c.name} is not a loop`);
  return c;
}

function requireEnteredLoop(d: DocumentState, id: Id): LoopContext {
  const loop = requireLoop(d, id);
  if (!d.activeContextPath.includes(id)) throw new CommandError(`Enter loop "${loop.name}" before operating its controller`);
  return loop;
}

function resolveSource(d: DocumentState, source: ValueSource): Value {
  if (source.kind === 'value') return cloneValue(source.value);
  const read = readOperand(d, source.operand);
  if (!read.ok) throw new CommandError(`Cannot read ${describeOperand(d, source.operand)}: ${read.reason}`);
  return cloneValue(read.value);
}

function describeSource(d: DocumentState, source: ValueSource, value: Value): string {
  if (source.kind === 'value' || source.operand.kind === 'literal') return formatValue(value, d);
  return `${describeOperand(d, source.operand)} (${formatValue(value, d)})`;
}

function writeTarget(d: DocumentState, target: RefSource, value: Value): Value {
  if (target.kind === 'variable') {
    const v = requireVariable(d, target.variableId);
    const prev = v.value;
    v.value = value;
    return prev;
  }
  const o = requireObject(d, target.objectId);
  const slot = o.slots.find((s) => s.id === target.slotId);
  if (!slot) throw new CommandError(`Slot ${target.slotId} does not exist on ${objectLabel(d, o.id)}`);
  if (slot.kind === 'primitive' && value.kind === 'ref') {
    throw new CommandError(`${describeRefSource(d, target)} is a primitive field and cannot hold a reference`);
  }
  if (slot.kind === 'reference' && (value.kind === 'number' || value.kind === 'string' || value.kind === 'boolean')) {
    throw new CommandError(`${describeRefSource(d, target)} is a reference field and cannot hold a primitive`);
  }
  const prev = slot.value;
  slot.value = value;
  return prev;
}

function assignmentKind(prev: Value, value: Value, target: RefSource): OperationKind {
  if (target.kind === 'variable' && prev.kind === 'uninitialized' && value.kind !== 'uninitialized') return 'initialization';
  if (value.kind === 'ref' || prev.kind === 'ref' || value.kind === 'null') return 'reference-change';
  return 'assignment';
}

function findPositioned(d: DocumentState, id: Id): { position: { x: number; y: number } } | undefined {
  return d.objects[id] ?? d.variables[id] ?? d.frames[id] ?? d.contexts[id] ?? d.annotations[id];
}

function makeSlots(d: DocumentState, templates: { name: string; kind: Slot['kind']; value?: Value; key?: Value }[]): Slot[] {
  return templates.map((t) => ({
    id: nextId(d, 's'),
    name: t.name,
    kind: t.kind,
    value: t.value ? cloneValue(t.value) : { ...UNINITIALIZED },
    ...(t.key ? { key: cloneValue(t.key) } : {}),
  }));
}

function resetLoopMetadata(loop: LoopContext): void {
  loop.phase = null;
  loop.iterationsCompleted = 0;
  loop.lastConditionResult = null;
}

export function mutate(d: DocumentState, c: Command): CommandOutcome {
  switch (c.type) {
    case 'createObject': {
      const def = getStructure(c.kind);
      const options = c.options ?? {};
      const id = nextId(d, 'o');
      d.objectSerial += 1;
      const obj: HeapObject = {
        id,
        serial: d.objectSerial,
        kind: c.kind,
        typeName: def.defaultTypeName(options),
        slots: makeSlots(d, def.initialSlots(options)),
        position: { ...c.position },
        appearance: { color: c.color ?? def.defaultColor },
      };
      if (c.name) obj.name = c.name;
      if (c.kind === 'matrix') obj.shape = { rows: Math.max(1, options.rows ?? 3), cols: Math.max(1, options.cols ?? 3) };
      if (c.kind === 'matrix' && obj.shape) obj.shape = { rows: Math.min(24, obj.shape.rows), cols: Math.min(24, obj.shape.cols) };
      if (c.kind === 'container') obj.flavor = options.flavor ?? 'list';
      d.objects[id] = obj;
      return { description: `new ${obj.typeName}() → @${obj.serial}`, ops: ['allocation'] };
    }

    case 'renameObject': {
      const o = requireObject(d, c.objectId);
      const name = c.name.trim();
      if (name) o.name = name;
      else delete o.name;
      return { description: `Label ${o.typeName}@${o.serial} as "${name || '(none)'}"`, ops: ['structure-edit'] };
    }

    case 'setObjectType': {
      const o = requireObject(d, c.objectId);
      const t = c.typeName.trim();
      if (!t) throw new CommandError('Type name cannot be empty');
      o.typeName = t;
      return { description: `Set type of @${o.serial} to ${t}`, ops: ['structure-edit'] };
    }

    case 'addSlot': {
      const o = requireObject(d, c.objectId);
      const def = getStructure(o.kind);
      if (!def.editableSlots) throw new CommandError(`${def.label} slots cannot be added`);
      const name = c.name?.trim() || (o.kind === 'container' ? String(o.slots.length) : `field${o.slots.length + 1}`);
      if (o.kind !== 'container' && o.slots.some((s) => s.name === name)) {
        throw new CommandError(`${objectLabel(d, o.id)} already has a field named "${name}"`);
      }
      const [slot] = makeSlots(d, [{ name, kind: c.slotKind }]);
      if (c.position === 'start') o.slots.unshift(slot);
      else o.slots.push(slot);
      if (o.kind === 'container') renumberContainer(o);
      const where = c.position === 'start' ? 'front' : 'end';
      return {
        description:
          o.kind === 'container' ? `Add slot at ${where} of ${objectLabel(d, o.id)}` : `Add ${c.slotKind} field "${name}" to ${objectLabel(d, o.id)}`,
        ops: ['structure-edit'],
      };
    }

    case 'removeSlot': {
      const o = requireObject(d, c.objectId);
      const def = getStructure(o.kind);
      if (!def.editableSlots) throw new CommandError(`${def.label} slots cannot be removed`);
      const idx = o.slots.findIndex((s) => s.id === c.slotId);
      if (idx === -1) throw new CommandError('Slot does not exist');
      const [removed] = o.slots.splice(idx, 1);
      delete d.nullLinks[refSourceKey({ kind: 'slot', objectId: o.id, slotId: removed.id })];
      if (o.kind === 'container') renumberContainer(o);
      return { description: `Remove ${o.kind === 'container' ? 'slot' : `field "${removed.name}"`} from ${objectLabel(d, o.id)}`, ops: ['structure-edit'] };
    }

    case 'renameSlot': {
      const o = requireObject(d, c.objectId);
      if (getStructure(o.kind).indexedSlots || o.kind === 'container') throw new CommandError('Indexed slots cannot be renamed');
      const slot = o.slots.find((s) => s.id === c.slotId);
      if (!slot) throw new CommandError('Slot does not exist');
      const name = c.name.trim();
      if (!name) throw new CommandError('Field name cannot be empty');
      if (o.slots.some((s) => s.name === name && s.id !== slot.id)) throw new CommandError(`Field "${name}" already exists`);
      const old = slot.name;
      slot.name = name;
      return { description: `Rename field ${old} → ${name} on ${objectLabel(d, o.id)}`, ops: ['structure-edit'] };
    }

    case 'setSlotKey': {
      const o = requireObject(d, c.objectId);
      const slot = o.slots.find((s) => s.id === c.slotId);
      if (!slot) throw new CommandError('Slot does not exist');
      slot.key = cloneValue(c.key);
      return { description: `Set key of ${objectLabel(d, o.id)} entry to ${formatValue(c.key, d)}`, ops: ['assignment'] };
    }

    case 'declareVariable': {
      const name = c.name.trim();
      if (!name) throw new CommandError('Variable name cannot be empty');
      const scopeId = c.scopeId ?? currentScopeId(d);
      if (scopeId !== GLOBAL_SCOPE_ID && !d.frames[scopeId]) throw new CommandError('Scope does not exist');
      const id = nextId(d, 'v');
      const variable: Variable = {
        id,
        name,
        value: c.initialValue ? cloneValue(c.initialValue) : { ...UNINITIALIZED },
        scopeId,
        position: { ...c.position },
      };
      const t = c.declaredType?.trim();
      if (t) variable.declaredType = t;
      d.variables[id] = variable;
      const decl = `${t ? t + ' ' : ''}${name}`;
      const ops: OperationKind[] = ['declaration'];
      if (c.initialValue && c.initialValue.kind !== 'uninitialized') ops.push('initialization');
      return {
        description: `Declare ${decl}${c.initialValue && c.initialValue.kind !== 'uninitialized' ? ` = ${formatValue(c.initialValue, d)}` : ''} in ${scopeName(d, scopeId)}`,
        ops,
      };
    }

    case 'initializeVariable': {
      const v = requireVariable(d, c.variableId);
      if (v.value.kind !== 'uninitialized') throw new CommandError(`${v.name} is already initialized — use an assignment instead`);
      const value = resolveSource(d, c.source);
      if (value.kind === 'uninitialized') throw new CommandError('Cannot initialize a variable with an uninitialized value');
      v.value = value;
      return { description: `Initialize ${v.name} = ${describeSource(d, c.source, value)}`, ops: ['initialization'] };
    }

    case 'renameVariable': {
      const v = requireVariable(d, c.variableId);
      const name = c.name.trim();
      if (!name) throw new CommandError('Variable name cannot be empty');
      const old = v.name;
      v.name = name;
      return { description: `Rename variable ${old} → ${name}`, ops: ['definition'] };
    }

    case 'setVariableType': {
      const v = requireVariable(d, c.variableId);
      const t = c.declaredType.trim();
      if (t) v.declaredType = t;
      else delete v.declaredType;
      return { description: `Set declared type of ${v.name} to ${t || '(none)'}`, ops: ['definition'] };
    }

    case 'assignValue': {
      const value = resolveSource(d, c.source);
      const label = describeRefSource(d, c.target);
      const prev = writeTarget(d, c.target, value);
      delete d.nullLinks[refSourceKey(c.target)];
      return { description: `${label} = ${describeSource(d, c.source, value)}`, ops: [assignmentKind(prev, value, c.target)] };
    }

    case 'setReference': {
      const label = describeRefSource(d, c.source);
      let value: Value;
      if (c.target.kind === 'object') {
        requireObject(d, c.target.objectId);
        value = { kind: 'ref', targetId: c.target.objectId };
      } else if (c.target.kind === 'null') {
        value = { kind: 'null' };
      } else {
        value = { ...UNINITIALIZED };
      }
      const prev = writeTarget(d, c.source, value);
      const key = refSourceKey(c.source);
      if (c.target.kind === 'null' && c.target.markerId && d.annotations[c.target.markerId]) d.nullLinks[key] = c.target.markerId;
      else delete d.nullLinks[key];
      const prevText = prev.kind === 'ref' ? ` (was ${formatValue(prev, d)})` : prev.kind === 'null' ? ' (was null)' : '';
      const ops: OperationKind[] = [
        c.source.kind === 'variable' && prev.kind === 'uninitialized' && value.kind !== 'uninitialized' ? 'initialization' : 'reference-change',
      ];
      return { description: `${label} = ${formatValue(value, d)}${prevText}`, ops };
    }

    case 'createContext': {
      const id = nextId(d, 'c');
      const spec = c.spec;
      const parentId = spec.parentId && d.contexts[spec.parentId] ? spec.parentId : undefined;
      const base = { id, name: spec.name.trim() || id, status: 'idle' as const, position: { ...c.position }, ...(parentId ? { parentId } : {}) };
      let ctx: ExecutionContext;
      if (spec.kind === 'loop') {
        ctx = {
          ...base,
          kind: 'loop',
          loopType: spec.loopType,
          phases: [...LOOP_PHASES[spec.loopType]],
          phase: null,
          iterationsCompleted: 0,
          lastConditionResult: null,
        };
      } else if (spec.kind === 'condition') {
        ctx = { ...base, kind: 'condition', result: null, branch: null };
      } else {
        ctx = {
          ...base,
          kind: 'method',
          methodName: spec.methodName.trim() || 'method',
          parameters: spec.parameters.map((p) => ({ ...p })),
          ...(spec.returnType ? { returnType: spec.returnType } : {}),
        };
      }
      d.contexts[id] = ctx;
      const what = ctx.kind === 'loop' ? `${ctx.loopType} loop` : ctx.kind === 'condition' ? 'condition' : 'method';
      return { description: `Create ${what} "${ctx.name}"`, ops: ['definition'] };
    }

    case 'updateContext': {
      const ctx = requireContext(d, c.contextId);
      const p = c.patch;
      const changes: string[] = [];
      if (p.name !== undefined) {
        ctx.name = p.name.trim() || ctx.name;
        changes.push(`name "${ctx.name}"`);
      }
      if (p.parentId !== undefined) {
        if (p.parentId === null) delete ctx.parentId;
        else {
          if (!d.contexts[p.parentId]) throw new CommandError('Parent context does not exist');
          let cur: Id | undefined = p.parentId;
          while (cur) {
            if (cur === ctx.id) throw new CommandError('A context cannot be nested inside itself');
            cur = d.contexts[cur]?.parentId;
          }
          ctx.parentId = p.parentId;
        }
        changes.push('parent');
      }
      if (p.condition !== undefined && (ctx.kind === 'loop' || ctx.kind === 'condition')) {
        if (p.condition === null) delete ctx.condition;
        else ctx.condition = structuredClone(p.condition);
        changes.push(`condition ${describeCondition(d, ctx.condition)}`);
      }
      if (ctx.kind === 'loop') {
        if (p.loopType !== undefined) {
          ctx.loopType = p.loopType;
          ctx.phases = [...LOOP_PHASES[p.loopType]];
          if (ctx.phase && !ctx.phases.includes(ctx.phase)) ctx.phase = null;
          changes.push(`type ${p.loopType}`);
        }
        if (p.phases !== undefined) {
          if (p.phases.length === 0) throw new CommandError('A loop needs at least one phase');
          ctx.phases = [...new Set(p.phases)];
          changes.push('phase arrangement');
        }
      }
      if (ctx.kind === 'method') {
        if (p.methodName !== undefined) ctx.methodName = p.methodName.trim() || ctx.methodName;
        if (p.parameters !== undefined) ctx.parameters = p.parameters.map((x) => ({ ...x }));
        if (p.returnType !== undefined) {
          if (p.returnType.trim()) ctx.returnType = p.returnType.trim();
          else delete ctx.returnType;
        }
        if (p.methodName !== undefined || p.parameters !== undefined || p.returnType !== undefined) changes.push('signature');
      }
      return { description: `Edit ${ctx.name}: ${changes.join(', ') || 'no changes'}`, ops: ['definition'] };
    }

    case 'enterContext': {
      const ctx = requireContext(d, c.contextId);
      if (d.activeContextPath.includes(ctx.id)) throw new CommandError(`"${ctx.name}" is already entered`);
      d.activeContextPath.push(ctx.id);
      ctx.status = 'active';
      if (ctx.kind === 'loop') resetLoopMetadata(ctx);
      if (ctx.kind === 'condition') {
        ctx.result = null;
        ctx.branch = null;
      }
      return { description: `Enter ${ctx.kind} "${ctx.name}"`, ops: ['context-enter'] };
    }

    case 'exitContext': {
      const ctx = requireContext(d, c.contextId);
      const idx = d.activeContextPath.indexOf(ctx.id);
      if (idx === -1) throw new CommandError(`"${ctx.name}" is not entered`);
      const popped = d.activeContextPath.splice(idx);
      for (const id of popped) {
        const p = d.contexts[id];
        if (p) p.status = 'exited';
      }
      const inner = popped.length > 1 ? ` (and ${popped.length - 1} inner context${popped.length > 2 ? 's' : ''})` : '';
      return { description: `Exit ${ctx.kind} "${ctx.name}"${inner}`, ops: ['context-exit'] };
    }

    case 'changePhase': {
      const loop = requireEnteredLoop(d, c.contextId);
      const from = loop.phase;
      loop.phase = c.phase;
      if (c.phase === 'condition') loop.lastConditionResult = null;
      return {
        description: `${loop.name}: ${from ? PHASE_LABELS[from] : 'start'} → ${PHASE_LABELS[c.phase]}`,
        ops: ['phase-change'],
      };
    }

    case 'recordConditionResult': {
      const ctx = requireContext(d, c.contextId);
      if (!d.activeContextPath.includes(ctx.id)) throw new CommandError(`Enter "${ctx.name}" before choosing its condition result`);
      if (ctx.kind === 'loop') ctx.lastConditionResult = c.result;
      else if (ctx.kind === 'condition') ctx.result = c.result;
      else throw new CommandError('Methods have no condition');
      const cond = ctx.kind === 'loop' || ctx.kind === 'condition' ? describeCondition(d, ctx.condition) : '';
      return { description: `${ctx.name}: you decided (${cond}) is ${c.result ? 'TRUE' : 'FALSE'}`, ops: ['condition-check'] };
    }

    case 'chooseBranch': {
      const ctx = requireContext(d, c.contextId);
      if (ctx.kind !== 'condition') throw new CommandError('Only conditions have branches');
      if (!d.activeContextPath.includes(ctx.id)) throw new CommandError(`Enter "${ctx.name}" first`);
      ctx.branch = c.branch;
      return { description: `${ctx.name}: take ${c.branch === 'then' ? 'THEN' : 'ELSE'} branch`, ops: ['phase-change'] };
    }

    case 'completeIteration': {
      const loop = requireEnteredLoop(d, c.contextId);
      loop.iterationsCompleted += 1;
      return { description: `${loop.name}: complete iteration #${loop.iterationsCompleted}`, ops: ['iteration'] };
    }

    case 'breakLoop': {
      const loop = requireEnteredLoop(d, c.contextId);
      loop.phase = 'exit';
      return { description: `${loop.name}: break`, ops: ['break'] };
    }

    case 'continueLoop': {
      const loop = requireEnteredLoop(d, c.contextId);
      const target = loop.phases.includes('update') && loop.loopType !== 'while' ? 'update' : 'condition';
      loop.phase = target;
      if (target === 'condition') loop.lastConditionResult = null;
      return { description: `${loop.name}: continue → ${PHASE_LABELS[target]}`, ops: ['continue'] };
    }

    case 'recordComparison': {
      return {
        description: `Compare ${describeOperand(d, c.left)} ${c.operator} ${describeOperand(d, c.right)}: you decided ${c.result ? 'TRUE' : 'FALSE'}`,
        ops: ['comparison'],
      };
    }

    case 'createStackFrame': {
      const method = c.methodId ? d.contexts[c.methodId] : undefined;
      if (c.methodId && (!method || method.kind !== 'method')) throw new CommandError('Method does not exist');
      const id = nextId(d, 'f');
      const caller = currentScopeId(d);
      d.frames[id] = {
        id,
        name: c.name.trim() || (method?.kind === 'method' ? `${method.methodName}()` : `frame ${id}`),
        status: 'active',
        position: { ...c.position },
        ...(c.methodId ? { methodId: c.methodId } : {}),
        ...(caller !== GLOBAL_SCOPE_ID ? { callerFrameId: caller } : {}),
      };
      d.callStack.push(id);
      const ops: OperationKind[] = ['method-call'];
      if (c.declareParameters && method?.kind === 'method') {
        method.parameters.forEach((p, i) => {
          const vid = nextId(d, 'v');
          d.variables[vid] = {
            id: vid,
            name: p.name,
            value: { ...UNINITIALIZED },
            scopeId: id,
            position: { x: c.position.x + 10 + i * 130, y: c.position.y + 120 },
            ...(p.type ? { declaredType: p.type } : {}),
          };
          ops.push('declaration');
        });
      }
      return { description: `Push stack frame ${d.frames[id].name}`, ops };
    }

    case 'setReturnValue': {
      const f = d.frames[c.frameId];
      if (!f) throw new CommandError('Frame does not exist');
      const value = resolveSource(d, c.source);
      f.returnValue = value;
      return { description: `${f.name}: return value = ${describeSource(d, c.source, value)}`, ops: ['return'] };
    }

    case 'exitFrame': {
      const f = d.frames[c.frameId];
      if (!f) throw new CommandError('Frame does not exist');
      const top = d.callStack[d.callStack.length - 1];
      if (top !== f.id) throw new CommandError(`Only the top stack frame can be exited (top is ${top ? d.frames[top]?.name : 'global'})`);
      d.callStack.pop();
      f.status = 'returned';
      const rv = f.returnValue ? ` returning ${formatValue(f.returnValue, d)}` : '';
      return { description: `Pop stack frame ${f.name}${rv}`, ops: ['return'] };
    }

    case 'markResult': {
      const value = resolveSource(d, c.source);
      d.result = { value, sourceLabel: c.label };
      return { description: `Identify result: ${c.label} (${formatValue(value, d)})`, ops: ['result'] };
    }

    case 'clearResult': {
      d.result = null;
      return { description: 'Clear identified result', ops: ['result'] };
    }

    case 'captureInput': {
      const read = readOperand(d, c.head);
      if (!read.ok) throw new CommandError(`Cannot read ${describeOperand(d, c.head)}: ${read.reason}`);
      const field = c.fieldName ?? 'next';
      const headId = read.value.kind === 'ref' ? read.value.targetId : null;
      if (read.value.kind !== 'ref' && read.value.kind !== 'null') throw new CommandError('Input head must be a reference or null');
      const ids: Id[] = [];
      const values: Value[] = [];
      const seen = new Set<Id>();
      let cur = headId;
      let terminated = true;
      while (cur) {
        if (seen.has(cur) || !d.objects[cur]) {
          terminated = false;
          break;
        }
        seen.add(cur);
        const o = d.objects[cur];
        ids.push(cur);
        const valSlot = o.slots.find((s) => s.name === 'val') ?? o.slots.find((s) => s.kind !== 'reference');
        values.push(valSlot ? cloneValue(valSlot.value) : { ...UNINITIALIZED });
        const nxt = o.slots.find((s) => s.name === field)?.value;
        if (!nxt || nxt.kind === 'null') break;
        if (nxt.kind !== 'ref') {
          terminated = false;
          break;
        }
        cur = nxt.targetId;
      }
      d.capturedInput = { headId, nodeIds: ids, values, terminated };
      return { description: `Capture challenge input from ${describeOperand(d, c.head)} (${ids.length} nodes)`, ops: ['definition'] };
    }

    case 'moveElements': {
      let moved = 0;
      for (const m of c.moves) {
        const el = findPositioned(d, m.id);
        if (!el) continue;
        el.position = { x: m.to.x, y: m.to.y };
        moved += 1;
      }
      return { description: `Move ${moved} element${moved === 1 ? '' : 's'}`, ops: ['visual'] };
    }

    case 'setColor': {
      for (const id of c.ids) {
        const o = d.objects[id];
        if (o) o.appearance.color = c.color;
        const a = d.annotations[id];
        if (a && a.kind !== 'nullMarker') a.color = c.color;
      }
      return { description: `Recolor ${c.ids.length} element(s) ${c.color}`, ops: ['visual'] };
    }

    case 'setIndexBinding': {
      const v = requireVariable(d, c.variableId);
      if (c.arrayId) {
        requireObject(d, c.arrayId);
        v.indexInto = c.arrayId;
      } else delete v.indexInto;
      return { description: `Show ${v.name} as ${c.arrayId ? `index into ${objectLabel(d, c.arrayId)}` : 'plain variable'}`, ops: ['visual'] };
    }

    case 'createAnnotation': {
      const id = nextId(d, 'a');
      d.annotations[id] = { ...structuredClone(c.annotation), id } as Annotation;
      const label = c.annotation.kind === 'nullMarker' ? 'null marker' : c.annotation.kind;
      return { description: `Add ${label} annotation`, ops: [c.annotation.kind === 'nullMarker' ? 'visual' : 'annotation'] };
    }

    case 'updateAnnotation': {
      const a = d.annotations[c.annotationId];
      if (!a) throw new CommandError('Annotation does not exist');
      if (a.kind === 'text' && c.patch.text !== undefined) a.text = c.patch.text;
      if (a.kind === 'group') {
        if (c.patch.label !== undefined) a.label = c.patch.label;
        if (c.patch.memberIds !== undefined) a.memberIds = [...c.patch.memberIds];
      }
      return { description: `Edit ${a.kind} annotation`, ops: ['annotation'] };
    }

    case 'deleteElements':
      return deleteElements(d, c.ids);

    case 'paste':
      return paste(d, c.payload, c.offset);

    case 'batch': {
      const ops: OperationKind[] = [];
      for (const sub of c.commands) ops.push(...mutate(d, sub).ops);
      return { description: c.label, ops };
    }
  }
}

function renumberContainer(o: HeapObject): void {
  o.slots.forEach((s, i) => {
    s.name = String(i);
  });
}

function deleteElements(d: DocumentState, ids: Id[]): CommandOutcome {
  const removed: string[] = [];
  const ops: OperationKind[] = [];
  const idSet = new Set(ids);
  for (const id of ids) {
    if (d.objects[id]) {
      removed.push(objectLabel(d, id));
      delete d.objects[id];
      for (const k of Object.keys(d.nullLinks)) if (k.startsWith(`s:${id}:`)) delete d.nullLinks[k];
      ops.push('deletion');
    } else if (d.variables[id]) {
      removed.push(`variable ${d.variables[id].name}`);
      delete d.nullLinks[`v:${id}`];
      delete d.variables[id];
      ops.push('deletion');
    } else if (d.frames[id]) {
      const f = d.frames[id];
      removed.push(`frame ${f.name}`);
      for (const v of Object.values(d.variables)) if (v.scopeId === id && !idSet.has(v.id)) delete d.variables[v.id];
      d.callStack = d.callStack.filter((x) => x !== id);
      delete d.frames[id];
      ops.push('deletion');
    } else if (d.contexts[id]) {
      const ctx = d.contexts[id];
      removed.push(`${ctx.kind} ${ctx.name}`);
      for (const other of Object.values(d.contexts)) {
        if (other.parentId === id) {
          if (ctx.parentId) other.parentId = ctx.parentId;
          else delete other.parentId;
        }
      }
      for (const f of Object.values(d.frames)) if (f.methodId === id) delete f.methodId;
      d.activeContextPath = d.activeContextPath.filter((x) => x !== id);
      delete d.contexts[id];
      ops.push('deletion');
    } else if (d.annotations[id]) {
      const a = d.annotations[id];
      removed.push(a.kind === 'nullMarker' ? 'null marker' : `${a.kind} annotation`);
      delete d.annotations[id];
      ops.push(a.kind === 'nullMarker' ? 'visual' : 'annotation');
    }
  }
  if (removed.length === 0) throw new CommandError('Nothing to delete');
  for (const a of Object.values(d.annotations)) {
    if (a.kind === 'group') a.memberIds = a.memberIds.filter((m) => !idSet.has(m));
  }
  for (const [k, marker] of Object.entries(d.nullLinks)) if (idSet.has(marker)) delete d.nullLinks[k];
  for (const v of Object.values(d.variables)) if (v.indexInto && idSet.has(v.indexInto)) delete v.indexInto;
  const onlyVisual = ops.every((o) => o === 'visual' || o === 'annotation');
  return { description: `Delete ${removed.join(', ')}`, ops: onlyVisual ? ops : ops.filter((o) => o === 'deletion') };
}

function paste(d: DocumentState, payload: { objects: HeapObject[]; variables: Variable[]; annotations: Annotation[] }, offset: { x: number; y: number }): CommandOutcome {
  const idMap = new Map<Id, Id>();
  const shift = (p: { x: number; y: number }) => ({ x: p.x + offset.x, y: p.y + offset.y });
  for (const o of payload.objects) idMap.set(o.id, nextId(d, 'o'));
  const remap = (v: Value): Value => (v.kind === 'ref' && idMap.has(v.targetId) ? { kind: 'ref', targetId: idMap.get(v.targetId)! } : cloneValue(v));
  const ops: OperationKind[] = [];
  for (const o of payload.objects) {
    d.objectSerial += 1;
    const id = idMap.get(o.id)!;
    d.objects[id] = {
      ...structuredClone(o),
      id,
      serial: d.objectSerial,
      position: shift(o.position),
      slots: o.slots.map((s) => ({
        id: nextId(d, 's'),
        name: s.name,
        kind: s.kind,
        value: remap(s.value),
        ...(s.key ? { key: remap(s.key) } : {}),
      })),
    };
    ops.push('allocation');
  }
  const scope = currentScopeId(d);
  for (const v of payload.variables) {
    const id = nextId(d, 'v');
    d.variables[id] = {
      ...structuredClone(v),
      id,
      scopeId: scope,
      value: remap(v.value),
      position: shift(v.position),
      ...(v.indexInto ? { indexInto: idMap.get(v.indexInto) ?? v.indexInto } : {}),
    };
    ops.push('declaration');
  }
  for (const a of payload.annotations) {
    if (a.kind === 'group') continue;
    const id = nextId(d, 'a');
    d.annotations[id] = { ...structuredClone(a), id, position: shift(a.position) };
    ops.push('annotation');
  }
  const n = payload.objects.length + payload.variables.length + payload.annotations.length;
  return { description: `Paste ${n} element${n === 1 ? '' : 's'} (new identities)`, ops };
}

export function getSlotOrThrow(d: DocumentState, objectId: Id, slotId: Id): Slot {
  const s = getSlot(d, objectId, slotId);
  if (!s) throw new CommandError('Slot does not exist');
  return s;
}

export function operandFromSource(source: RefSource): Operand {
  return source.kind === 'variable'
    ? { kind: 'variable', variableId: source.variableId }
    : { kind: 'objectSlot', objectId: source.objectId, slotId: source.slotId };
}
