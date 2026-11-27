import type { Command } from '../../core/commands/types';
import type { ContainerFlavor, Id, LoopType, MethodParameter, Point, RefSource, SlotKind } from '../../core/model/types';
import { GLOBAL_SCOPE_ID } from '../../core/model/types';
import { currentScopeId, describeRefSource, readRefSource } from '../../core/model/queries';
import { objectLabel, parseLiteral } from '../../core/model/values';
import { openConfirm, openForm } from '../../stores/dialogStore';
import { dispatch, useProjectStore } from '../../stores/projectStore';
import { useUiStore, type ToolId } from '../../stores/uiStore';
import { LOOP_TYPE_LABELS } from '../../core/execution/loops';

const doc = () => useProjectStore.getState().doc;

function contextParentOptions() {
  const d = doc();
  const active = d.activeContextPath[d.activeContextPath.length - 1];
  return {
    defaultValue: active ?? '',
    options: [{ value: '', label: '(top level)' }, ...Object.values(d.contexts).map((c) => ({ value: c.id, label: `${c.name} (${c.kind})` }))],
  };
}

function scopeOptions() {
  const d = doc();
  const opts = [{ value: GLOBAL_SCOPE_ID, label: 'global' }];
  for (const id of d.callStack) {
    const f = d.frames[id];
    if (f && f.status === 'active') opts.push({ value: f.id, label: `frame ${f.name}` });
  }
  return { options: opts.reverse(), defaultValue: currentScopeId(d) };
}

export function parseParameters(text: string): MethodParameter[] {
  return text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [a, b] = p.split(':').map((x) => x.trim());
      if (b) return { name: a, type: b };
      const parts = p.split(/\s+/);
      return parts.length === 2 ? { name: parts[1], type: parts[0] } : { name: p };
    });
}

