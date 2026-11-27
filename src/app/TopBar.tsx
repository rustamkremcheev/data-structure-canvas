import { CircleHelp, Download, FolderOpen, Grid3x3, Magnet, PanelBottom, PanelRight, Redo2, Save, Undo2, Maximize } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { IconButton, cx } from '../components/ui';
import { useProjectStore } from '../stores/projectStore';
import { useUiStore } from '../stores/uiStore';
import { exportCurrent, renameCurrentPrompt, saveCurrent } from '../features/projects/ProjectsDialog';

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden>
      <rect x="3" y="10" width="10" height="12" rx="2" fill="#e0f2fe" stroke="#64748b" />
      <rect x="19" y="10" width="10" height="12" rx="2" fill="#dcfce7" stroke="#64748b" />
      <path d="M13 16h5" stroke="#334155" strokeWidth="1.5" />
      <path d="M16 13.5l3 2.5-3 2.5" fill="none" stroke="#334155" strokeWidth="1.5" />
    </svg>
  );
}

export function TopBar() {
  const meta = useProjectStore((s) => s.meta);
  const saveStatus = useProjectStore((s) => s.saveStatus);
  const cursor = useProjectStore((s) => s.history.cursor);
  const total = useProjectStore((s) => s.history.entries.length);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const ui = useUiStore();
  const rf = useReactFlow();

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3" data-testid="topbar">
      <div className="flex items-center gap-2">
        <Logo />
        <span className="text-[13px] font-semibold tracking-tight text-slate-800">DataCanvas</span>
        <span className="hidden text-[11px] text-slate-400 xl:inline">Don’t watch algorithms. Think through them.</span>
      </div>
      <div className="mx-2 h-5 w-px bg-slate-200" />
      <button type="button" className="max-w-64 truncate rounded px-1.5 py-0.5 text-[12px] font-medium text-slate-700 hover:bg-slate-100" onClick={renameCurrentPrompt} title="Rename project" data-testid="project-name">
        {meta.name}
      </button>
      <span className={cx('rounded px-1.5 text-[10px] font-medium', meta.mode === 'challenge' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')} data-testid="mode-badge">
        {meta.mode === 'challenge' ? 'Challenge' : 'Sandbox'}
      </span>
      <span className="text-[11px] text-slate-400" data-testid="save-status">
        {saveStatus === 'saved' ? 'Saved locally' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Unsaved changes'}
      </span>
      <div className="ml-auto flex items-center gap-0.5">
        <IconButton label="Undo" shortcut="Ctrl+Z" onClick={undo} disabled={cursor === 0}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Redo" shortcut="Ctrl+Shift+Z" onClick={redo} disabled={cursor >= total}>
          <Redo2 size={16} />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-slate-200" />
        <IconButton label="Fit to view" shortcut="Shift+1" onClick={() => rf.fitView({ padding: 0.2, duration: 200 })}>
          <Maximize size={16} />
        </IconButton>
        <IconButton label="Toggle grid" shortcut="G" active={ui.showGrid} onClick={ui.toggleGrid}>
          <Grid3x3 size={16} />
        </IconButton>
        <IconButton label="Snap to grid" shortcut="Shift+G" active={ui.snapToGrid} onClick={ui.toggleSnap}>
          <Magnet size={16} />
        </IconButton>
        <IconButton label="Toggle timeline" active={ui.timelineOpen} onClick={ui.toggleTimeline}>
          <PanelBottom size={16} />
        </IconButton>
        <IconButton label="Toggle properties panel" shortcut="]" active={ui.rightPanelOpen} onClick={() => ui.setRightPanel(!ui.rightPanelOpen)}>
          <PanelRight size={16} />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-slate-200" />
        <IconButton label="Save" shortcut="Ctrl+S" onClick={() => void saveCurrent()} data-testid="save">
          <Save size={16} />
        </IconButton>
        <IconButton label="Export JSON" onClick={exportCurrent}>
          <Download size={16} />
        </IconButton>
        <IconButton label="Projects" shortcut="Ctrl+O" onClick={() => ui.setProjectsOpen(true)} data-testid="open-projects">
          <FolderOpen size={16} />
        </IconButton>
        <IconButton label="Help & shortcuts" shortcut="?" onClick={() => ui.setHelpOpen(true)}>
          <CircleHelp size={16} />
        </IconButton>
      </div>
    </header>
  );
}
