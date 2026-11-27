import { MarkerType, type Edge } from '@xyflow/react';
import type { DocumentState } from '../../core/model/types';
import { EDGE_COLORS } from '../../components/palette';

export type RefEdgeKind = 'field' | 'variable' | 'null' | 'index' | 'nesting';
export type RefEdgeData = { kind: RefEdgeKind; label?: string };

function marker(color: string) {
  return { type: MarkerType.ArrowClosed, color, width: 16, height: 16 };
}

/**
 * Picks which side of the target object an arrow lands on, so that e.g. a
 * reversed `next` pointer arcs over the row instead of cutting through nodes.
 */
function targetHandle(doc: DocumentState, from: { x: number; y: number }, targetId: string): string {
  const t = doc.objects[targetId];
  if (!t) return 'in';
  const dx = t.position.x - from.x;
  const dy = t.position.y - from.y;
  if (dx > 40) return 'in';
  if (dy > 90) return 'in-top';
  if (dy < -90) return 'in-bottom';
  return 'in-top';
}

function slotAnchor(doc: DocumentState, objectId: string): { x: number; y: number } {
  const o = doc.objects[objectId];
  return o ? { x: o.position.x + 150, y: o.position.y } : { x: 0, y: 0 };
}

/**
 * Derives React Flow edges from semantic references. Edges are never a source
 * of truth: every edge corresponds to exactly one stored reference value.
 */
export function buildEdges(doc: DocumentState, selectedEdgeIds: Set<string>): Edge[] {
  const edges: Edge[] = [];
  const style = (kind: RefEdgeKind, id: string) => {
    const selected = selectedEdgeIds.has(id);
    const color = selected ? EDGE_COLORS.selected : EDGE_COLORS[kind];
    return {
      selected,
      style: {
        stroke: color,
        strokeWidth: selected ? 3 : kind === 'variable' ? 2 : 1.75,
        ...(kind === 'null' ? { strokeDasharray: '4 3' } : {}),
        ...(kind === 'index' ? { strokeDasharray: '2 3' } : {}),
        ...(kind === 'nesting' ? { strokeDasharray: '3 4' } : {}),
      },
      markerEnd: kind === 'nesting' ? undefined : marker(color),
    };
  };

  for (const v of Object.values(doc.variables)) {
    if (v.value.kind === 'ref' && doc.objects[v.value.targetId]) {
      const id = `e:v:${v.id}`;
      edges.push({
        id,
        source: v.id,
        sourceHandle: 'out',
        target: v.value.targetId,
        targetHandle: targetHandle(doc, { x: v.position.x + 120, y: v.position.y }, v.value.targetId),
        type: 'reference',
        data: { kind: 'variable' },
        ...style('variable', id),
      });
    } else if (v.value.kind === 'null' && doc.nullLinks[`v:${v.id}`] && doc.annotations[doc.nullLinks[`v:${v.id}`]]) {
      const id = `e:n:v:${v.id}`;
      edges.push({ id, source: v.id, sourceHandle: 'out', target: doc.nullLinks[`v:${v.id}`], targetHandle: 'in', type: 'reference', data: { kind: 'null' }, ...style('null', id) });
    }
    if (v.indexInto && doc.objects[v.indexInto] && v.value.kind === 'number' && Number.isInteger(v.value.value)) {
      const arr = doc.objects[v.indexInto];
      if (v.value.value >= 0 && v.value.value < arr.slots.length) {
        const id = `e:i:${v.id}`;
        edges.push({ id, source: v.id, sourceHandle: 'out', target: arr.id, targetHandle: `cell:${v.value.value}`, type: 'reference', data: { kind: 'index' }, ...style('index', id) });
      }
    }
  }

  for (const o of Object.values(doc.objects)) {
    if (o.kind === 'matrix') continue;
    for (const s of o.slots) {
      const key = `s:${o.id}:${s.id}`;
      if (s.value.kind === 'ref' && doc.objects[s.value.targetId]) {
        const id = `e:s:${o.id}:${s.id}`;
        edges.push({
          id,
          source: o.id,
          sourceHandle: `slot:${s.id}`,
          target: s.value.targetId,
          targetHandle: o.kind === 'array' ? 'in-top' : targetHandle(doc, slotAnchor(doc, o.id), s.value.targetId),
          type: 'reference',
          data: { kind: 'field' },
          ...style('field', id),
        });
      } else if (s.value.kind === 'null' && doc.nullLinks[key] && doc.annotations[doc.nullLinks[key]]) {
        const id = `e:n:${key}`;
        edges.push({ id, source: o.id, sourceHandle: `slot:${s.id}`, target: doc.nullLinks[key], targetHandle: 'in', type: 'reference', data: { kind: 'null' }, ...style('null', id) });
      }
    }
  }

  for (const c of Object.values(doc.contexts)) {
    if (c.parentId && doc.contexts[c.parentId]) {
      const id = `e:c:${c.id}`;
      edges.push({ id, source: c.parentId, sourceHandle: 'nest', target: c.id, targetHandle: 'in', type: 'reference', selectable: false, data: { kind: 'nesting' }, ...style('nesting', id) });
    }
  }
  return edges;
}