/** Creates an element for a creation tool at a canvas position. Never creates anything the user didn't ask for. */
export function createWithTool(tool: ToolId, at: Point): void {
  switch (tool) {
    case 'node':
      dispatch({ type: 'createObject', kind: 'node', position: at });
      return;
    case 'null':
      dispatch({ type: 'createAnnotation', annotation: { kind: 'nullMarker', position: at } });
      return;
    case 'text': {
      if (dispatch({ type: 'createAnnotation', annotation: { kind: 'text', position: at, text: 'Note', color: 'slate' } })) {
        useUiStore.getState().setTool('select');
        useUiStore.getState().setEditingText(`a${doc().seq}`);
      }
      return;
    }
    case 'object':
      openForm({
        title: 'Create object',
        description: 'A generic object with fields you define. Fields start uninitialized.',
        fields: [
          { name: 'typeName', label: 'Type name', type: 'text', defaultValue: 'Object', required: true },
          { name: 'primitive', label: 'Primitive fields', type: 'text', placeholder: 'e.g. val, count', hint: 'Comma-separated' },
          { name: 'reference', label: 'Reference fields', type: 'text', placeholder: 'e.g. left, right', hint: 'Comma-separated' },
        ],
        onSubmit: (v) => {
          const split = (s: unknown) =>
            String(s ?? '')
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean);
          const fields: { name: string; kind: SlotKind }[] = [
            ...split(v.primitive).map((name) => ({ name, kind: 'primitive' as const })),
            ...split(v.reference).map((name) => ({ name, kind: 'reference' as const })),
          ];
          const names = fields.map((f) => f.name);
          if (new Set(names).size !== names.length) return 'Field names must be unique';
          dispatch({ type: 'createObject', kind: 'object', position: at, options: { typeName: String(v.typeName), fields } });
        },
      });
      return;
    case 'variable': {
      const scope = scopeOptions();
      openForm({
        title: 'Declare variable',
        description: 'The variable starts uninitialized unless you enter an initial value.',
        fields: [
          { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. head' },
          { name: 'type', label: 'Declared type (optional)', type: 'text', placeholder: 'e.g. ListNode, int' },
          { name: 'scope', label: 'Scope', type: 'select', options: scope.options, defaultValue: scope.defaultValue },
          { name: 'initial', label: 'Initial value (optional)', type: 'text', placeholder: 'leave empty = uninitialized; e.g. 0, null', hint: 'References are assigned afterwards by dragging from the variable’s handle.' },
        ],
        submitLabel: 'Declare',
        onSubmit: (v) => {
          const initial = parseLiteral(String(v.initial ?? ''));
          const ok = dispatch({
            type: 'declareVariable',
            name: String(v.name),
            declaredType: String(v.type ?? ''),
            scopeId: String(v.scope),
            position: at,
            ...(initial.kind !== 'uninitialized' ? { initialValue: initial } : {}),
          });
          return ok ? undefined : 'Could not declare variable';
        },
      });
      return;
    }
    case 'array':
      openForm({
        title: 'Create array',
        description: 'All cells start uninitialized. Index variables are separate variables you declare and move yourself.',
        fields: [
          { name: 'length', label: 'Length', type: 'number', defaultValue: 5, min: 1, max: 64 },
          { name: 'typeName', label: 'Type', type: 'text', defaultValue: 'int[]' },
        ],
        onSubmit: (v) => {
          dispatch({ type: 'createObject', kind: 'array', position: at, options: { length: Number(v.length), typeName: String(v.typeName || 'int[]') } });
        },
      });
      return;
    case 'matrix':
      openForm({
        title: 'Create matrix',
        fields: [
          { name: 'rows', label: 'Rows', type: 'number', defaultValue: 3, min: 1, max: 24 },
          { name: 'cols', label: 'Columns', type: 'number', defaultValue: 3, min: 1, max: 24 },
          { name: 'typeName', label: 'Type', type: 'text', defaultValue: 'int[][]' },
        ],
        onSubmit: (v) => {
          dispatch({ type: 'createObject', kind: 'matrix', position: at, options: { rows: Number(v.rows), cols: Number(v.cols), typeName: String(v.typeName || 'int[][]') } });
        },
      });
      return;
    case 'container':
      openForm({
        title: 'Create container',
        description: 'A growable collection. You add, remove and order entries yourself — the app never enforces stack/queue/set rules.',
        fields: [
          {
            name: 'flavor',
            label: 'Kind',
            type: 'select',
            options: (['list', 'stack', 'queue', 'deque', 'set', 'map'] as ContainerFlavor[]).map((f) => ({ value: f, label: f })),
          },
          { name: 'typeName', label: 'Type name (optional)', type: 'text', placeholder: 'e.g. Stack<ListNode>' },
        ],
        onSubmit: (v) => {
          const typeName = String(v.typeName ?? '').trim();
          dispatch({ type: 'createObject', kind: 'container', position: at, options: { flavor: v.flavor as ContainerFlavor, ...(typeName ? { typeName } : {}) } });
        },
      });
      return;
    case 'loop': {
      const parents = contextParentOptions();
      openForm({
        title: 'Create loop context',
        description: 'A loop is execution metadata only. It never runs, counts or evaluates anything by itself.',
        fields: [
          { name: 'name', label: 'Name', type: 'text', defaultValue: 'loop', required: true },
          {
            name: 'loopType',
            label: 'Loop type',
            type: 'select',
            options: (['while', 'for', 'do-while', 'custom'] as LoopType[]).map((t) => ({ value: t, label: LOOP_TYPE_LABELS[t] })),
          },
          { name: 'parent', label: 'Nested inside', type: 'select', ...parents },
        ],
        onSubmit: (v) => {
          dispatch({
            type: 'createContext',
            spec: { kind: 'loop', name: String(v.name), loopType: v.loopType as LoopType, ...(v.parent ? { parentId: String(v.parent) } : {}) },
            position: at,
          });
          selectNewestContext();
        },
      });
      return;
    }
    case 'condition': {
      const parents = contextParentOptions();
      openForm({
        title: 'Create condition (if / else)',
        fields: [
          { name: 'name', label: 'Name', type: 'text', defaultValue: 'if', required: true },
          { name: 'parent', label: 'Nested inside', type: 'select', ...parents },
        ],
        onSubmit: (v) => {
          dispatch({ type: 'createContext', spec: { kind: 'condition', name: String(v.name), ...(v.parent ? { parentId: String(v.parent) } : {}) }, position: at });
          selectNewestContext();
        },
      });
      return;
    }
    case 'method': {
      openForm({
        title: 'Create method',
        description: 'Defines a method signature. Calling it (pushing a stack frame) is a separate, explicit action.',
        fields: [
          { name: 'methodName', label: 'Method name', type: 'text', required: true, placeholder: 'e.g. reverseList' },
          { name: 'params', label: 'Parameters', type: 'text', placeholder: 'e.g. head: ListNode, k: int' },
          { name: 'returnType', label: 'Return type', type: 'text', placeholder: 'e.g. ListNode' },
        ],
        onSubmit: (v) => {
          const methodName = String(v.methodName).trim();
          dispatch({
            type: 'createContext',
            spec: { kind: 'method', name: methodName, methodName, parameters: parseParameters(String(v.params ?? '')), returnType: String(v.returnType ?? '').trim() || undefined },
            position: at,
          });
          selectNewestContext();
        },
      });
      return;
    }
    case 'frame': {
      const d = doc();
      const methods = Object.values(d.contexts).filter((c) => c.kind === 'method');
      openForm({
        title: 'Create stack frame',
        description: 'Pushes a new frame on the call stack. New variables are declared in the top frame’s scope. Arguments are not initialized for you.',
        fields: [
          { name: 'method', label: 'Method', type: 'select', options: [{ value: '', label: '(none)' }, ...methods.map((m) => ({ value: m.id, label: m.name }))] },
          { name: 'name', label: 'Frame label (optional)', type: 'text', placeholder: 'e.g. reverse(head)' },
          { name: 'declare', label: 'Declare parameters as uninitialized locals', type: 'checkbox', defaultValue: true },
        ],
        submitLabel: 'Push frame',
        onSubmit: (v) => {
          dispatch({
            type: 'createStackFrame',
            name: String(v.name ?? ''),
            position: at,
            ...(v.method ? { methodId: String(v.method) } : {}),
            declareParameters: Boolean(v.declare),
          });
        },
      });
      return;
    }
    default:
      return;
  }
}

