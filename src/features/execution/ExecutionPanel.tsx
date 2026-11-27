import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { ComparisonOperator, DocumentState, ExecutionContext, Id, Operand } from '../../core/model/types';
import { OPERATORS } from '../../core/execution/conditions';
import { PHASE_LABELS } from '../../core/execution/loops';
import { variablesInScope } from '../../core/model/queries';
import { formatValue } from '../../core/model/values';
import { Button, cx, Empty, inputClass, SectionTitle } from '../../components/ui';
import { OperandPicker, ValueChip } from '../../components/values';
import { dispatch, useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';

function ContextTree({ doc, parentId, depth }: { doc: DocumentState; parentId: Id | undefined; depth: number }) {
  const children = Object.values(doc.contexts).filter((c) => (c.parentId ?? undefined) === parentId || (parentId === undefined && c.parentId && !doc.contexts[c.parentId]));
  if (!children.length) return null;
  return (
    <ul className={cx(depth > 0 && 'ml-3 border-l border-slate-200 pl-2')}>
      {children.map((c) => (
        <li key={c.id}>
          <ContextRow c={c} doc={doc} />
          <ContextTree doc={doc} parentId={c.id} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

function ContextRow({ c, doc }: { c: ExecutionContext; doc: DocumentState }) {
  const idx = doc.activeContextPath.indexOf(c.id);
  const active = idx !== -1 && idx === doc.activeContextPath.length - 1;
  return (
    <div className={cx('my-0.5 flex items-center justify-between gap-2 rounded px-1.5 py-0.5', active && 'bg-amber-50')}>
      <button
        type="button"
        className="min-w-0 truncate text-left text-[12px] hover:underline"
        onClick={() => {
          useUiStore.getState().setSelection([c.id]);
          useUiStore.getState().focusContext(c.id);
        }}
      >
        <span className="text-slate-400">{c.kind}</span> {c.name}
        {c.kind === 'loop' && c.phase && <span className="text-slate-500"> · {PHASE_LABELS[c.phase]} · it {c.iterationsCompleted + 1}</span>}
      </button>
      <span className="shrink-0">
        {idx === -1 ? (
          <Button size="xs" variant="ghost" onClick={() => dispatch({ type: 'enterContext', contextId: c.id })}>
            Enter
          </Button>
        ) : (
          <Button size="xs" variant="ghost" onClick={() => dispatch({ type: 'exitContext', contextId: c.id })}>
            Exit
          </Button>
        )}
      </span>
    </div>
  );
}

function CompareRecorder() {
  const [left, setLeft] = useState<Operand | null>(null);
  const [right, setRight] = useState<Operand | null>(null);
  const [op, setOp] = useState<ComparisonOperator>('<');
  const record = (result: boolean) => left && right && dispatch({ type: 'recordComparison', left, operator: op, right, result });
  return (
    <div className="space-y-1.5" data-testid="compare-recorder">
      <OperandPicker value={left} onChange={setLeft} placeholder="left" />
      <select className={cx(inputClass, 'w-20 font-mono')} value={op} onChange={(e) => setOp(e.target.value as ComparisonOperator)}>
        {OPERATORS.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <OperandPicker value={right} onChange={setRight} placeholder="right" />
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-slate-500">You decide:</span>
        <Button size="xs" disabled={!left || !right} onClick={() => record(true)}>
          <Check size={11} /> True
        </Button>
        <Button size="xs" disabled={!left || !right} onClick={() => record(false)}>
          <X size={11} /> False
        </Button>
      </div>
    </div>
  );
}

export function ExecutionPanel() {
  const doc = useProjectStore((s) => s.doc);
  const frames = [...doc.callStack].reverse().map((id) => doc.frames[id]).filter(Boolean);
  const returned = Object.values(doc.frames).filter((f) => f.status === 'returned');
  const globals = variablesInScope(doc, 'global');
  return (
    <div data-testid="execution-panel">
      <SectionTitle>Execution contexts</SectionTitle>
      {Object.keys(doc.contexts).length ? <ContextTree doc={doc} parentId={undefined} depth={0} /> : <Empty>Use the Loop, Condition or Method tool to create contexts.</Empty>}

      <SectionTitle>Call stack</SectionTitle>
      <div className="space-y-1" data-testid="call-stack">
        {frames.map((f, i) => (
          <button
            type="button"
            key={f.id}
            onClick={() => useUiStore.getState().setSelection([f.id])}
            className={cx('block w-full rounded border px-2 py-1 text-left text-[12px]', i === 0 ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white')}
          >
            <div className="flex justify-between">
              <b className="font-medium">{f.name}</b>
              <span className="text-[10px] text-slate-500">{i === 0 ? 'top' : ''}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {variablesInScope(doc, f.id).map((v) => (
                <span key={v.id} className="font-mono text-[10px] text-slate-600">
                  {v.name}={formatValue(v.value, doc)}
                </span>
              ))}
            </div>
          </button>
        ))}
        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[12px]">
          <b className="font-medium">global</b>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {globals.map((v) => (
              <span key={v.id} className="font-mono text-[10px] text-slate-600">
                {v.name}={formatValue(v.value, doc)}
              </span>
            ))}
          </div>
        </div>
        {returned.length > 0 && (
          <div className="text-[11px] text-slate-400">
            Returned: {returned.map((f) => `${f.name}${f.returnValue ? ` → ${formatValue(f.returnValue, doc)}` : ''}`).join(', ')}
          </div>
        )}
      </div>

      <SectionTitle>Record a comparison</SectionTitle>
      <CompareRecorder />

      <SectionTitle>Result</SectionTitle>
      {doc.result ? (
        <div className="flex items-center gap-2 text-[12px]" data-testid="result-display">
          <span>{doc.result.sourceLabel}</span>
          <ValueChip value={doc.result.value} doc={doc} />
          <Button size="xs" variant="ghost" onClick={() => dispatch({ type: 'clearResult' })}>
            Clear
          </Button>
        </div>
      ) : (
        <div className="text-[12px] text-slate-400">Not identified yet. Use “Mark as result” on a variable or object.</div>
      )}
    </div>
  );
}
