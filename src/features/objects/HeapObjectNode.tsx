import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Plus, X } from 'lucide-react';
import type { HeapObject, RefSource, Slot } from '../../core/model/types';
import { refSourceKey } from '../../core/model/types';
import { PALETTE } from '../../components/palette';
import { cx } from '../../components/ui';
import { dispatch, useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { openForm } from '../../stores/dialogStore';
import { InlineValue } from './InlineValue';
import { ArrayBody, MatrixBody } from '../structures/IndexedBodies';

export type HeapNodeData = { objectId: string };

function useRefPick(source: RefSource) {
  const tool = useUiStore((s) => s.tool);
  const pending = useUiStore((s) => s.pendingRefSource);
  const isPending = pending ? refSourceKey(pending) === refSourceKey(source) : false;
  const onClick = (e: React.MouseEvent) => {
    if (tool !== 'reference') return;
    e.stopPropagation();
    useUiStore.getState().setPendingRefSource(isPending ? null : source);
  };
  return { isPending, onClick, active: tool === 'reference' };
}

export function SlotRow({ obj, slot, label }: { obj: HeapObject; slot: Slot; label?: string }) {
  const source: RefSource = { kind: 'slot', objectId: obj.id, slotId: slot.id };
  const pick = useRefPick(source);
  const canRef = slot.kind !== 'primitive';
  const isContainer = obj.kind === 'container';
  return (
    <div
      data-testid={`slot-${obj.serial}-${slot.name}`}
      onClick={canRef ? pick.onClick : undefined}
      onContextMenu={(e) => {
        if (!canRef) return;
        e.preventDefault();
        e.stopPropagation();
        useUiStore.getState().openContextMenu({ x: e.clientX, y: e.clientY, target: { kind: 'slot', objectId: obj.id, slotId: slot.id } });
      }}
      className={cx(
        'relative flex h-7 items-center gap-2 border-t border-slate-100 pl-2 pr-4 first:border-t-0',
        pick.isPending && 'bg-violet-50 ring-1 ring-violet-300',
        pick.active && canRef && 'hover:bg-violet-50/60',
      )}
    >
      <span
        className={cx('shrink-0 truncate font-mono text-[11px]', isContainer ? 'min-w-10' : 'w-10', slot.kind === 'reference' ? 'text-sky-700' : 'text-slate-500')}
        title={`${slot.name} (${slot.kind})`}
      >
        {label ?? slot.name}
      </span>
      {obj.flavor === 'map' && slot.key !== undefined && (
        <span className="font-mono text-[10px] text-slate-400">key:</span>
      )}
      <InlineValue target={source} value={slot.value} testId={`value-${obj.serial}-${slot.name}`} className="flex-1" />
      {isContainer && (
        <button
          type="button"
          title="Remove entry"
          className="nodrag rounded p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'removeSlot', objectId: obj.id, slotId: slot.id });
          }}
        >
          <X size={10} />
        </button>
      )}
      {canRef && (
        <Handle
          type="source"
          id={`slot:${slot.id}`}
          position={Position.Right}
          className="dc-handle-ref"
          style={{ right: -6 }}
          title={`Drag to set ${slot.name} → object`}
          data-testid={`handle-${obj.serial}-${slot.name}`}
        />
      )}
    </div>
  );
}

function addFieldPrompt(obj: HeapObject) {
  openForm({
    title: `Add field to ${obj.typeName}@${obj.serial}`,
    fields: [
      { name: 'name', label: 'Field name', type: 'text', required: true },
      {
        name: 'kind',
        label: 'Kind',
        type: 'select',
        options: [
          { value: 'primitive', label: 'primitive (number, string, boolean)' },
          { value: 'reference', label: 'reference (object or null)' },
          { value: 'any', label: 'any' },
        ],
      },
    ],
    submitLabel: 'Add field',
    onSubmit: (v) => (dispatch({ type: 'addSlot', objectId: obj.id, name: String(v.name), slotKind: v.kind as Slot['kind'] }) ? undefined : 'Could not add field'),
  });
}