function selectNewestContext() {
  const d = doc();
  const id = `c${d.seq}`;
  if (d.contexts[id]) {
    useUiStore.getState().setSelection([id]);
    useUiStore.getState().focusContext(id);
  }
}

export function openCheckpointDialog(): void {
  const h = useProjectStore.getState().history;
  openForm({
    title: 'Create checkpoint',
    description: 'Bookmarks the current state in the timeline. It does not change any data.',
    fields: [{ name: 'name', label: 'Name', type: 'text', defaultValue: `Checkpoint ${h.checkpoints.filter((c) => c.kind === 'manual').length + 1}` }],
    onSubmit: (v) => {
      useProjectStore.getState().addCheckpoint(String(v.name));
      useUiStore.getState().toast('Checkpoint created', 'success');
    },
  });
}

/** Deletes the selection after confirming effects on references. */
export function deleteSelection(): void {
  const ui = useUiStore.getState();
  const d = doc();
  if (ui.selectedEdgeIds.length && !ui.selectedIds.length) {
    for (const e of ui.selectedEdgeIds) disconnectEdge(e);
    return;
  }
  const ids = ui.selectedIds.filter((id) => d.objects[id] || d.variables[id] || d.frames[id] || d.contexts[id] || d.annotations[id]);
  if (!ids.length) return;
  const objectIds = new Set(ids.filter((id) => d.objects[id]));
  let incoming = 0;
  if (objectIds.size) {
    for (const v of Object.values(d.variables)) if (v.value.kind === 'ref' && objectIds.has(v.value.targetId) && !ids.includes(v.id)) incoming++;
    for (const o of Object.values(d.objects)) {
      if (objectIds.has(o.id)) continue;
      for (const s of o.slots) if (s.value.kind === 'ref' && objectIds.has(s.value.targetId)) incoming++;
    }
  }
  const frameLocals = ids.filter((id) => d.frames[id]).flatMap((fid) => Object.values(d.variables).filter((v) => v.scopeId === fid));
  const run = () => {
    if (dispatch({ type: 'deleteElements', ids })) ui.setSelection([]);
  };
  if (incoming > 0 || frameLocals.length > 0) {
    const parts: string[] = [];
    if (incoming) parts.push(`${incoming} reference(s) still point to the deleted object(s). They will become dangling (shown in red) — nothing is reassigned for you.`);
    if (frameLocals.length) parts.push(`The frame's ${frameLocals.length} local variable(s) will be deleted with it.`);
    openConfirm({ title: 'Delete elements?', message: parts.join(' '), confirmLabel: 'Delete', danger: true, onConfirm: run });
  } else run();
}

export function edgeToSource(edgeId: Id): RefSource | null {
  if (edgeId.startsWith('e:v:')) return { kind: 'variable', variableId: edgeId.slice(4) };
  if (edgeId.startsWith('e:s:')) {
    const [objectId, slotId] = edgeId.slice(4).split(':');
    return { kind: 'slot', objectId, slotId };
  }
  if (edgeId.startsWith('e:n:')) {
    const rest = edgeId.slice(4);
    if (rest.startsWith('v:')) return { kind: 'variable', variableId: rest.slice(2) };
    const [, objectId, slotId] = rest.split(':');
    return { kind: 'slot', objectId, slotId };
  }
  return null;
}

