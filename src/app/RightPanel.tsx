import { BarChart3, Cpu, PanelRightClose, SlidersHorizontal, Stethoscope, Trophy } from 'lucide-react';
import { cx } from '../components/ui';
import { useUiStore, type RightTab } from '../stores/uiStore';
import { Inspector } from '../features/objects/Inspector';
import { ExecutionPanel } from '../features/execution/ExecutionPanel';
import { StatsPanel } from '../features/diagnostics/StatsPanel';
import { DiagnosticsPanel } from '../features/diagnostics/DiagnosticsPanel';
import { ChallengePanel } from '../features/challenges/ChallengePanel';

const TABS: { id: RightTab; label: string; icon: typeof Cpu }[] = [
  { id: 'inspect', label: 'Properties', icon: SlidersHorizontal },
  { id: 'execution', label: 'Execution', icon: Cpu },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'diagnostics', label: 'Diagnose', icon: Stethoscope },
  { id: 'challenge', label: 'Challenge', icon: Trophy },
];

export function RightPanel() {
  const open = useUiStore((s) => s.rightPanelOpen);
  const tab = useUiStore((s) => s.rightTab);
  const setPanel = useUiStore((s) => s.setRightPanel);
  if (!open) return null;
  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-slate-200 bg-white" data-testid="right-panel" aria-label="Properties panel">
      <div className="flex h-9 items-center border-b border-slate-200 px-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              title={t.label}
              data-testid={`tab-${t.id}`}
              onClick={() => setPanel(true, t.id)}
              className={cx('flex h-7 items-center gap-1 rounded px-1.5 text-[11px]', tab === t.id ? 'bg-slate-100 font-medium text-slate-800' : 'text-slate-500 hover:bg-slate-50')}
            >
              <Icon size={12} />
              {tab === t.id && t.label}
            </button>
          );
        })}
        <button type="button" className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => setPanel(false)} title="Collapse panel (])">
          <PanelRightClose size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 dc-scroll">
        {tab === 'inspect' && <Inspector />}
        {tab === 'execution' && <ExecutionPanel />}
        {tab === 'stats' && <StatsPanel />}
        {tab === 'diagnostics' && <DiagnosticsPanel />}
        {tab === 'challenge' && <ChallengePanel />}
      </div>
    </aside>
  );
}
