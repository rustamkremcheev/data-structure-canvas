import { create } from 'zustand';
import type { ClipboardPayload } from '../core/commands/types';
import type { Id, RefSource } from '../core/model/types';

export type ToolId =
  | 'select'
  | 'hand'
  | 'object'
  | 'node'
  | 'variable'
  | 'reference'
  | 'null'
  | 'array'
  | 'matrix'
  | 'container'
  | 'loop'
  | 'condition'
  | 'method'
  | 'frame'
  | 'text'
  | 'pencil'
  | 'eraser';

export type RightTab = 'inspect' | 'execution' | 'stats' | 'diagnostics' | 'challenge';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
}

export type ContextMenuTarget =
  | { kind: 'node'; id: Id }
  | { kind: 'edge'; id: Id }
  | { kind: 'slot'; objectId: Id; slotId: Id }
  | { kind: 'pane'; flowX: number; flowY: number }
  | { kind: 'selection' };

export interface ContextMenuState {
  x: number;
  y: number;
  target: ContextMenuTarget;
}

interface UiStore {
  tool: ToolId;
  selectedIds: Id[];
  selectedEdgeIds: Id[];
  rightPanelOpen: boolean;
  rightTab: RightTab;
  timelineOpen: boolean;
  controllerOpen: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  /** Source picked with the Reference tool, waiting for a target click. */
  pendingRefSource: RefSource | null;
  /** Context shown in the execution controller (defaults to the active one). */
  focusedContextId: Id | null;
  clipboard: ClipboardPayload | null;
  toasts: Toast[];
  contextMenu: ContextMenuState | null;
  editingTextId: Id | null;
  projectsOpen: boolean;
  helpOpen: boolean;

  setTool(tool: ToolId): void;
  setSelection(ids: Id[], edgeIds?: Id[]): void;
  setRightPanel(open: boolean, tab?: RightTab): void;
  toggleTimeline(): void;
  toggleController(): void;
  toggleGrid(): void;
  toggleSnap(): void;
  setPendingRefSource(s: RefSource | null): void;
  focusContext(id: Id | null): void;
  setClipboard(c: ClipboardPayload | null): void;
  toast(message: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
  openContextMenu(m: ContextMenuState | null): void;
  setEditingText(id: Id | null): void;
  setProjectsOpen(open: boolean): void;
  setHelpOpen(open: boolean): void;
  resetForProject(): void;
}

let toastSeq = 0;

export const useUiStore = create<UiStore>((set, get) => ({
  tool: 'select',
  selectedIds: [],
  selectedEdgeIds: [],
  rightPanelOpen: true,
  rightTab: 'inspect',
  timelineOpen: true,
  controllerOpen: true,
  showGrid: true,
  snapToGrid: true,
  pendingRefSource: null,
  focusedContextId: null,
  clipboard: null,
  toasts: [],
  contextMenu: null,
  editingTextId: null,
  projectsOpen: false,
  helpOpen: false,

  setTool: (tool) => set({ tool, pendingRefSource: null }),
  setSelection: (ids, edgeIds = []) => {
    const s = get();
    if (sameIds(s.selectedIds, ids) && sameIds(s.selectedEdgeIds, edgeIds)) return;
    set({ selectedIds: ids, selectedEdgeIds: edgeIds });
  },
  setRightPanel: (open, tab) => set({ rightPanelOpen: open, ...(tab ? { rightTab: tab } : {}) }),
  toggleTimeline: () => set({ timelineOpen: !get().timelineOpen }),
  toggleController: () => set({ controllerOpen: !get().controllerOpen }),
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  toggleSnap: () => set({ snapToGrid: !get().snapToGrid }),
  setPendingRefSource: (pendingRefSource) => set({ pendingRefSource }),
  focusContext: (focusedContextId) => set({ focusedContextId }),
  setClipboard: (clipboard) => set({ clipboard }),
  toast: (message, kind = 'info') => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts.slice(-3), { id, message, kind }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  setEditingText: (editingTextId) => set({ editingTextId }),
  setProjectsOpen: (projectsOpen) => set({ projectsOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  resetForProject: () =>
    set({ selectedIds: [], selectedEdgeIds: [], pendingRefSource: null, focusedContextId: null, contextMenu: null, editingTextId: null }),
}));

function sameIds(a: Id[], b: Id[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
