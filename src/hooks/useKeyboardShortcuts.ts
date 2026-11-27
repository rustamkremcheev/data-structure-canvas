import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useProjectStore } from '../stores/projectStore';
import { useUiStore } from '../stores/uiStore';
import { useDialogStore } from '../stores/dialogStore';
import { TOOL_BY_SHORTCUT } from '../features/toolbar/tools';
import { copySelection, deleteSelection, duplicateSelection, groupSelection, openCheckpointDialog, pasteClipboard } from '../features/canvas/actions';
import { saveCurrent } from '../features/projects/ProjectsDialog';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export function useKeyboardShortcuts(): void {
  const rf = useReactFlow();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dialogs = useDialogStore.getState();
      const ui = useUiStore.getState();
      if (dialogs.form || dialogs.confirm || ui.projectsOpen || useProjectStore.getState().pendingBranch) return;
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const project = useProjectStore.getState();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) project.redo();
        else project.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        project.redo();
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        void saveCurrent();
        return;
      }
      if (mod && key === 'o') {
        e.preventDefault();
        ui.setProjectsOpen(true);
        return;
      }
      if (mod && key === 'c') return copySelection();
      if (mod && key === 'v') return pasteClipboard();
      if (mod && key === 'd') {
        e.preventDefault();
        return duplicateSelection();
      }
      if (mod && key === 'g') {
        e.preventDefault();
        return groupSelection();
      }
      if (mod && key === 'a') {
        e.preventDefault();
        const d = project.doc;
        ui.setSelection([...Object.keys(d.objects), ...Object.keys(d.variables), ...Object.keys(d.contexts), ...Object.keys(d.frames), ...Object.keys(d.annotations)]);
        return;
      }
      if (mod) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (e.key === 'Escape') {
        if (ui.pendingRefSource) ui.setPendingRefSource(null);
        else if (ui.tool !== 'select') ui.setTool('select');
        else ui.setSelection([]);
        ui.openContextMenu(null);
        return;
      }
      if (e.key === '!' || (e.shiftKey && e.code === 'Digit1')) {
        rf.fitView({ padding: 0.2, duration: 200 });
        return;
      }
      if (e.key === '?') {
        ui.setHelpOpen(true);
        return;
      }
      if (e.key === ']') {
        ui.setRightPanel(!ui.rightPanelOpen);
        return;
      }
      if (key === 'g') {
        if (e.shiftKey) ui.toggleSnap();
        else ui.toggleGrid();
        return;
      }
      if (key === 'k') {
        openCheckpointDialog();
        return;
      }
      const tool = TOOL_BY_SHORTCUT.get(key);
      if (tool && !e.shiftKey && !e.altKey) ui.setTool(tool);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rf]);
}
