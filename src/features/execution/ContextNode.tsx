import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FunctionSquare, GitBranch, Repeat } from 'lucide-react';
import { describeCondition } from '../../core/execution/conditions';
import { PHASE_LABELS, LOOP_TYPE_LABELS } from '../../core/execution/loops';
import { cx } from '../../components/ui';
import { useProjectStore } from '../../stores/projectStore';

function ContextNodeImpl({ data }: NodeProps) {
  const { contextId } = data as { contextId: string };
  const doc = useProjectStore((s) => s.doc);
  const c = doc.contexts[contextId];
  if (!c) return null;
  const pathIdx = doc.activeContextPath.indexOf(c.id);
  const isActive = pathIdx !== -1 && pathIdx === doc.activeContextPath.length - 1;
  const entered = pathIdx !== -1;
  const Icon = c.kind === 'loop' ? Repeat : c.kind === 'condition' ? GitBranch : FunctionSquare;
  const accent = c.kind === 'loop' ? 'border-amber-300 bg-amber-50 text-amber-800' : c.kind === 'condition' ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-teal-300 bg-teal-50 text-teal-800';

  return (
    <div
      data-testid={`context-${c.name}`}
      className={cx('dc-node w-[220px] rounded-md border bg-white', entered ? accent.split(' ')[0] : 'border-slate-200', isActive && 'ring-2 ring-amber-200')}
    >
      <Handle type="target" id="in" position={Position.Top} className="dc-target-handle" />
      <Handle type="source" id="nest" position={Position.Bottom} className="dc-target-handle" />
      <div className={cx('flex items-center justify-between gap-2 rounded-t-md border-b px-2 py-1', accent)}>
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold">
          <Icon size={12} />
          <span className="truncate">{c.name}</span>
        </div>
        <span className="text-[10px]">{isActive ? 'active' : entered ? 'entered' : c.status}</span>
      </div>
      <div className="space-y-0.5 px-2 py-1.5 text-[11px] text-slate-600">
        {c.kind === 'loop' && (
          <>
            <div className="flex justify-between">
              <span className="text-slate-400">{LOOP_TYPE_LABELS[c.loopType]}</span>
              <span>
                phase: <b className="font-medium text-slate-800">{c.phase ? PHASE_LABELS[c.phase] : '—'}</b>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">iterations done</span>
              <span className="font-mono">{c.iterationsCompleted}</span>
            </div>
            <div className="truncate font-mono text-[10px]" title={describeCondition(doc, c.condition)}>
              cond: {describeCondition(doc, c.condition)}
              {c.lastConditionResult !== null && <b className="ml-1">→ {String(c.lastConditionResult)}</b>}
            </div>
          </>
        )}
        {c.kind === 'condition' && (
          <>
            <div className="truncate font-mono text-[10px]">if ({describeCondition(doc, c.condition)})</div>
            <div className="flex justify-between">
              <span className="text-slate-400">your decision</span>
              <span>{c.result === null ? '—' : String(c.result)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">branch</span>
              <span>{c.branch ?? '—'}</span>
            </div>
          </>
        )}
        {c.kind === 'method' && (
          <div className="truncate font-mono text-[10px]">
            {c.returnType ?? 'void'} {c.methodName}({c.parameters.map((p) => `${p.type ? p.type + ' ' : ''}${p.name}`).join(', ')})
          </div>
        )}
      </div>
    </div>
  );
}

export const ContextNode = memo(ContextNodeImpl);
