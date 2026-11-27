import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Layers } from 'lucide-react';
import { variablesInScope } from '../../core/model/queries';
import { ValueChip } from '../../components/values';
import { cx } from '../../components/ui';
import { useProjectStore } from '../../stores/projectStore';

function FrameNodeImpl({ data }: NodeProps) {
  const { frameId } = data as { frameId: string };
  const doc = useProjectStore((s) => s.doc);
  const f = doc.frames[frameId];
  if (!f) return null;
  const depth = doc.callStack.indexOf(f.id);
  const isTop = depth !== -1 && depth === doc.callStack.length - 1;
  const locals = variablesInScope(doc, f.id);
  return (
    <div
      data-testid={`frame-${f.name}`}
      className={cx(
        'dc-node w-[210px] rounded-md border bg-white',
        f.status === 'active' ? 'border-teal-300' : 'border-dashed border-slate-300 opacity-60',
      )}
    >
      <div className="flex items-center justify-between rounded-t-md bg-teal-50 px-2 py-1">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-teal-800">
          <Layers size={12} /> {f.name}
        </div>
        <span className="text-[10px] text-teal-700">{f.status === 'active' ? (isTop ? 'top of stack' : `depth ${depth}`) : 'returned'}</span>
      </div>
      <div className="space-y-0.5 px-2 py-1.5 text-[11px]">
        <div className="text-slate-400">locals</div>
        {locals.length === 0 && <div className="italic text-slate-400">none</div>}
        {locals.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-2">
            <span className="font-mono">{v.name}</span>
            <ValueChip value={v.value} doc={doc} compact />
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1">
          <span className="text-slate-400">return</span>
          {f.returnValue ? <ValueChip value={f.returnValue} doc={doc} compact /> : <span className="text-slate-300">not set</span>}
        </div>
      </div>
    </div>
  );
}

export const FrameNode = memo(FrameNodeImpl);
