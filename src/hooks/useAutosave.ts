import { useEffect, useRef } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { lastProjectId, loadProject } from '../persistence/db';
import { saveCurrent } from '../features/projects/ProjectsDialog';
import { useUiStore } from '../stores/uiStore';

/** Restores the last opened project on startup. */
export function useRestoreLastProject(): boolean {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const id = lastProjectId();
    if (!id) return;
    loadProject(id)
      .then((data) => {
        // Only replace the blank startup project if the user has not started working in it.
        if (data && useProjectStore.getState().history.entries.length === 0) useProjectStore.getState().load(data);
      })
      .catch((e: Error) => useUiStore.getState().toast(`Could not restore last project: ${e.message}`, 'error'));
  }, []);
  return true;
}

/** Debounced autosave. Only persists the existing state; never modifies it. */
export function useAutosave(delayMs = 800): void {
  const revision = useProjectStore((s) => s.revision);
  const status = useProjectStore((s) => s.saveStatus);
  useEffect(() => {
    if (status !== 'unsaved') return;
    const t = setTimeout(() => void saveCurrent(), delayMs);
    return () => clearTimeout(t);
  }, [revision, status, delayMs]);
}
