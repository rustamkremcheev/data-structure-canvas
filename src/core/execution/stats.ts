import type { OperationKind } from '../commands/types';
import type { OperationRecord } from '../history/history';

export interface OperationStats {
  allocations: number;
  declarations: number;
  initializations: number;
  assignments: number;
  referenceChanges: number;
  comparisons: number;
  conditionChecks: number;
  iterations: number;
  methodCalls: number;
  returns: number;
  /** Sum of the algorithm operations above. */
  algorithmTotal: number;
  /** Context/phase transitions, definitions, edits, deletions: recorded but not algorithm work. */
  executionControl: number;
  /** Moves, recoloring, annotations. Never algorithm operations. */
  uiActions: number;
  byKind: Partial<Record<OperationKind, number>>;
}

const ALGORITHM_KEYS: [OperationKind, keyof OperationStats][] = [
  ['allocation', 'allocations'],
  ['declaration', 'declarations'],
  ['initialization', 'initializations'],
  ['assignment', 'assignments'],
  ['reference-change', 'referenceChanges'],
  ['comparison', 'comparisons'],
  ['condition-check', 'conditionChecks'],
  ['iteration', 'iterations'],
  ['method-call', 'methodCalls'],
  ['return', 'returns'],
];

/** Counts explicitly recorded operations. This is a tally, not a complexity analysis. */
export function computeStats(entries: OperationRecord[]): OperationStats {
  const byKind: Partial<Record<OperationKind, number>> = {};
  for (const e of entries) for (const op of e.ops) byKind[op] = (byKind[op] ?? 0) + 1;
  const stats: OperationStats = {
    allocations: 0,
    declarations: 0,
    initializations: 0,
    assignments: 0,
    referenceChanges: 0,
    comparisons: 0,
    conditionChecks: 0,
    iterations: 0,
    methodCalls: 0,
    returns: 0,
    algorithmTotal: 0,
    executionControl: 0,
    uiActions: (byKind.visual ?? 0) + (byKind.annotation ?? 0),
    byKind,
  };
  const algorithmKinds = new Set<OperationKind>();
  for (const [kind, key] of ALGORITHM_KEYS) {
    const n = byKind[kind] ?? 0;
    (stats[key] as number) = n;
    stats.algorithmTotal += n;
    algorithmKinds.add(kind);
  }
  for (const [kind, n] of Object.entries(byKind) as [OperationKind, number][]) {
    if (!algorithmKinds.has(kind) && kind !== 'visual' && kind !== 'annotation') stats.executionControl += n;
  }
  return stats;
}
