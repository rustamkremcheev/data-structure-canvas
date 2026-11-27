import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, CornerUpLeft, LogIn, LogOut, SkipForward, Square, Check, X, FlaskConical } from 'lucide-react';
import type { ConditionContext, ExecutionContext, LoopContext, LoopType, MethodContext, Operand } from '../../core/model/types';
import { describeCondition, verifyCondition, type Verification } from '../../core/execution/conditions';
import { LOOP_TYPE_LABELS, PHASE_LABELS } from '../../core/execution/loops';
import { Button, cx, inputClass } from '../../components/ui';
import { OperandPicker } from '../../components/values';
import { dispatch, useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { PhaseDial } from '../loops/PhaseDial';
import { runBatch } from '../canvas/actions';

export function Breadcrumb() {
  const doc = useProjectStore((s) => s.doc);
  const topFrame = doc.callStack.length ? doc.frames[doc.callStack[doc.callStack.length - 1]] : undefined;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-0.5 text-[11px]" data-testid="breadcrumb" aria-label="Active execution context">
      <span className="rounded px-1 font-mono text-slate-500">{topFrame ? topFrame.name : 'global'}</span>
      {doc.activeContextPath.map((id, i) => {
        const c = doc.contexts[id];
        const isLast = i === doc.activeContextPath.length - 1;
        return (
          <span key={id} className="flex items-center gap-0.5">
            <ChevronRight size={11} className="text-slate-300" />
            <button
              type="button"
              className={cx('rounded px-1', isLast ? 'bg-amber-50 font-semibold text-amber-800' : 'text-slate-600 hover:bg-slate-100')}
              title={isLast ? 'Active context' : 'Return to this context (exits the inner ones)'}
              onClick={() => {
                const inner = doc.activeContextPath[i + 1];
                if (inner) dispatch({ type: 'exitContext', contextId: inner });
                useUiStore.getState().focusContext(id);
              }}
            >
              {c?.name ?? id}
              {c?.kind === 'loop' && c.phase ? ` · ${PHASE_LABELS[c.phase]}` : ''}
            </button>
          </span>
        );
      })}
    </div>
  );
}

function VerifyButton({ context }: { context: LoopContext | ConditionContext }) {
  const doc = useProjectStore((s) => s.doc);
  const [result, setResult] = useState<{ v: Verification; at: number } | null>(null);
  const historyLen = useProjectStore((s) => s.history.cursor);
  const stale = result && result.at !== historyLen;
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        size="xs"
        variant="ghost"
        title="Optional read-only check of the condition against the current state. It does not choose anything for you."
        disabled={!context.condition}
        data-testid="verify-condition"
        onClick={() => context.condition && setResult({ v: verifyCondition(doc, context.condition), at: historyLen })}
      >
        <FlaskConical size={12} /> Verify
      </Button>
      {result && !stale && (
        <span className={cx('text-[11px]', result.v.status === 'undetermined' ? 'text-amber-700' : 'text-slate-600')} data-testid="verify-result">
          {result.v.status === 'undetermined' ? `can't tell: ${result.v.reason}` : `currently ${result.v.status}`}
        </span>
      )}
    </span>
  );
}

