import type { ContainerFlavor, PastelColor, SlotKind, StructureKind, Value } from './types';
import { UNINITIALIZED } from './values';

export interface SlotTemplate {
  name: string;
  kind: SlotKind;
  value?: Value;
  key?: Value;
}

export interface StructureOptions {
  typeName?: string;
  length?: number;
  rows?: number;
  cols?: number;
  flavor?: ContainerFlavor;
  fields?: SlotTemplate[];
}

/**
 * Describes how a heap structure kind is laid out. New data structures
 * (trees, graphs, heaps, tries, …) are added by registering a definition —
 * the command layer and the canvas are generic over this registry.
 */
export interface StructureDefinition {
  kind: StructureKind;
  label: string;
  description: string;
  defaultColor: PastelColor;
  /** Whether users may add/remove/rename slots freely. */
  editableSlots: boolean;
  /** Slots are positional (array cells) — names are indices, not user labels. */
  indexedSlots: boolean;
  defaultTypeName(options: StructureOptions): string;
  initialSlots(options: StructureOptions): SlotTemplate[];
}

const uninit = (): Value => ({ ...UNINITIALIZED });

const registry = new Map<StructureKind, StructureDefinition>();

export function registerStructure(def: StructureDefinition): void {
  registry.set(def.kind, def);
}

export function getStructure(kind: StructureKind): StructureDefinition {
  const def = registry.get(kind);
  if (!def) throw new Error(`Unknown structure kind: ${kind}`);
  return def;
}

export function listStructures(): StructureDefinition[] {
  return [...registry.values()];
}

registerStructure({
  kind: 'node',
  label: 'Node',
  description: 'Singly linked list node with a value field and a next reference.',
  defaultColor: 'blue',
  editableSlots: true,
  indexedSlots: false,
  defaultTypeName: (o) => o.typeName ?? 'ListNode',
  initialSlots: () => [
    { name: 'val', kind: 'primitive', value: uninit() },
    { name: 'next', kind: 'reference', value: uninit() },
  ],
});

registerStructure({
  kind: 'object',
  label: 'Object',
  description: 'Generic object with user-defined primitive and reference fields.',
  defaultColor: 'violet',
  editableSlots: true,
  indexedSlots: false,
  defaultTypeName: (o) => o.typeName ?? 'Object',
  initialSlots: (o) => (o.fields ?? []).map((f) => ({ ...f, value: f.value ?? uninit() })),
});

registerStructure({
  kind: 'array',
  label: 'Array',
  description: 'Fixed-length array of manually editable indexed cells.',
  defaultColor: 'green',
  editableSlots: false,
  indexedSlots: true,
  defaultTypeName: (o) => o.typeName ?? 'int[]',
  initialSlots: (o) =>
    Array.from({ length: clampSize(o.length ?? 5, 1, 64) }, (_, i) => ({ name: String(i), kind: 'any' as const, value: uninit() })),
});

registerStructure({
  kind: 'matrix',
  label: 'Matrix',
  description: 'Two-dimensional grid of cells (e.g. DP tables, grids).',
  defaultColor: 'teal',
  editableSlots: false,
  indexedSlots: true,
  defaultTypeName: (o) => o.typeName ?? 'int[][]',
  initialSlots: (o) => {
    const rows = clampSize(o.rows ?? 3, 1, 24);
    const cols = clampSize(o.cols ?? 3, 1, 24);
    const out: SlotTemplate[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ name: `${r},${c}`, kind: 'any', value: uninit() });
    return out;
  },
});

registerStructure({
  kind: 'container',
  label: 'Container',
  description: 'Growable collection (list, stack, queue, deque, set, map). The app never enforces its discipline — you do.',
  defaultColor: 'amber',
  editableSlots: true,
  indexedSlots: false,
  defaultTypeName: (o) => {
    const names: Record<ContainerFlavor, string> = {
      list: 'List',
      stack: 'Stack',
      queue: 'Queue',
      deque: 'Deque',
      set: 'Set',
      map: 'Map',
    };
    return o.typeName ?? names[o.flavor ?? 'list'];
  },
  initialSlots: () => [],
});

export function clampSize(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
