import { useEffect, useState } from 'react';
import { Trash2, Plus, Target, Crosshair, Group as GroupIcon } from 'lucide-react';
import type { DocumentState, ExecutionContext, HeapObject, Id, RefSource, Slot, StackFrame, Variable } from '../../core/model/types';
import { GLOBAL_SCOPE_ID } from '../../core/model/types';
import { allReferences, describeRefSource, isScopeLive, readRefSource, scopeName } from '../../core/model/queries';
import { formatValue, objectLabel } from '../../core/model/values';
import { getStructure } from '../../core/model/structures';
import { LOOP_TYPE_LABELS, PHASE_LABELS } from '../../core/execution/loops';
import { Button, cx, Empty, inputClass, Row, SectionTitle } from '../../components/ui';
import { PALETTE, PASTEL_COLORS } from '../../components/palette';
import { OperandPicker } from '../../components/values';
import type { Operand } from '../../core/model/types';
import { dispatch, useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { InlineValue } from './InlineValue';
import { ConditionBuilder } from '../loops/ConditionBuilder';
import { assignFromPrompt, deleteSelection, edgeToSource, groupSelection, markObjectAsResult, markResultFrom, parseParameters } from '../canvas/actions';
import type { LoopType } from '../../core/model/types';

/** Text input that commits on Enter/blur through an explicit command. */
function CommitInput({ value, onCommit, testId, placeholder }: { value: string; onCommit(v: string): void; testId?: string; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className={inputClass}
      value={v}
      placeholder={placeholder}
      data-testid={testId}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setV(value);
      }}
    />
  );
}

function select(id: Id) {
  useUiStore.getState().setSelection([id]);
}

function TargetLink({ doc, value }: { doc: DocumentState; value: { kind: string; targetId?: string } }) {
  if (value.kind !== 'ref' || !value.targetId) return <span className="text-slate-400">—</span>;
  if (!doc.objects[value.targetId]) return <span className="text-rose-600">deleted object ({value.targetId})</span>;
  return (
    <button type="button" className="text-sky-700 underline decoration-dotted hover:text-sky-900" onClick={() => select(value.targetId!)}>
      {objectLabel(doc, value.targetId)}
    </button>
  );
}

