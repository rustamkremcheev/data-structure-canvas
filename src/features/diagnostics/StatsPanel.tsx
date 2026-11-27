import { computeStats } from '../../core/execution/stats';
import { SectionTitle } from '../../components/ui';
import { useProjectStore } from '../../stores/projectStore';

function Stat({ label, value, testId }: { label: string; value: number; testId?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-1 text-[12px]">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono font-semibold text-slate-800" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

export function StatsPanel() {
  const history = useProjectStore((s) => s.history);
  const s = computeStats(history.entries.slice(0, history.cursor));
  return (
    <div data-testid="stats-panel">
      <p className="mb-2 text-[12px] leading-relaxed text-slate-500">
        Counts of operations you explicitly performed up to the current point in the timeline. This is a tally, not an automatic complexity analysis.
      </p>
      <SectionTitle>Algorithm operations</SectionTitle>
      <Stat label="Object allocations" value={s.allocations} testId="stat-allocations" />
      <Stat label="Variable declarations" value={s.declarations} />
      <Stat label="Initializations" value={s.initializations} />
      <Stat label="Value assignments" value={s.assignments} />
      <Stat label="Reference changes" value={s.referenceChanges} testId="stat-references" />
      <Stat label="Explicit comparisons" value={s.comparisons} />
      <Stat label="Condition checks" value={s.conditionChecks} />
      <Stat label="Iterations completed" value={s.iterations} />
      <Stat label="Method calls" value={s.methodCalls} />
      <Stat label="Returns" value={s.returns} />
      <div className="mt-1 flex items-center justify-between rounded bg-violet-50 px-2 py-1 text-[12px]">
        <span className="font-medium text-violet-800">Total algorithm operations</span>
        <span className="font-mono font-semibold text-violet-900" data-testid="stat-total">
          {s.algorithmTotal}
        </span>
      </div>
      <SectionTitle>Not counted as algorithm work</SectionTitle>
      <Stat label="Execution control (enter/exit, phases, definitions, edits)" value={s.executionControl} />
      <Stat label="UI actions (moves, colors, annotations)" value={s.uiActions} testId="stat-ui" />
      <p className="mt-2 text-[11px] text-slate-400">Selection, panning and zooming are never recorded.</p>
    </div>
  );
}
