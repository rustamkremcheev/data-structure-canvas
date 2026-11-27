import type { LoopPhase, LoopType } from '../model/types';

/** Conventional phase arrangement per loop type. The user may still enter any phase at any time. */
export const LOOP_PHASES: Record<LoopType, LoopPhase[]> = {
  while: ['init', 'condition', 'body', 'exit'],
  for: ['init', 'condition', 'body', 'update', 'exit'],
  'do-while': ['init', 'body', 'condition', 'exit'],
  custom: ['init', 'condition', 'body', 'update', 'exit'],
};

export const PHASE_LABELS: Record<LoopPhase, string> = {
  init: 'Initialization',
  condition: 'Condition',
  body: 'Body',
  update: 'Update',
  exit: 'Exit',
};

export const PHASE_SHORT: Record<LoopPhase, string> = {
  init: 'Init',
  condition: 'Cond',
  body: 'Body',
  update: 'Update',
  exit: 'Exit',
};

export const LOOP_TYPE_LABELS: Record<LoopType, string> = {
  while: 'while',
  for: 'for',
  'do-while': 'do … while',
  custom: 'custom',
};

/**
 * The phase that conventionally follows `phase`, used only to *highlight* a
 * suggestion on the selector. It is never applied automatically.
 */
export function conventionalNextPhase(
  phases: LoopPhase[],
  phase: LoopPhase | null,
  lastConditionResult: boolean | null,
): LoopPhase | null {
  if (phase === null) return phases[0] ?? null;
  if (phase === 'exit') return null;
  if (phase === 'condition') {
    if (lastConditionResult === false) return 'exit';
    if (lastConditionResult === null) return null;
  }
  const cycle = phases.filter((p) => p !== 'init' && p !== 'exit');
  if (phase === 'init') return cycle[0] ?? null;
  const idx = cycle.indexOf(phase);
  if (idx === -1) return null;
  return cycle[(idx + 1) % cycle.length] ?? null;
}