function IncomingRefs({ doc, objectId }: { doc: DocumentState; objectId: Id }) {
  const incoming = allReferences(doc).filter((r) => r.targetId === objectId);
  if (!incoming.length) return <div className="text-[12px] text-slate-400">No references point here (unreachable unless it is the result).</div>;
  return (
    <ul className="space-y-0.5">
      {incoming.map((r, i) => (
        <li key={i}>
          <button
            type="button"
            className="font-mono text-[11px] text-slate-700 hover:underline"
            onClick={() => select(r.source.kind === 'variable' ? r.source.variableId : r.source.objectId)}
          >
            {describeRefSource(doc, r.source)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ColorRow({ ids, current }: { ids: Id[]; current?: string }) {
  return (
    <div className="flex gap-1">
      {PASTEL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          className={cx('h-4 w-4 rounded-full border', PALETTE[c].swatch, current === c ? 'border-slate-700' : 'border-white ring-1 ring-slate-200')}
          onClick={() => dispatch({ type: 'setColor', ids, color: c })}
        />
      ))}
    </div>
  );
}

function SlotEditor({ obj, slot, doc }: { obj: HeapObject; slot: Slot; doc: DocumentState }) {
  const source: RefSource = { kind: 'slot', objectId: obj.id, slotId: slot.id };
  const def = getStructure(obj.kind);
  const renamable = obj.kind === 'node' || obj.kind === 'object';
  return (
    <div className="rounded-md border border-slate-100 p-1.5" data-testid={`inspector-slot-${slot.name}`}>
      <div className="flex items-center gap-1.5">
        {renamable ? (
          <div className="w-24">
            <CommitInput value={slot.name} onCommit={(name) => dispatch({ type: 'renameSlot', objectId: obj.id, slotId: slot.id, name })} />
          </div>
        ) : (
          <span className="w-10 font-mono text-[11px] text-slate-500">[{slot.name}]</span>
        )}
        <span className="text-[10px] text-slate-400">{slot.kind}</span>
        <div className="ml-auto">
          <InlineValue target={source} value={slot.value} />
        </div>
        {def.editableSlots && (
          <button type="button" title="Remove" className="rounded p-0.5 text-slate-300 hover:text-rose-600" onClick={() => dispatch({ type: 'removeSlot', objectId: obj.id, slotId: slot.id })}>
            <Trash2 size={11} />
          </button>
        )}
      </div>
      {slot.value.kind === 'ref' && (
        <div className="mt-0.5 text-[11px] text-slate-500">
          → <TargetLink doc={doc} value={slot.value} />
        </div>
      )}
      {slot.kind !== 'primitive' && (
        <div className="mt-1 flex gap-1">
          <Button size="xs" variant="ghost" onClick={() => dispatch({ type: 'setReference', source, target: { kind: 'null' } })}>
            = null
          </Button>
          <Button size="xs" variant="ghost" onClick={() => assignFromPrompt(source)}>
            = …
          </Button>
        </div>
      )}
    </div>
  );
}

function ObjectInspector({ obj, doc }: { obj: HeapObject; doc: DocumentState }) {
  const def = getStructure(obj.kind);
  const isResult = doc.result?.value.kind === 'ref' && doc.result.value.targetId === obj.id;
  return (
    <div data-testid="inspector-object">
      <SectionTitle>{def.label}</SectionTitle>
      <Row label="Identity">
        <span className="font-mono">
          @{obj.serial} <span className="text-slate-400">({obj.id})</span>
        </span>
      </Row>
      <Row label="Label">
        <CommitInput value={obj.name ?? ''} placeholder="optional" onCommit={(name) => dispatch({ type: 'renameObject', objectId: obj.id, name })} />
      </Row>
      <Row label="Type">
        <CommitInput value={obj.typeName} onCommit={(typeName) => dispatch({ type: 'setObjectType', objectId: obj.id, typeName })} />
      </Row>
      {obj.flavor && <Row label="Container">{obj.flavor} (discipline not enforced)</Row>}
      {obj.shape && (
        <Row label="Shape">
          {obj.shape.rows} × {obj.shape.cols}
        </Row>
      )}
      <Row label="Color">
        <ColorRow ids={[obj.id]} current={obj.appearance.color} />
      </Row>
      <SectionTitle
        right={
          def.editableSlots && obj.kind !== 'container' ? (
            <Button size="xs" variant="ghost" onClick={() => dispatch({ type: 'addSlot', objectId: obj.id, slotKind: 'any' })}>
              <Plus size={11} /> field
            </Button>
          ) : obj.kind === 'container' ? (
            <Button size="xs" variant="ghost" onClick={() => dispatch({ type: 'addSlot', objectId: obj.id, slotKind: 'any' })}>
              <Plus size={11} /> entry
            </Button>
          ) : undefined
        }
      >
        {def.indexedSlots ? 'Cells' : 'Fields'}
      </SectionTitle>
      <div className="max-h-80 space-y-1 overflow-auto dc-scroll">
        {obj.slots.map((s) => (
          <SlotEditor key={s.id} obj={obj} slot={s} doc={doc} />
        ))}
      </div>
      <SectionTitle>Referenced by</SectionTitle>
      <IncomingRefs doc={doc} objectId={obj.id} />
      <SectionTitle>Actions</SectionTitle>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" variant={isResult ? 'primary' : 'default'} onClick={() => markObjectAsResult(obj.id)} data-testid="mark-object-result">
          <Target size={11} /> Mark as result
        </Button>
        <Button size="xs" variant="danger" onClick={deleteSelection}>
          <Trash2 size={11} /> Delete
        </Button>
      </div>
    </div>
  );
}

function VariableInspector({ v, doc }: { v: Variable; doc: DocumentState }) {
  const source: RefSource = { kind: 'variable', variableId: v.id };
  const arrays = Object.values(doc.objects).filter((o) => o.kind === 'array');
  return (
    <div data-testid="inspector-variable">
      <SectionTitle>Variable</SectionTitle>
      <Row label="Name">
        <CommitInput value={v.name} testId="var-name" onCommit={(name) => dispatch({ type: 'renameVariable', variableId: v.id, name })} />
      </Row>
      <Row label="Declared type">
        <CommitInput value={v.declaredType ?? ''} placeholder="optional" onCommit={(t) => dispatch({ type: 'setVariableType', variableId: v.id, declaredType: t })} />
      </Row>
      <Row label="Scope">
        {scopeName(doc, v.scopeId)}
        {!isScopeLive(doc, v.scopeId) && <span className="ml-1 text-amber-700">(out of scope)</span>}
      </Row>
      <Row label="Value">
        <InlineValue target={source} value={v.value} testId="inspector-var-value" />
      </Row>
      <Row label="Reference">
        <TargetLink doc={doc} value={v.value} />
      </Row>
      {v.value.kind === 'number' && arrays.length > 0 && (
        <Row label="Show as index">
          <select
            className={inputClass}
            value={v.indexInto ?? ''}
            title="Visual only: draws this variable as an index marker on an array. It never moves by itself."
            onChange={(e) => dispatch({ type: 'setIndexBinding', variableId: v.id, arrayId: e.target.value || null })}
          >
            <option value="">(no)</option>
            {arrays.map((a) => (
              <option key={a.id} value={a.id}>
                {objectLabel(doc, a.id)}
              </option>
            ))}
          </select>
        </Row>
      )}
      <SectionTitle>Assign</SectionTitle>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" onClick={() => assignFromPrompt(source)} data-testid="assign-from">
          {v.name} = …
        </Button>
        <Button size="xs" onClick={() => dispatch({ type: 'setReference', source, target: { kind: 'null' } })} data-testid="assign-null">
          {v.name} = null
        </Button>
        <Button size="xs" variant="ghost" title="Explicitly reset to the uninitialized state" onClick={() => dispatch({ type: 'setReference', source, target: { kind: 'uninitialized' } })}>
          reset to ?
        </Button>
      </div>
      <SectionTitle>Actions</SectionTitle>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" onClick={() => markResultFrom(source)} data-testid="mark-variable-result">
          <Target size={11} /> Mark as result
        </Button>
        <Button size="xs" variant="danger" onClick={deleteSelection}>
          <Trash2 size={11} /> Delete
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        Drag from the variable’s right handle onto an object to point at it, onto another variable to copy its value, or onto a null marker to assign null.
      </p>
    </div>
  );
}

function ContextInspector({ c, doc }: { c: ExecutionContext; doc: DocumentState }) {
  const entered = doc.activeContextPath.includes(c.id);
  const parentOptions = Object.values(doc.contexts).filter((x) => x.id !== c.id);
  return (
    <div data-testid="inspector-context">
      <SectionTitle>Execution context</SectionTitle>
      <Row label="Name">
        <CommitInput value={c.name} onCommit={(name) => dispatch({ type: 'updateContext', contextId: c.id, patch: { name } })} />
      </Row>
      <Row label="Kind">{c.kind}</Row>
      <Row label="Parent">
        <select
          className={inputClass}
          value={c.parentId ?? ''}
          onChange={(e) => dispatch({ type: 'updateContext', contextId: c.id, patch: { parentId: e.target.value || null } })}
        >
          <option value="">(top level)</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Status">{entered ? (doc.activeContextPath.at(-1) === c.id ? 'active' : 'entered') : c.status}</Row>
      {c.kind === 'loop' && (
        <>
          <Row label="Loop type">
            <select className={inputClass} value={c.loopType} onChange={(e) => dispatch({ type: 'updateContext', contextId: c.id, patch: { loopType: e.target.value as LoopType } })}>
              {(['while', 'for', 'do-while', 'custom'] as LoopType[]).map((t) => (
                <option key={t} value={t}>
                  {LOOP_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Phase">{c.phase ? PHASE_LABELS[c.phase] : '—'}</Row>
          <Row label="Iteration">{c.phase ? `${c.iterationsCompleted + 1} (completed ${c.iterationsCompleted})` : `completed ${c.iterationsCompleted}`}</Row>
          {c.loopType === 'custom' && (
            <Row label="Phases">
              <div className="flex flex-wrap gap-1">
                {(['init', 'condition', 'body', 'update', 'exit'] as const).map((p) => (
                  <label key={p} className="flex items-center gap-0.5 text-[11px]">
                    <input
                      type="checkbox"
                      checked={c.phases.includes(p)}
                      onChange={(e) => {
                        const order = ['init', 'condition', 'body', 'update', 'exit'] as const;
                        const next = order.filter((x) => (x === p ? e.target.checked : c.phases.includes(x)));
                        if (next.length) dispatch({ type: 'updateContext', contextId: c.id, patch: { phases: next } });
                      }}
                    />
                    {p}
                  </label>
                ))}
              </div>
            </Row>
          )}
        </>
      )}
      {(c.kind === 'loop' || c.kind === 'condition') && (
        <>
          <SectionTitle>Condition</SectionTitle>
          <ConditionBuilder contextId={c.id} condition={c.condition} />
        </>
      )}
      {c.kind === 'method' && (
        <>
          <Row label="Method">
            <CommitInput value={c.methodName} onCommit={(methodName) => dispatch({ type: 'updateContext', contextId: c.id, patch: { methodName } })} />
          </Row>
          <Row label="Parameters">
            <CommitInput
              value={c.parameters.map((p) => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ')}
              placeholder="head: ListNode"
              onCommit={(t) => dispatch({ type: 'updateContext', contextId: c.id, patch: { parameters: parseParameters(t) } })}
            />
          </Row>
          <Row label="Returns">
            <CommitInput value={c.returnType ?? ''} placeholder="void" onCommit={(returnType) => dispatch({ type: 'updateContext', contextId: c.id, patch: { returnType } })} />
          </Row>
        </>
      )}
      <SectionTitle>Actions</SectionTitle>
      <div className="flex flex-wrap gap-1">
        {!entered ? (
          <Button size="xs" variant="primary" onClick={() => dispatch({ type: 'enterContext', contextId: c.id })}>
            Enter
          </Button>
        ) : (
          <Button size="xs" onClick={() => dispatch({ type: 'exitContext', contextId: c.id })}>
            Exit
          </Button>
        )}
        <Button size="xs" onClick={() => useUiStore.getState().focusContext(c.id)}>
          <Crosshair size={11} /> Show in controller
        </Button>
        <Button size="xs" variant="danger" onClick={deleteSelection}>
          <Trash2 size={11} /> Delete
        </Button>
      </div>
    </div>
  );
}

function FrameInspector({ f, doc }: { f: StackFrame; doc: DocumentState }) {
  const [ret, setRet] = useState<Operand | null>(null);
  const isTop = doc.callStack.at(-1) === f.id;
  return (
    <div data-testid="inspector-frame">
      <SectionTitle>Stack frame</SectionTitle>
      <Row label="Name">{f.name}</Row>
      <Row label="Method">{f.methodId ? (doc.contexts[f.methodId]?.name ?? '—') : '—'}</Row>
      <Row label="Caller">{f.callerFrameId ? (doc.frames[f.callerFrameId]?.name ?? '—') : 'global'}</Row>
      <Row label="Status">{f.status === 'active' ? (isTop ? 'active (top)' : 'active') : 'returned'}</Row>
      <Row label="Return value">{f.returnValue ? formatValue(f.returnValue, doc) : 'not set'}</Row>
      <SectionTitle>Return value</SectionTitle>
      <div className="flex gap-1">
        <div className="min-w-0 flex-1">
          <OperandPicker value={ret} onChange={setRet} />
        </div>
        <Button size="xs" disabled={!ret} onClick={() => ret && dispatch({ type: 'setReturnValue', frameId: f.id, source: { kind: 'operand', operand: ret } })}>
          Set
        </Button>
      </div>
      <SectionTitle>Actions</SectionTitle>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" disabled={!isTop} onClick={() => dispatch({ type: 'exitFrame', frameId: f.id })} title="Pop this frame. Return values are never assigned automatically.">
          Return (pop)
        </Button>
        <Button size="xs" variant="danger" onClick={deleteSelection}>
          <Trash2 size={11} /> Delete
        </Button>
      </div>
    </div>
  );
}

function EdgeInspector({ edgeId, doc }: { edgeId: string; doc: DocumentState }) {
  if (edgeId.startsWith('e:i:')) {
    const v = doc.variables[edgeId.slice(4)];
    return (
      <div>
        <SectionTitle>Index marker</SectionTitle>
        <p className="text-[12px] text-slate-600">Visual marker of {v?.name} into an array. It follows the variable’s value; it never moves on its own.</p>
      </div>
    );
  }
  const src = edgeToSource(edgeId);
  if (!src) return null;
  const value = readRefSource(doc, src);
  return (
    <div data-testid="inspector-reference">
      <SectionTitle>Reference</SectionTitle>
      <Row label="Source">
        <span className="font-mono">{describeRefSource(doc, src)}</span>
      </Row>
      <Row label="Kind">{src.kind === 'variable' ? 'variable → object' : 'field → object'}</Row>
      <Row label="Target">{value ? <TargetLink doc={doc} value={value} /> : '—'}</Row>
      <Row label="Identity">
        <span className="font-mono text-[11px]">{value?.kind === 'ref' ? value.targetId : value ? formatValue(value) : ''}</span>
      </Row>
      <SectionTitle>Actions</SectionTitle>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" onClick={() => dispatch({ type: 'setReference', source: src, target: { kind: 'null' } })}>
          Disconnect (= null)
        </Button>
        <Button size="xs" onClick={() => assignFromPrompt(src)}>
          Redirect = …
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">To redirect visually, drag again from the source handle to a new target. Only this reference changes.</p>
    </div>
  );
}

function Overview({ doc }: { doc: DocumentState }) {
  const vars = Object.values(doc.variables);
  return (
    <div className="space-y-3 text-[12px] text-slate-600">
      <Empty>Select an element to inspect it.</Empty>
      <div>
        <SectionTitle>Memory</SectionTitle>
        <Row label="Objects">{Object.keys(doc.objects).length}</Row>
        <Row label="Variables">{vars.length}</Row>
        <Row label="Contexts">{Object.keys(doc.contexts).length}</Row>
        <Row label="Call stack">{doc.callStack.length ? doc.callStack.map((id) => doc.frames[id]?.name).join(' › ') : 'global only'}</Row>
      </div>
      {vars.length > 0 && (
        <div>
          <SectionTitle>Variables</SectionTitle>
          <ul className="space-y-0.5">
            {vars.map((v) => (
              <li key={v.id} className="flex justify-between gap-2">
                <button type="button" className="font-mono hover:underline" onClick={() => select(v.id)}>
                  {v.name}
                  {v.scopeId !== GLOBAL_SCOPE_ID && <span className="text-slate-400"> ({scopeName(doc, v.scopeId)})</span>}
                </button>
                <span className="truncate font-mono text-slate-500">{formatValue(v.value, doc)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <SectionTitle>Result</SectionTitle>
        {doc.result ? (
          <div className="flex items-center justify-between gap-2">
            <span>
              {doc.result.sourceLabel}: <span className="font-mono">{formatValue(doc.result.value, doc)}</span>
            </span>
            <Button size="xs" variant="ghost" onClick={() => dispatch({ type: 'clearResult' })}>
              Clear
            </Button>
          </div>
        ) : (
          <div className="text-slate-400">Not identified. Use “Mark as result” on a variable or object.</div>
        )}
      </div>
    </div>
  );
}

export function Inspector() {
  const doc = useProjectStore((s) => s.doc);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const selectedEdgeIds = useUiStore((s) => s.selectedEdgeIds);
  const ids = selectedIds.filter((id) => doc.objects[id] || doc.variables[id] || doc.frames[id] || doc.contexts[id] || doc.annotations[id]);

  if (!ids.length && selectedEdgeIds.length === 1) return <EdgeInspector edgeId={selectedEdgeIds[0]} doc={doc} />;
  if (ids.length > 1) {
    return (
      <div>
        <SectionTitle>{ids.length} elements selected</SectionTitle>
        <div className="flex flex-wrap gap-1">
          <Button size="xs" onClick={groupSelection}>
            <GroupIcon size={11} /> Group
          </Button>
          <Button size="xs" variant="danger" onClick={deleteSelection}>
            <Trash2 size={11} /> Delete
          </Button>
        </div>
        <SectionTitle>Color</SectionTitle>
        <ColorRow ids={ids} />
      </div>
    );
  }
  const id = ids[0];
  if (!id) return <Overview doc={doc} />;
  if (doc.objects[id]) return <ObjectInspector obj={doc.objects[id]} doc={doc} />;
  if (doc.variables[id]) return <VariableInspector v={doc.variables[id]} doc={doc} />;
  if (doc.contexts[id]) return <ContextInspector c={doc.contexts[id]} doc={doc} />;
  if (doc.frames[id]) return <FrameInspector f={doc.frames[id]} doc={doc} />;
  const a = doc.annotations[id];
  if (a) {
    return (
      <div>
        <SectionTitle>Annotation ({a.kind === 'nullMarker' ? 'null marker' : a.kind})</SectionTitle>
        <p className="mb-2 text-[11px] text-slate-400">Annotations are decorative and never part of the algorithm state.</p>
        {a.kind === 'text' && (
          <textarea
            className={cx(inputClass, 'h-20 py-1')}
            defaultValue={a.text}
            onKeyDown={(e) => e.stopPropagation()}
            onBlur={(e) => e.target.value !== a.text && dispatch({ type: 'updateAnnotation', annotationId: a.id, patch: { text: e.target.value } })}
          />
        )}
        {a.kind === 'group' && (
          <Row label="Label">
            <CommitInput value={a.label} onCommit={(label) => dispatch({ type: 'updateAnnotation', annotationId: a.id, patch: { label } })} />
          </Row>
        )}
        {a.kind !== 'nullMarker' && (
          <Row label="Color">
            <ColorRow ids={[a.id]} current={a.color} />
          </Row>
        )}
        <div className="mt-2">
          <Button size="xs" variant="danger" onClick={deleteSelection}>
            <Trash2 size={11} /> Delete
          </Button>
        </div>
      </div>
    );
  }
  return <Overview doc={doc} />;
}
