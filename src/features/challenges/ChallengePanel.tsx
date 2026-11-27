import { useState } from 'react';
import { CheckCircle2, CircleDashed, XCircle, Camera } from 'lucide-react';
import { getChallenge, listChallenges, type CheckReport } from '../../core/validation/challenges';
import type { Operand } from '../../core/model/types';
import { formatValue } from '../../core/model/values';
import { Button, cx, SectionTitle } from '../../components/ui';
import { OperandPicker } from '../../components/values';
import { dispatch, useProjectStore } from '../../stores/projectStore';
import { openConfirm } from '../../stores/dialogStore';

export function ChallengePanel() {
  const meta = useProjectStore((s) => s.meta);
  const doc = useProjectStore((s) => s.doc);
  const revision = useProjectStore((s) => s.revision);
  const [report, setReport] = useState<{ r: CheckReport; at: number } | null>(null);
  const [head, setHead] = useState<Operand | null>(null);
  const challenge = meta.challengeId ? getChallenge(meta.challengeId) : undefined;

  if (!challenge) {
    return (
      <div className="space-y-2 text-[12px] text-slate-600">
        <p>This is a sandbox project. Start a challenge in a new project:</p>
        {listChallenges().map((c) => (
          <Button
            key={c.id}
            variant="primary"
            onClick={() =>
              openConfirm({
                title: 'Start challenge',
                message: `Open a new empty challenge project for “${c.number}. ${c.title}”? Your current project stays saved locally.`,
                confirmLabel: 'Start',
                onConfirm: () => useProjectStore.getState().newProject('challenge', c.id),
              })
            }
          >
            {c.number}. {c.title}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div data-testid="challenge-panel" className="text-[12px] text-slate-700">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold text-slate-800">
          {challenge.number}. {challenge.title}
        </h3>
        <span className="rounded bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700">{challenge.difficulty}</span>
      </div>
      <div className="mt-2 space-y-1.5 leading-relaxed">
        {challenge.description.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <SectionTitle>Examples</SectionTitle>
      <div className="space-y-1">
        {challenge.examples.map((e, i) => (
          <div key={i} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px]">
            <div>Input: {e.input}</div>
            <div>Output: {e.output}</div>
          </div>
        ))}
      </div>
      <SectionTitle>Constraints</SectionTitle>
      <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-600">
        {challenge.constraints.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <SectionTitle>How checking works</SectionTitle>
      <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-500">
        {challenge.checkingNotes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <SectionTitle>Capture input (read-only snapshot)</SectionTitle>
      <div className="flex gap-1">
        <div className="min-w-0 flex-1">
          <OperandPicker value={head} onChange={setHead} placeholder="variable pointing at the input head" testId="capture-head" allowLiteral={false} />
        </div>
        <Button size="xs" disabled={!head} data-testid="capture-input" onClick={() => head && dispatch({ type: 'captureInput', head })}>
          <Camera size={11} /> Capture
        </Button>
      </div>
      {doc.capturedInput && (
        <div className="mt-1 text-[11px] text-slate-500" data-testid="captured-input">
          Captured: [{doc.capturedInput.values.map((v) => formatValue(v)).join(', ')}] ({doc.capturedInput.nodeIds.length} nodes{doc.capturedInput.terminated ? '' : ', not null-terminated'})
        </div>
      )}
      <SectionTitle>Your result</SectionTitle>
      <div className="text-[11px] text-slate-500">{doc.result ? `${doc.result.sourceLabel} = ${formatValue(doc.result.value, doc)}` : 'Not identified yet.'}</div>
      <div className="mt-2">
        <Button variant="primary" data-testid="check-result" onClick={() => setReport({ r: challenge.validate(useProjectStore.getState().doc), at: revision })}>
          Check Result
        </Button>
        <span className="ml-2 text-[11px] text-slate-400">Read-only — never changes the canvas.</span>
      </div>
      {report && (
        <div
          className={cx(
            'mt-2 rounded-md border p-2',
            report.r.status === 'pass' ? 'border-emerald-200 bg-emerald-50' : report.r.status === 'fail' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50',
          )}
          data-testid="check-report"
        >
          <div className="font-medium" data-testid="check-status">
            {report.r.status === 'pass' ? 'Passed' : report.r.status === 'fail' ? 'Not correct yet' : 'Incomplete'} — {report.r.summary}
          </div>
          <ul className="mt-1 space-y-1">
            {report.r.items.map((i) => (
              <li key={i.label} className="flex items-start gap-1.5 text-[11px]">
                {i.status === 'pass' ? (
                  <CheckCircle2 size={12} className="mt-0.5 text-emerald-600" />
                ) : i.status === 'fail' ? (
                  <XCircle size={12} className="mt-0.5 text-rose-600" />
                ) : (
                  <CircleDashed size={12} className="mt-0.5 text-amber-600" />
                )}
                <span>
                  <b className="font-medium">{i.label}.</b> {i.detail}
                </span>
              </li>
            ))}
          </ul>
          {report.at !== revision && <div className="mt-1 text-[11px] text-amber-700">The state changed since this check.</div>}
        </div>
      )}
    </div>
  );
}
