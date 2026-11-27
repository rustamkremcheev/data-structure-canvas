import type { LoopContext, LoopPhase } from '../../core/model/types';
import { conventionalNextPhase, PHASE_LABELS, PHASE_SHORT } from '../../core/execution/loops';

const R_OUT = 62;
const R_IN = 30;
const C = 70;

function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

function sector(a0: number, a1: number) {
  const p0 = polar(R_OUT, a0);
  const p1 = polar(R_OUT, a1);
  const q1 = polar(R_IN, a1);
  const q0 = polar(R_IN, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p0.x},${p0.y} A${R_OUT},${R_OUT} 0 ${large} 1 ${p1.x},${p1.y} L${q1.x},${q1.y} A${R_IN},${R_IN} 0 ${large} 0 ${q0.x},${q0.y} Z`;
}

const FILL: Record<LoopPhase, string> = {
  init: '#e0f2fe',
  condition: '#fef3c7',
  body: '#dcfce7',
  update: '#ede9fe',
  exit: '#ffe4e6',
};

/**
 * Mechanical phase selector. Clicking a segment is the only way the phase
 * changes; the dashed outline merely suggests the conventional next phase.
 */
export function PhaseDial({ loop, enabled, onSelect }: { loop: LoopContext; enabled: boolean; onSelect(p: LoopPhase): void }) {
  const n = loop.phases.length;
  const step = 360 / n;
  const gap = n > 1 ? 2 : 0;
  const suggestion = enabled ? conventionalNextPhase(loop.phases, loop.phase, loop.lastConditionResult) : null;
  const idx = loop.phase ? loop.phases.indexOf(loop.phase) : -1;
  const needleAngle = idx >= 0 ? -90 + idx * step + step / 2 : -90;

  return (
    <svg width={140} height={140} viewBox="0 0 140 140" role="group" aria-label="Loop phase selector" data-testid="phase-dial" className="shrink-0 select-none">
      {loop.phases.map((p, i) => {
        const a0 = -90 + i * step + gap / 2;
        const a1 = -90 + (i + 1) * step - gap / 2;
        const mid = polar((R_IN + R_OUT) / 2, (a0 + a1) / 2);
        const current = loop.phase === p;
        const suggested = suggestion === p && !current;
        return (
          <g
            key={p}
            role="button"
            aria-label={`Enter ${PHASE_LABELS[p]} phase`}
            aria-pressed={current}
            data-testid={`phase-${p}`}
            tabIndex={enabled ? 0 : -1}
            onClick={() => enabled && onSelect(p)}
            onKeyDown={(e) => {
              if (enabled && (e.key === 'Enter' || e.key === ' ')) onSelect(p);
            }}
            className={enabled ? 'cursor-pointer outline-none' : 'cursor-not-allowed'}
            opacity={enabled ? 1 : 0.45}
          >
            <title>{`${PHASE_LABELS[p]}${suggested ? ' (conventional next — your choice)' : ''}`}</title>
            <path
              d={sector(a0, a1)}
              fill={current ? FILL[p] : '#fff'}
              stroke={current ? '#475569' : suggested ? '#7c3aed' : '#cbd5e1'}
              strokeWidth={current ? 1.6 : 1}
              strokeDasharray={suggested ? '3 2' : undefined}
              className="transition-[fill] hover:fill-slate-50"
            />
            <text x={mid.x} y={mid.y + 3} textAnchor="middle" fontSize={9.5} fontWeight={current ? 700 : 500} fill={current ? '#0f172a' : '#64748b'}>
              {PHASE_SHORT[p]}
            </text>
          </g>
        );
      })}
      <circle cx={C} cy={C} r={R_IN - 4} fill="#f8fafc" stroke="#e2e8f0" />
      <g style={{ transform: `rotate(${needleAngle + 90}deg)`, transformOrigin: `${C}px ${C}px`, transition: 'transform 180ms ease-out' }} opacity={loop.phase ? 1 : 0.25}>
        <line x1={C} y1={C} x2={C} y2={C - R_IN + 6} stroke="#334155" strokeWidth={2} strokeLinecap="round" />
      </g>
      <circle cx={C} cy={C} r={3} fill="#334155" />
      <text x={C} y={C + 15} textAnchor="middle" fontSize={8} fill="#94a3b8">
        iter
      </text>
      <text x={C} y={C - 7} textAnchor="middle" fontSize={11} fontWeight={700} fill="#334155" data-testid="dial-iteration">
        {loop.phase ? loop.iterationsCompleted + 1 : '–'}
      </text>
    </svg>
  );
}