export function disconnectEdge(edgeId: Id): void {
  if (edgeId.startsWith('e:i:')) {
    dispatch({ type: 'setIndexBinding', variableId: edgeId.slice(4), arrayId: null });
    return;
  }
  const src = edgeToSource(edgeId);
  if (src) dispatch({ type: 'setReference', source: src, target: { kind: 'null' } });
}

export function copySelection(): void {
  const ui = useUiStore.getState();
  const d = doc();
  const payload = {
    objects: ui.selectedIds.map((id) => d.objects[id]).filter(Boolean),
    variables: ui.selectedIds.map((id) => d.variables[id]).filter(Boolean),
    annotations: ui.selectedIds.map((id) => d.annotations[id]).filter((a) => a && a.kind !== 'group'),
  };
  const n = payload.objects.length + payload.variables.length + payload.annotations.length;
  if (!n) return;
  ui.setClipboard(JSON.parse(JSON.stringify(payload)));
  ui.toast(`Copied ${n} element(s). Pasting creates new objects with new identities.`);
}

export function pasteClipboard(offset: Point = { x: 40, y: 40 }): void {
  const ui = useUiStore.getState();
  if (!ui.clipboard) return;
  dispatch({ type: 'paste', payload: ui.clipboard, offset });
}

export function duplicateSelection(): void {
  copySelection();
  pasteClipboard();
}

export function groupSelection(): void {
  const ui = useUiStore.getState();
  const d = doc();
  const members = ui.selectedIds.filter((id) => !d.annotations[id] || d.annotations[id].kind !== 'group');
  if (members.length < 1) {
    ui.toast('Select elements to group first');
    return;
  }
  openForm({
    title: 'Group elements',
    description: 'A visual group only — it has no effect on the algorithm state.',
    fields: [{ name: 'label', label: 'Label', type: 'text', defaultValue: 'Group' }],
    onSubmit: (v) => {
      dispatch({ type: 'createAnnotation', annotation: { kind: 'group', label: String(v.label), memberIds: members, position: { x: 0, y: 0 }, color: 'violet' } });
    },
  });
}

/** Explicit "copy the target of another reference" action. */
export function assignFromPrompt(target: RefSource): void {
  const d = doc();
  const label = describeRefSource(d, target);
  openForm({
    title: `Assign ${label} = …`,
    description: 'Copies the current value (for references: the target identity — the object is not cloned).',
    fields: [
      {
        name: 'from',
        label: 'Value from',
        type: 'select',
        options: [
          ...Object.values(d.variables).map((v) => ({ value: `var:${v.id}`, label: v.name })),
          ...Object.values(d.variables).flatMap((v) => (v.value.kind === 'ref' && d.objects[v.value.targetId] ? d.objects[v.value.targetId].slots.map((s) => ({ value: `vf:${v.id}:${s.name}`, label: `${v.name}.${s.name}` })) : [])),
        ],
      },
    ],
    submitLabel: 'Assign',
    onSubmit: (v) => {
      const key = String(v.from);
      if (!key) return 'Choose a source';
      const [kind, id, ...rest] = key.split(':');
      const operand = kind === 'var' ? { kind: 'variable' as const, variableId: id } : { kind: 'variableField' as const, variableId: id, fieldName: rest.join(':') };
      const ok = dispatch({ type: 'assignValue', target, source: { kind: 'operand', operand } });
      return ok ? undefined : 'Assignment failed';
    },
  });
}

export function markResultFrom(source: RefSource): void {
  const d = doc();
  const v = readRefSource(d, source);
  if (!v) return;
  dispatch({
    type: 'markResult',
    source: { kind: 'operand', operand: source.kind === 'variable' ? { kind: 'variable', variableId: source.variableId } : { kind: 'objectSlot', objectId: source.objectId, slotId: source.slotId } },
    label: describeRefSource(d, source),
  });
}

export function markObjectAsResult(objectId: Id): void {
  dispatch({ type: 'markResult', source: { kind: 'value', value: { kind: 'ref', targetId: objectId } }, label: objectLabel(doc(), objectId) });
}

export function runBatch(label: string, commands: Command[]): boolean {
  return dispatch({ type: 'batch', label, commands });
}
