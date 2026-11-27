import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Stethoscope } from 'lucide-react';
import { runDiagnostics, type Diagnostic } from '../../core/validation/diagnostics';
import { Button, cx, Empty } from '../../components/ui';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';

const ICON = { error: AlertCircle, warning: AlertTriangle, info: Info };
const STYLE = {
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-slate-200 bg-white text-slate-700',
};

/** Diagnostics only run when the user asks, and never change the canvas. */
export function DiagnosticsPanel() {
  const [results, setResults] = useState<{ items: Diagnostic[]; cursor: number } | null>(null);
  const cursor = useProjectStore((s) => s.history.cursor);
  const revision = useProjectStore((s) => s.revision);
  const [ranAt, setRanAt] = useState(0);
  const stale = results !== null && ranAt !== revision;
  const counts = results ? { error: 0, warning: 0, info: 0, ...Object.fromEntries(['error', 'warning', 'info'].map((s) => [s, results.items.filter((d) => d.severity === s).length])) } : null;

  return (
    <div data-testid="diagnostics-panel">
      <p className="mb-2 text-[12px] leading-relaxed text-slate-500">
        Optional, read-only observations about the current state. Informational findings (cycles, unreachable objects) may be intentional. Nothing is fixed for you.
      </p>
      <Button
        variant="primary"
        data-testid="run-diagnostics"
        onClick={() => {
          setResults({ items: runDiagnostics(useProjectStore.getState().doc), cursor });
          setRanAt(revision);
        }}
      >
        <Stethoscope size={13} /> Run diagnostics
      </Button>
      {stale && <div className="mt-2 text-[11px] text-amber-700">The state changed since the last run.</div>}
      {counts && (
        <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
          <span>{counts.error} errors</span>
          <span>{counts.warning} warnings</span>
          <span>{counts.info} info</span>
        </div>
      )}
      <div className="mt-2 space-y-1.5">
        {results && results.items.length === 0 && <Empty>No findings.</Empty>}
        {results?.items.map((d) => {
          const Icon = ICON[d.severity];
          return (
            <button
              type="button"
              key={d.id}
              className={cx('block w-full rounded-md border px-2 py-1.5 text-left text-[12px]', STYLE[d.severity])}
              onClick={() => useUiStore.getState().setSelection(d.elementIds.filter((id) => useProjectStore.getState().doc.objects[id] || useProjectStore.getState().doc.variables[id]))}
              title="Select the affected elements"
            >
              <div className="flex items-start gap-1.5">
                <Icon size={13} className="mt-0.5 shrink-0" />
                <div>
                  <div>{d.message}</div>
                  {d.note && <div className="mt-0.5 text-[11px] opacity-70">{d.note}</div>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
