import { Fragment } from 'react';
import { IconButton } from '../../components/ui';
import { useUiStore } from '../../stores/uiStore';
import { openCheckpointDialog } from '../canvas/actions';
import { CheckpointIcon } from './icons';
import { TOOLS } from './tools';

export function Toolbar() {
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  let lastGroup = '';
  return (
    <nav aria-label="Tools" className="flex w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-slate-200 bg-white py-2 dc-scroll" data-testid="toolbar">
      {TOOLS.map((t) => {
        const sep = lastGroup && lastGroup !== t.group;
        lastGroup = t.group;
        const Icon = t.icon;
        return (
          <Fragment key={t.id}>
            {sep && <div className="my-1 h-px w-6 bg-slate-200" />}
            <IconButton label={t.label} shortcut={t.shortcut} active={tool === t.id} onClick={() => setTool(t.id)} data-testid={`tool-${t.id}`} title={`${t.label} (${t.shortcut}) — ${t.hint}`}>
              <Icon size={17} />
            </IconButton>
            {t.id === 'frame' && (
              <IconButton label="Create Checkpoint" shortcut="K" onClick={openCheckpointDialog} data-testid="tool-checkpoint" title="Create Checkpoint (K) — bookmark the current state in the timeline">
                <CheckpointIcon size={17} />
              </IconButton>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
