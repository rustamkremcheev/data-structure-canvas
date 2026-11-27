import { Handle, Position } from '@xyflow/react';
import type { HeapObject } from '../../core/model/types';
import { refSourceKey } from '../../core/model/types';
import { cx } from '../../components/ui';
import { InlineValue } from '../objects/InlineValue';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';

/** Index variables bound to this array, shown above their cell (visual only — never moved automatically). */
function useIndexMarkers(arrayId: string): Map<number, string[]> {
  const vars = useProjectStore((s) => s.doc.variables);
  const m = new Map<number, string[]>();
  for (const v of Object.values(vars)) {
    if (v.indexInto === arrayId && v.value.kind === 'number' && Number.isInteger(v.value.value)) {
      m.set(v.value.value, [...(m.get(v.value.value) ?? []), v.name]);
    }
  }
  return m;
}

export function ArrayBody({ obj }: { obj: HeapObject }) {
  const markers = useIndexMarkers(obj.id);
  const tool = useUiStore((s) => s.tool);
  const pending = useUiStore((s) => s.pendingRefSource);
  return (
    <div className="flex px-2 pb-2 pt-1">
      {obj.slots.map((s, i) => {
        const source = { kind: 'slot' as const, objectId: obj.id, slotId: s.id };
        const isPending = pending ? refSourceKey(pending) === refSourceKey(source) : false;
        return (
          <div key={s.id} className="relative flex flex-col items-center" data-testid={`cell-${obj.serial}-${i}`}>
            <div className="h-4 font-mono text-[9px] text-emerald-700">{markers.get(i)?.join(',') ?? ''}</div>
            <div className="font-mono text-[9px] text-slate-400">{i}</div>
            <div
              onClick={(e) => {
                if (tool !== 'reference') return;
                e.stopPropagation();
                useUiStore.getState().setPendingRefSource(isPending ? null : source);
              }}
              className={cx(
                'flex h-8 min-w-11 items-center justify-center border border-slate-300 bg-white px-1',
                i > 0 && '-ml-px',
                isPending && 'bg-violet-50 ring-1 ring-violet-300',
              )}
            >
              <InlineValue target={source} value={s.value} testId={`value-${obj.serial}-${i}`} />
            </div>
            <Handle type="target" id={`cell:${i}`} position={Position.Top} className="dc-target-handle" style={{ top: 18 }} />
            <Handle type="source" id={`slot:${s.id}`} position={Position.Bottom} className="dc-handle-ref" style={{ bottom: -5 }} title="Drag to store a reference in this cell" />
          </div>
        );
      })}
    </div>
  );
}

export function MatrixBody({ obj }: { obj: HeapObject }) {
  const rows = obj.shape?.rows ?? 1;
  const cols = obj.shape?.cols ?? obj.slots.length;
  return (
    <div className="p-2">
      <table className="border-collapse">
        <thead>
          <tr>
            <th />
            {Array.from({ length: cols }, (_, c) => (
              <th key={c} className="px-1 font-mono text-[9px] font-normal text-slate-400">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              <td className="pr-1 font-mono text-[9px] text-slate-400">{r}</td>
              {Array.from({ length: cols }, (_, c) => {
                const s = obj.slots[r * cols + c];
                if (!s) return <td key={c} />;
                return (
                  <td key={c} className="h-7 min-w-10 border border-slate-300 px-1 text-center" data-testid={`cell-${obj.serial}-${r}-${c}`}>
                    <InlineValue target={{ kind: 'slot', objectId: obj.id, slotId: s.id }} value={s.value} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
