import { applyPatches, type Patch } from 'immer';
import { applyCommand } from '../commands/apply';
import { categoryOf, type Command, type CommandType, type OperationCategory, type OperationKind } from '../commands/types';
import type { DocumentState, Id } from '../model/types';

export interface OperationRecord {
  id: Id;
  type: CommandType;
  command: Command;
  timestamp: number;
  /** Innermost entered execution context when the operation was performed. */
  contextId: Id | null;
  contextName: string | null;
  /** 1-based iteration of the innermost entered loop (execution metadata), if any. */
  iteration: number | null;
  patches: Patch[];
  inversePatches: Patch[];
  description: string;
  ops: OperationKind[];
  category: OperationCategory;
}

export interface Checkpoint {
  id: Id;
  name: string;
  /** Id of the last applied operation at the checkpoint, or null for the initial state. */
  entryId: Id | null;
  createdAt: number;
  kind: 'manual' | 'iteration';
  contextId?: Id;
  iteration?: number;
}

/** A future that was set aside when the user acted from a past state. Never silently discarded. */
export interface HistoryBranch {
  id: Id;
  name: string;
  forkEntryId: Id | null;
  entries: OperationRecord[];
  createdAt: number;
}

export interface HistoryState {
  entries: OperationRecord[];
  /** Number of entries currently applied. `cursor < entries.length` means viewing a past state. */
  cursor: number;
  checkpoints: Checkpoint[];
  branches: HistoryBranch[];
  seq: number;
}

export function createHistory(): HistoryState {
  return { entries: [], cursor: 0, checkpoints: [], branches: [], seq: 0 };
}

export class BranchRequiredError extends Error {
  constructor(public readonly futureCount: number) {
    super(`Acting from a past state would set aside ${futureCount} future operation(s)`);
    this.name = 'BranchRequiredError';
  }
}

export interface CommitOptions {
  now?: number;
  /** Required when `cursor < entries.length`: the future is preserved as a branch. */
  allowBranch?: boolean;
}

export interface CommitResult {
  doc: DocumentState;
  history: HistoryState;
  record: OperationRecord;
}

function primaryCategory(ops: OperationKind[]): OperationCategory {
  const cats = ops.map(categoryOf);
  if (cats.includes('semantic')) return 'semantic';
  if (cats.includes('execution')) return 'execution';
  if (cats.includes('annotation')) return 'annotation';
  return 'visual';
}

function innermostLoopIteration(doc: DocumentState): number | null {
  for (let i = doc.activeContextPath.length - 1; i >= 0; i--) {
    const c = doc.contexts[doc.activeContextPath[i]];
    if (c?.kind === 'loop') return c.phase === null ? null : c.iterationsCompleted + 1;
  }
  return null;
}

export function commit(doc: DocumentState, history: HistoryState, command: Command, options: CommitOptions = {}): CommitResult {
  const now = options.now ?? Date.now();
  const future = history.entries.length - history.cursor;
  if (future > 0 && !options.allowBranch) throw new BranchRequiredError(future);

  const activeId = doc.activeContextPath[doc.activeContextPath.length - 1] ?? null;
  const iteration = innermostLoopIteration(doc);
  const applied = applyCommand(doc, command);

  let seq = history.seq + 1;
  const record: OperationRecord = {
    id: `op${seq}`,
    type: command.type,
    command,
    timestamp: now,
    contextId: activeId,
    contextName: activeId ? (doc.contexts[activeId]?.name ?? null) : null,
    iteration,
    patches: applied.patches,
    inversePatches: applied.inversePatches,
    description: applied.description,
    ops: applied.ops,
    category: primaryCategory(applied.ops),
  };

  let branches = history.branches;
  if (future > 0) {
    seq += 1;
    const forkEntry = history.entries[history.cursor - 1];
    branches = [
      ...branches,
      {
        id: `br${seq}`,
        name: `Branch ${branches.length + 1}`,
        forkEntryId: forkEntry?.id ?? null,
        entries: history.entries.slice(history.cursor),
        createdAt: now,
      },
    ];
  }

  let checkpoints = history.checkpoints;
  if (command.type === 'completeIteration') {
    const loop = applied.doc.contexts[command.contextId];
    if (loop?.kind === 'loop') {
      seq += 1;
      checkpoints = [
        ...checkpoints,
        {
          id: `cp${seq}`,
          name: `${loop.name} · iteration ${loop.iterationsCompleted}`,
          entryId: record.id,
          createdAt: now,
          kind: 'iteration',
          contextId: loop.id,
          iteration: loop.iterationsCompleted,
        },
      ];
    }
  }

  return {
    doc: applied.doc,
    record,
    history: {
      entries: [...history.entries.slice(0, history.cursor), record],
      cursor: history.cursor + 1,
      checkpoints,
      branches,
      seq,
    },
  };
}