function containerLabel(obj: HeapObject, i: number): string | undefined {
  const last = obj.slots.length - 1;
  if (obj.flavor === 'stack' && i === last) return `${i} top`;
  if ((obj.flavor === 'queue' || obj.flavor === 'deque') && i === 0) return `${i} front`;
  if ((obj.flavor === 'queue' || obj.flavor === 'deque') && i === last) return `${i} back`;
  return undefined;
}

function HeapObjectNodeImpl({ data }: NodeProps) {
  const { objectId } = data as HeapNodeData;
  const obj = useProjectStore((s) => s.doc.objects[objectId]);
  const isResult = useProjectStore((s) => s.doc.result?.value.kind === 'ref' && s.doc.result.value.targetId === objectId);
  const tool = useUiStore((s) => s.tool);
  const pending = useUiStore((s) => s.pendingRefSource);
  if (!obj) return null;
  const pal = PALETTE[obj.appearance.color];
  const awaitingTarget = tool === 'reference' && pending !== null;

  return (
    <div
      data-testid={`object-${obj.serial}`}
      data-object-id={obj.id}
      className={cx(
        'dc-node min-w-[150px] rounded-md border bg-white text-slate-800',
        pal.border,
        awaitingTarget && 'ring-2 ring-sky-200',
      )}
    >
      <Handle type="target" id="in" position={Position.Left} className="dc-target-handle" />
      <Handle type="target" id="in-top" position={Position.Top} className="dc-target-handle" />
      <Handle type="target" id="in-bottom" position={Position.Bottom} className="dc-target-handle" />
      <div className={cx('flex items-center justify-between gap-2 rounded-t-md px-2 py-1', pal.header)}>
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className={cx('truncate text-[12px] font-semibold', pal.text)}>{obj.name ?? obj.typeName}</span>
          <span className="font-mono text-[10px] text-slate-400" title="Object identity">
            @{obj.serial}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isResult && <span className="rounded bg-emerald-100 px-1 text-[9px] font-semibold uppercase text-emerald-700">result</span>}
          {obj.kind === 'object' && (
            <button type="button" title="Add field" className="nodrag rounded p-0.5 text-slate-400 hover:bg-white" onClick={() => addFieldPrompt(obj)}>
              <Plus size={12} />
            </button>
          )}
        </div>
      </div>
      {obj.kind === 'array' && <ArrayBody obj={obj} />}
      {obj.kind === 'matrix' && <MatrixBody obj={obj} />}
      {(obj.kind === 'node' || obj.kind === 'object' || obj.kind === 'container') && (
        <div>
          {obj.slots.map((s, i) => (
            <SlotRow key={s.id} obj={obj} slot={s} label={obj.kind === 'container' ? (containerLabel(obj, i) ?? s.name) : undefined} />
          ))}
          {obj.slots.length === 0 && <div className="px-2 py-1.5 text-[11px] italic text-slate-400">{obj.kind === 'container' ? 'empty' : 'no fields'}</div>}
        </div>
      )}
      {obj.kind === 'container' && (
        <div className="flex gap-1 border-t border-slate-100 p-1">
          <button
            type="button"
            className="nodrag flex-1 rounded border border-slate-200 px-1 text-[10px] text-slate-600 hover:bg-slate-50"
            onClick={() => dispatch({ type: 'addSlot', objectId: obj.id, slotKind: 'any', position: 'start' })}
          >
            + front
          </button>
          <button
            type="button"
            className="nodrag flex-1 rounded border border-slate-200 px-1 text-[10px] text-slate-600 hover:bg-slate-50"
            onClick={() => dispatch({ type: 'addSlot', objectId: obj.id, slotKind: 'any', position: 'end' })}
          >
            + end
          </button>
        </div>
      )}
    </div>
  );
}

export const HeapObjectNode = memo(HeapObjectNodeImpl);
