import { create } from 'zustand';
import { CommandError, type Command } from '../core/commands/types';
import {
  addCheckpoint,
  BranchRequiredError,
  commit,
  goTo,
  redo,
  removeCheckpoint,
  switchToBranch,
  undo,
  type HistoryState,
} from '../core/history/history';
import type { DocumentState } from '../core/model/types';
import { newProjectData, type ProjectData, type ProjectMeta, type ProjectMode } from '../core/serialization/project';
import { useUiStore } from './uiStore';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

interface PendingBranch {
  command: Command;
  futureCount: number;
}

interface ProjectStore {
  meta: ProjectMeta;
  doc: DocumentState;
  history: HistoryState;
  /** Increments whenever doc/history/meta change; drives autosave. */
  revision: number;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  pendingBranch: PendingBranch | null;

  dispatch(command: Command): boolean;
  confirmBranch(): void;
  cancelBranch(): void;
  undo(): void;
  redo(): void;
  goTo(cursor: number): void;
  switchBranch(branchId: string): void;
  addCheckpoint(name: string): void;
  removeCheckpoint(id: string): void;
  load(data: ProjectData): void;
  newProject(mode?: ProjectMode, challengeId?: string, name?: string): void;
  rename(name: string): void;
  setSaveStatus(status: SaveStatus, at?: number): void;
  snapshot(): ProjectData;
}

export function newId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

const initial = newProjectData(newId('p'), 'Untitled project');

export const useProjectStore = create<ProjectStore>((set, get) => {
  const touch = (patch: Partial<ProjectStore>) => {
    const meta = { ...get().meta, updatedAt: Date.now() };
    set({ ...patch, meta, revision: get().revision + 1, saveStatus: 'unsaved' });
  };

  const run = (command: Command, allowBranch: boolean): boolean => {
    const { doc, history } = get();
    try {
      const r = commit(doc, history, command, { allowBranch });
      touch({ doc: r.doc, history: r.history });
      return true;
    } catch (e) {
      if (e instanceof BranchRequiredError) {
        set({ pendingBranch: { command, futureCount: e.futureCount } });
        return false;
      }
      if (e instanceof CommandError) {
        useUiStore.getState().toast(e.message, 'error');
        return false;
      }
      throw e;
    }
  };

  return {
    meta: initial.meta,
    doc: initial.doc,
    history: initial.history,
    revision: 0,
    // A blank startup project is not persisted until the user changes something.
    saveStatus: 'saved',
    lastSavedAt: null,
    pendingBranch: null,

    dispatch: (command) => run(command, false),
    confirmBranch: () => {
      const p = get().pendingBranch;
      if (!p) return;
      set({ pendingBranch: null });
      if (run(p.command, true)) useUiStore.getState().toast(`The previous future (${p.futureCount} operations) was kept as a branch in the timeline.`, 'info');
    },
    cancelBranch: () => set({ pendingBranch: null }),
    undo: () => {
      const r = undo(get().doc, get().history);
      touch({ doc: r.doc, history: r.history });
    },
    redo: () => {
      const r = redo(get().doc, get().history);
      touch({ doc: r.doc, history: r.history });
    },
    goTo: (cursor) => {
      const r = goTo(get().doc, get().history, cursor);
      touch({ doc: r.doc, history: r.history });
    },
    switchBranch: (branchId) => {
      try {
        const r = switchToBranch(get().doc, get().history, branchId);
        touch({ doc: r.doc, history: r.history });
      } catch (e) {
        useUiStore.getState().toast((e as Error).message, 'error');
      }
    },
    addCheckpoint: (name) => touch({ history: addCheckpoint(get().history, name) }),
    removeCheckpoint: (id) => touch({ history: removeCheckpoint(get().history, id) }),
    load: (data) => {
      set({ meta: data.meta, doc: data.doc, history: data.history, revision: get().revision + 1, saveStatus: 'saved', pendingBranch: null });
      useUiStore.getState().resetForProject();
    },
    newProject: (mode = 'sandbox', challengeId, name) => {
      const data = newProjectData(newId('p'), name ?? (mode === 'challenge' ? 'Challenge: Reverse Linked List' : 'Untitled project'), mode, challengeId);
      set({ meta: data.meta, doc: data.doc, history: data.history, revision: get().revision + 1, saveStatus: 'unsaved', pendingBranch: null });
      useUiStore.getState().resetForProject();
    },
    rename: (name) => {
      const n = name.trim();
      if (!n) return;
      set({ meta: { ...get().meta, name: n, updatedAt: Date.now() }, revision: get().revision + 1, saveStatus: 'unsaved' });
    },
    setSaveStatus: (status, at) => set({ saveStatus: status, ...(at ? { lastSavedAt: at } : {}) }),
    snapshot: () => ({ meta: get().meta, doc: get().doc, history: get().history }),
  };
});

export const dispatch = (c: Command) => useProjectStore.getState().dispatch(c);
