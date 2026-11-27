import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { RefSource } from '../../core/model/types';
import { GLOBAL_SCOPE_ID, refSourceKey } from '../../core/model/types';
import { isScopeLive, scopeName } from '../../core/model/queries';
import { cx } from '../../components/ui';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { InlineValue } from '../objects/InlineValue';

function VariableNodeImpl({ data }: NodeProps) {
  const { variableId } = data as { variableId: string };
  const v = useProjectStore((s) => s.doc.variables[variableId]);
  const doc = useProjectStore((s) => s.doc);
  const tool = useUiStore((s) => s.tool);
  const pending = useUiStore((s) => s.pendingRefSource);
  if (!v) return null;
  const source: RefSource = { kind: 'variable', variableId: v.id };
  const isPending = pending ? refSourceKey(pending) === refSourceKey(source) : false;
  const live = isScopeLive(doc, v.scopeId);
  const local = v.scopeId !== GLOBAL_SCOPE_ID;

  return (
    <div
      data-testid={`variable-${v.name}`}
      data-variable-id={v.id}
      onClick={(e) => {
        if (tool !== 'reference') return;
        e.stopPropagation();
        useUiStore.getState().setPendingRefSource(isPending ? null : source);
      }}
      className={cx(
        'dc-node flex h-8 items-center gap-1.5 rounded-full border bg-white pl-2.5 pr-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]',
        local ? 'border-teal-300' : 'border-sky-300',
        !live && 'opacity-45',
        isPending && 'ring-2 ring-violet-300',
      )}
      title={`${v.declaredType ? v.declaredType + ' ' : ''}${v.name} — scope: ${scopeName(doc, v.scopeId)}${live ? '' : ' (out of scope)'}`}
    >
      <Handle type="target" id="in" position={Position.Left} className="dc-target-handle" />
      {local && <span className="rounded bg-teal-50 px-1 font-mono text-[9px] text-teal-700">{scopeName(doc, v.scopeId)}</span>}
      <span className="font-mono text-[12px] font-semibold text-slate-800">{v.name}</span>
      {v.declaredType && <span className="font-mono text-[10px] text-slate-400">: {v.declaredType}</span>}
      <span className="text-slate-300">=</span>
      <InlineValue target={source} value={v.value} testId={`varvalue-${v.name}`} />
      <Handle
        type="source"
        id="out"
        position={Position.Right}
        className="dc-handle-ref"
        style={{ right: -5 }}
        title={`Drag to point ${v.name} at an object (drop on a variable to copy its value)`}
        data-testid={`handle-var-${v.name}`}
      />
    </div>
  );
}

export const VariableNode = memo(VariableNodeImpl);