export function canUndo(h: HistoryState): boolean {
  return h.cursor > 0;
}

export function canRedo(h: HistoryState): boolean {
  return h.cursor < h.entries.length;
}

export function undo(doc: DocumentState, h: HistoryState): { doc: DocumentState; history: HistoryState } {
  if (!canUndo(h)) return { doc, history: h };
  const entry = h.entries[h.cursor - 1];
  return { doc: applyPatches(doc, entry.inversePatches), history: { ...h, cursor: h.cursor - 1 } };
}

export function redo(doc: DocumentState, h: HistoryState): { doc: DocumentState; history: HistoryState } {
  if (!canRedo(h)) return { doc, history: h };
  const entry = h.entries[h.cursor];
  return { doc: applyPatches(doc, entry.patches), history: { ...h, cursor: h.cursor + 1 } };
}

/** Moves to the state after `target` operations by replaying patches. Never discards entries. */
export function goTo(doc: DocumentState, h: HistoryState, target: number): { doc: DocumentState; history: HistoryState } {
  const t = Math.max(0, Math.min(h.entries.length, target));
  let state = { doc, history: h };
  while (state.history.cursor > t) state = undo(state.doc, state.history);
  while (state.history.cursor < t) state = redo(state.doc, state.history);
  return state;
}

export function cursorOfEntry(h: HistoryState, entryId: Id | null): number {
  if (entryId === null) return 0;
  const idx = h.entries.findIndex((e) => e.id === entryId);
  return idx === -1 ? -1 : idx + 1;
}

export function addCheckpoint(h: HistoryState, name: string, now = Date.now()): HistoryState {
  const seq = h.seq + 1;
  const entryId = h.cursor > 0 ? h.entries[h.cursor - 1].id : null;
  return {
    ...h,
    seq,
    checkpoints: [...h.checkpoints, { id: `cp${seq}`, name: name.trim() || `Checkpoint ${h.checkpoints.length + 1}`, entryId, createdAt: now, kind: 'manual' }],
  };
}

export function removeCheckpoint(h: HistoryState, id: Id): HistoryState {
  return { ...h, checkpoints: h.checkpoints.filter((c) => c.id !== id) };
}

/**
 * Switches to a stored branch: moves to its fork point, stores the current
 * future as a new branch, and makes the stored branch the current future
 * (applied up to its end). Nothing is lost in either direction.
 */
export function switchToBranch(doc: DocumentState, h: HistoryState, branchId: Id, now = Date.now()): { doc: DocumentState; history: HistoryState } {
  const branch = h.branches.find((b) => b.id === branchId);
  if (!branch) return { doc, history: h };
  const fork = cursorOfEntry(h, branch.forkEntryId);
  if (fork === -1) throw new Error('Branch fork point is not on the current timeline');
  const atFork = goTo(doc, h, fork);
  let seq = atFork.history.seq;
  const others = atFork.history.branches.filter((b) => b.id !== branchId);
  const currentFuture = atFork.history.entries.slice(fork);
  if (currentFuture.length > 0) {
    seq += 1;
    others.push({ id: `br${seq}`, name: `Branch ${h.branches.length + 1}`, forkEntryId: branch.forkEntryId, entries: currentFuture, createdAt: now });
  }
  const switched: HistoryState = {
    ...atFork.history,
    seq,
    entries: [...atFork.history.entries.slice(0, fork), ...branch.entries],
    branches: others,
  };
  return goTo(atFork.doc, switched, switched.entries.length);
}

export function isAlgorithmOperation(r: OperationRecord): boolean {
  return r.category === 'semantic' || r.category === 'execution';
}
