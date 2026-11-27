import type { PastelColor } from '../core/model/types';

export interface PaletteEntry {
  header: string;
  border: string;
  text: string;
  swatch: string;
  stroke: string;
}

/** Soft pastel accents. Full class names so Tailwind can detect them statically. */
export const PALETTE: Record<PastelColor, PaletteEntry> = {
  slate: { header: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-700', swatch: 'bg-slate-200', stroke: '#64748b' },
  blue: { header: 'bg-sky-50', border: 'border-sky-300', text: 'text-sky-800', swatch: 'bg-sky-200', stroke: '#0284c7' },
  green: { header: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', swatch: 'bg-emerald-200', stroke: '#059669' },
  amber: { header: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800', swatch: 'bg-amber-200', stroke: '#d97706' },
  rose: { header: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-800', swatch: 'bg-rose-200', stroke: '#e11d48' },
  violet: { header: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-800', swatch: 'bg-violet-200', stroke: '#7c3aed' },
  teal: { header: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-800', swatch: 'bg-teal-200', stroke: '#0d9488' },
};

export const PASTEL_COLORS = Object.keys(PALETTE) as PastelColor[];

export const EDGE_COLORS = {
  field: '#475569',
  variable: '#0284c7',
  null: '#94a3b8',
  index: '#059669',
  selected: '#7c3aed',
  nesting: '#cbd5e1',
} as const;