function LoopControls({ loop, entered }: { loop: LoopContext; entered: boolean }) {
  const doc = useProjectStore((s) => s.doc);
  const inCondition = loop.phase === 'condition';
  return (
    <div className="flex gap-3">
      <PhaseDial loop={loop} enabled={entered} onSelect={(p) => dispatch({ type: 'changePhase', contextId: loop.id, phase: p })} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <select
            className={cx(inputClass, 'h-6 w-28 text-[11px]')}
            value={loop.loopType}
            title="Loop type (changes the phase arrangement)"
            data-testid="loop-type"
            onChange={(e) => dispatch({ type: 'updateContext', contextId: loop.id, patch: { loopType: e.target.value as LoopType } })}
          >
            {(['while', 'for', 'do-while', 'custom'] as LoopType[]).map((t) => (
              <option key={t} value={t}>
                {LOOP_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-500" title="Execution metadata. Not an algorithm variable.">
            completed iterations: <b className="font-mono text-slate-700" data-testid="iterations-completed">{loop.iterationsCompleted}</b>
          </span>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
          <div className="truncate font-mono text-[11px] text-slate-700" title={describeCondition(doc, loop.condition)} data-testid="loop-condition-text">
            {describeCondition(doc, loop.condition)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-slate-500">You decide:</span>
            <Button
              size="xs"
              variant={loop.lastConditionResult === true ? 'primary' : 'default'}
              disabled={!entered || !inCondition}
              title={inCondition ? 'Record that the condition is true' : 'Enter the Condition phase first'}
              data-testid="cond-true"
              onClick={() => dispatch({ type: 'recordConditionResult', contextId: loop.id, result: true })}
            >
              <Check size={11} /> True
            </Button>
            <Button
              size="xs"
              variant={loop.lastConditionResult === false ? 'primary' : 'default'}
              disabled={!entered || !inCondition}
              data-testid="cond-false"
              onClick={() => dispatch({ type: 'recordConditionResult', contextId: loop.id, result: false })}
            >
              <X size={11} /> False
            </Button>
            <VerifyButton context={loop} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="xs" variant="primary" disabled={!entered} data-testid="complete-iteration" onClick={() => dispatch({ type: 'completeIteration', contextId: loop.id })}>
            <Check size={11} /> Complete iteration
          </Button>
          <Button size="xs" disabled={!entered} data-testid="loop-continue" onClick={() => dispatch({ type: 'continueLoop', contextId: loop.id })}>
            <SkipForward size={11} /> Continue
          </Button>
          <Button size="xs" disabled={!entered} data-testid="loop-break" onClick={() => dispatch({ type: 'breakLoop', contextId: loop.id })}>
            <Square size={11} /> Break
          </Button>
          <Button size="xs" variant="danger" disabled={!entered} data-testid="exit-context" onClick={() => dispatch({ type: 'exitContext', contextId: loop.id })}>
            <LogOut size={11} /> Exit loop
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConditionControls({ cond, entered }: { cond: ConditionContext; entered: boolean }) {
  const doc = useProjectStore((s) => s.doc);
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px]">if ({describeCondition(doc, cond.condition)})</div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-slate-500">You decide:</span>
        <Button size="xs" variant={cond.result === true ? 'primary' : 'default'} disabled={!entered} onClick={() => dispatch({ type: 'recordConditionResult', contextId: cond.id, result: true })}>
          True
        </Button>
        <Button size="xs" variant={cond.result === false ? 'primary' : 'default'} disabled={!entered} onClick={() => dispatch({ type: 'recordConditionResult', contextId: cond.id, result: false })}>
          False
        </Button>
        <VerifyButton context={cond} />
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="xs" variant={cond.branch === 'then' ? 'primary' : 'default'} disabled={!entered} onClick={() => dispatch({ type: 'chooseBranch', contextId: cond.id, branch: 'then' })}>
          Enter THEN
        </Button>
        <Button size="xs" variant={cond.branch === 'else' ? 'primary' : 'default'} disabled={!entered} onClick={() => dispatch({ type: 'chooseBranch', contextId: cond.id, branch: 'else' })}>
          Enter ELSE
        </Button>
        <Button size="xs" variant="danger" disabled={!entered} onClick={() => dispatch({ type: 'exitContext', contextId: cond.id })}>
          <LogOut size={11} /> Exit if
        </Button>
      </div>
    </div>
  );
}

function MethodControls({ method, entered }: { method: MethodContext; entered: boolean }) {
  const doc = useProjectStore((s) => s.doc);
  const [ret, setRet] = useState<Operand | null>(null);
  const topId = doc.callStack[doc.callStack.length - 1];
  const top = topId ? doc.frames[topId] : undefined;
  const topIsThis = top?.methodId === method.id;
  return (
    <div className="space-y-2">
      <div className="font-mono text-[11px] text-slate-700">
        {method.returnType ?? 'void'} {method.methodName}({method.parameters.map((p) => `${p.type ? p.type + ' ' : ''}${p.name}`).join(', ')})
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          size="xs"
          variant="primary"
          data-testid="method-call"
          title="Push a new stack frame for this method and enter it. Arguments stay uninitialized until you assign them."
          onClick={() => {
            const depth = Object.values(doc.frames).filter((f) => f.methodId === method.id).length + 1;
            const last = Object.values(doc.frames).at(-1);
            const pos = last ? { x: last.position.x + 240, y: last.position.y } : { x: method.position.x, y: method.position.y + 140 };
            runBatch(`Call ${method.methodName}()`, [
              { type: 'createStackFrame', name: `${method.methodName}#${depth}`, methodId: method.id, position: pos, declareParameters: true },
              ...(entered ? [] : [{ type: 'enterContext' as const, contextId: method.id }]),
            ]);
          }}
        >
          <LogIn size={11} /> Call (push frame)
        </Button>
        {entered && (
          <Button size="xs" variant="danger" onClick={() => dispatch({ type: 'exitContext', contextId: method.id })}>
            <LogOut size={11} /> Leave method context
          </Button>
        )}
      </div>
      {top && (
        <div className="space-y-1 rounded-md border border-teal-200 bg-teal-50/40 p-1.5">
          <div className="text-[11px] text-teal-800">
            Top frame: <b>{top.name}</b> {topIsThis ? '' : '(another method)'}
          </div>
          <div className="flex items-center gap-1">
            <span className="w-14 text-[11px] text-slate-500">return</span>
            <div className="min-w-0 flex-1">
              <OperandPicker value={ret} onChange={setRet} testId="return-operand" />
            </div>
            <Button size="xs" disabled={!ret} onClick={() => ret && dispatch({ type: 'setReturnValue', frameId: top.id, source: { kind: 'operand', operand: ret } })}>
              Set
            </Button>
          </div>
          <Button
            size="xs"
            variant="danger"
            title="Pop the frame. The return value is NOT assigned anywhere — assign it in the caller yourself."
            onClick={() =>
              runBatch(`Return from ${top.name}`, [
                { type: 'exitFrame', frameId: top.id },
                ...(entered && topIsThis && Object.values(doc.frames).filter((f) => f.methodId === method.id && f.status === 'active').length === 1
                  ? [{ type: 'exitContext' as const, contextId: method.id }]
                  : []),
              ])
            }
          >
            <CornerUpLeft size={11} /> Return (pop frame)
          </Button>
        </div>
      )}
    </div>
  );
}

export function ExecutionController() {
  const doc = useProjectStore((s) => s.doc);
  const open = useUiStore((s) => s.controllerOpen);
  const toggle = useUiStore((s) => s.toggleController);
  const focused = useUiStore((s) => s.focusedContextId);
  const activeId = doc.activeContextPath[doc.activeContextPath.length - 1];
  const contextId = focused && doc.contexts[focused] ? focused : activeId;
  const ctx: ExecutionContext | undefined = contextId ? doc.contexts[contextId] : undefined;
  const entered = ctx ? doc.activeContextPath.includes(ctx.id) : false;
  const contexts = Object.values(doc.contexts);

  return (
    <div className="absolute bottom-3 left-3 z-20 w-[460px] rounded-lg border border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm" data-testid="execution-controller">
      <div className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Manual execution</span>
        <div className="min-w-0 flex-1">
          <Breadcrumb />
        </div>
        <button type="button" className="rounded p-0.5 text-slate-400 hover:bg-slate-100" onClick={toggle} aria-label={open ? 'Collapse controller' : 'Expand controller'} data-testid="toggle-controller">
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      {open && (
        <div className="space-y-2 p-2.5">
          <div className="flex items-center gap-1.5">
            <select
              className={cx(inputClass, 'h-6 flex-1 text-[11px]')}
              value={ctx?.id ?? ''}
              data-testid="controller-context-select"
              onChange={(e) => useUiStore.getState().focusContext(e.target.value || null)}
            >
              <option value="">{contexts.length ? 'Select a context…' : 'No contexts yet — use the Loop, Condition or Method tool'}</option>
              {contexts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kind}: {c.name}
                  {doc.activeContextPath.includes(c.id) ? ' (entered)' : ''}
                </option>
              ))}
            </select>
            {ctx && !entered && (
              <Button size="xs" variant="primary" data-testid="enter-context" onClick={() => dispatch({ type: 'enterContext', contextId: ctx.id })}>
                <LogIn size={11} /> Enter {ctx.kind}
              </Button>
            )}
          </div>
          {ctx?.kind === 'loop' && <LoopControls loop={ctx} entered={entered} />}
          {ctx?.kind === 'condition' && <ConditionControls cond={ctx} entered={entered} />}
          {ctx?.kind === 'method' && <MethodControls method={ctx} entered={entered} />}
          {ctx && !entered && ctx.kind !== 'method' && (
            <p className="text-[11px] text-slate-400">Entering a context only records where you are. It does not initialize, evaluate or change anything.</p>
          )}
        </div>
      )}
    </div>
  );
}
