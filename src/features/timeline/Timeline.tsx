import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Flag, GitBranch, Redo2, Trash2, Undo2, FastForward } from 'lucide-react';
import { cursorOfEntry, isAlgorithmOperation, type OperationRecord } from '../../core/history/history';
import { Button, cx } from '../../components/ui';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { openCheckpointDialog } from '../canvas/actions';

const CATEGORY_STYLE: Record<OperationRecord['category'], string> = {
  semantic: 'border-sky-200 bg-sky-50/60',
  execution: 'border-amber-200 bg-amber-50/60',
  visual: 'border-slate-200 bg-slate-50',
  annotation: 'border-slate-200 bg-slate-50',
};

function patchSummary(r: OperationRecord): string {
  const paths = new Set(r.patches.map((p) => p.path.slice(0, 2).join('.')));
  return [...paths].slice(0, 6).join(', ') + (paths.size > 6 ? ', …' : '');
}

export function Timeline() {
  const history = useProjectStore((s) => s.history);
  const goTo = useProjectStore((s) => s.goTo);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const switchBranch = useProjectStore((s) => s.switchBranch);
  const removeCheckpoint = useProjectStore((s) => s.removeCheckpoint);
  const open = useUiStore((s) => s.timelineOpen);
  const toggle = useUiStore((s) => s.toggleTimeline);
  const [showUi, setShowUi] = useState(false);
  const [inspect, setInspect] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { entries, cursor } = history;
  const viewingPast = cursor < entries.length;
  const uiHidden = entries.filter((e) => !isAlgorithmOperation(e)).length;

  useEffect(() => {
    const el = scroller.current?.querySelector('[data-current="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursor, open]);

  const cpAt = new Map<number, typeof history.checkpoints>();
  for (const cp of history.checkpoints) {
    const c = cursorOfEntry(history, cp.entryId);
    if (c >= 0) cpAt.set(c, [...(cpAt.get(c) ?? []), cp]);
  }
  const inspected = inspect !== null ? entries[inspect] : cursor > 0 ? entries[cursor - 1] : undefined;

  return (
    <section className="shrink-0 border-t border-slate-200 bg-white" data-testid="timeline" aria-label="Execution timeline">
      <div className="flex h-9 items-center gap-2 px-3">
        <button type="button" onClick={toggle} className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500" data-testid="toggle-timeline">
          {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />} Timeline
        </button>
        <Button size="xs" variant="ghost" onClick={undo} disabled={cursor === 0} title="Undo (Ctrl+Z)" data-testid="undo">
          <Undo2 size={12} />
        </Button>
        <Button size="xs" variant="ghost" onClick={redo} disabled={!viewingPast} title="Redo (Ctrl+Shift+Z)" data-testid="redo">
          <Redo2 size={12} />
        </Button>
        <input
          type="range"
          min={0}
          max={entries.length}
          value={cursor}
          onChange={(e) => goTo(Number(e.target.value))}
          className="w-48 accent-violet-500"
          aria-label="Timeline position"
          data-testid="timeline-slider"
        />
        <span className="text-[11px] text-slate-500" data-testid="timeline-position">
          {cursor} / {entries.length} operations{uiHidden > 0 && !showUi ? ` · ${uiHidden} UI actions hidden` : ''}
        </span>
        {viewingPast && (
          <span className="flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800" data-testid="past-banner">
            Viewing a past state
            <button type="button" className="inline-flex items-center gap-0.5 underline" onClick={() => goTo(entries.length)} data-testid="goto-latest">
              <FastForward size={11} /> latest
            </button>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            <input type="checkbox" checked={showUi} onChange={(e) => setShowUi(e.target.checked)} /> show UI actions
          </label>
          <Button size="xs" variant="ghost" onClick={openCheckpointDialog} title="Create checkpoint (K)">
            <Flag size={12} /> Checkpoint
          </Button>
          {history.branches.length > 0 && (
            <select
              className="h-6 rounded border border-slate-200 bg-white px-1 text-[11px]"
              value=""
              onChange={(e) => e.target.value && switchBranch(e.target.value)}
              title="Switch to a preserved branch"
              data-testid="branch-select"
            >
              <option value="">{history.branches.length} branch(es)…</option>
              {history.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.entries.length} ops)
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {open && (
        <div className="flex h-[124px] border-t border-slate-100">
          <div ref={scroller} className="flex min-w-0 flex-1 items-stretch gap-1.5 overflow-x-auto px-3 py-2 dc-scroll" data-testid="timeline-entries">
            <TimelineCard index={0} current={cursor === 0} future={false} onClick={() => goTo(0)} checkpoints={cpAt.get(0)} onRemoveCp={removeCheckpoint}>
              <div className="text-[11px] font-medium text-slate-700">Initial state</div>
              <div className="text-[10px] text-slate-400">empty canvas</div>
            </TimelineCard>
            {entries.map((r, i) => {
              if (!showUi && !isAlgorithmOperation(r) && cursor !== i + 1 && !cpAt.has(i + 1)) return null;
              return (
                <TimelineCard
                  key={r.id}
                  index={i + 1}
                  current={cursor === i + 1}
                  future={i + 1 > cursor}
                  category={r.category}
                  onClick={() => {
                    goTo(i + 1);
                    setInspect(i);
                  }}
                  checkpoints={cpAt.get(i + 1)}
                  onRemoveCp={removeCheckpoint}
                >
                  <div className="line-clamp-2 text-[11px] leading-snug text-slate-700" title={r.description}>
                    {r.description}
                  </div>
                  <div className="mt-auto flex gap-1 text-[9px] text-slate-400">
                    {r.contextName && <span className="truncate">{r.contextName}</span>}
                    {r.iteration !== null && <span>· it {r.iteration}</span>}
                  </div>
                </TimelineCard>
              );
            })}
          </div>
          <div className="w-72 shrink-0 overflow-auto border-l border-slate-100 px-3 py-2 text-[11px] dc-scroll" data-testid="operation-details">
            {inspected ? (
              <>
                <div className="font-medium text-slate-700">{inspected.description}</div>
                <dl className="mt-1 grid grid-cols-[72px_1fr] gap-x-2 gap-y-0.5 text-slate-500">
                  <dt>Type</dt>
                  <dd className="font-mono">{inspected.type}</dd>
                  <dt>Category</dt>
                  <dd>{inspected.category}</dd>
                  <dt>Counts as</dt>
                  <dd>{inspected.ops.join(', ')}</dd>
                  <dt>Context</dt>
                  <dd>{inspected.contextName ?? 'global'}</dd>
                  <dt>Iteration</dt>
                  <dd>{inspected.iteration ?? '—'}</dd>
                  <dt>Time</dt>
                  <dd>{new Date(inspected.timestamp).toLocaleTimeString()}</dd>
                  <dt>Changed</dt>
                  <dd className="break-all font-mono text-[10px]">{patchSummary(inspected) || '—'}</dd>
                </dl>
              </>
            ) : (
              <div className="text-slate-400">Click an operation to view the state after it.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function TimelineCard({
  index,
  current,
  future,
  category,
  onClick,
  children,
  checkpoints,
  onRemoveCp,
}: {
  index: number;
  current: boolean;
  future: boolean;
  category?: OperationRecord['category'];
  onClick(): void;
  children: React.ReactNode;
  checkpoints?: { id: string; name: string; kind: 'manual' | 'iteration' }[];
  onRemoveCp(id: string): void;
}) {
  return (
    <div className="flex w-40 shrink-0 flex-col">
      <div className="flex h-4 items-center gap-1 overflow-hidden">
        {checkpoints?.map((cp) => (
          <span
            key={cp.id}
            className={cx('flex items-center gap-0.5 truncate rounded px-1 text-[9px]', cp.kind === 'manual' ? 'bg-violet-100 text-violet-800' : 'bg-amber-100 text-amber-800')}
            title={cp.name}
            data-testid="checkpoint-marker"
          >
            <Flag size={8} /> {cp.name}
            {cp.kind === 'manual' && (
              <button type="button" onClick={() => onRemoveCp(cp.id)} title="Remove checkpoint" className="opacity-50 hover:opacity-100">
                <Trash2 size={8} />
              </button>
            )}
          </span>
        ))}
      </div>
      <button
        type="button"
        data-current={current}
        data-testid={`timeline-entry-${index}`}
        onClick={onClick}
        className={cx(
          'flex flex-1 flex-col rounded-md border px-2 py-1 text-left',
          category ? CATEGORY_STYLE[category] : 'border-slate-200 bg-white',
          current && 'ring-2 ring-violet-400',
          future && 'opacity-45',
        )}
      >
        <span className="font-mono text-[9px] text-slate-400">
          #{index} {future && <GitBranch size={8} className="inline" />}
        </span>
        {children}
      </button>
    </div>
  );
}
