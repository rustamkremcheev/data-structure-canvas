import type { Node } from '@xyflow/react';
import type { DocumentState } from '../../core/model/types';

const DEFAULT_SIZE = { width: 160, height: 70 };

/**
 * Derives React Flow nodes from the semantic document. Positions come from the
 * document; measured sizes are carried over from the previous render so React
 * Flow does not need to re-measure.
 */
export function buildNodes(doc: DocumentState, selected: Set<string>, prev: Map<string, Node>, editingTextId: string | null): Node[] {
  const nodes: Node[] = [];
  const add = (id: string, type: string, position: { x: number; y: number }, data: Record<string, unknown>, extra: Partial<Node> = {}) => {
    const p = prev.get(id);
    nodes.push({
      id,
      type,
      position: { ...position },
      data,
      selected: selected.has(id),
      ...(p?.measured ? { measured: p.measured } : {}),
      ...extra,
    });
  };

  for (const c of Object.values(doc.contexts)) add(c.id, 'context', c.position, { contextId: c.id }, { zIndex: 1 });
  for (const f of Object.values(doc.frames)) add(f.id, 'frame', f.position, { frameId: f.id }, { zIndex: 1 });
  for (const a of Object.values(doc.annotations)) {
    if (a.kind === 'text') add(a.id, 'text', a.position, { annotationId: a.id }, { zIndex: 3, draggable: editingTextId !== a.id });
    else if (a.kind === 'drawing') add(a.id, 'drawing', a.position, { annotationId: a.id }, { zIndex: 3 });
    else if (a.kind === 'nullMarker') add(a.id, 'nullMarker', a.position, { annotationId: a.id }, { zIndex: 2 });
  }
  for (const o of Object.values(doc.objects)) add(o.id, 'heapObject', o.position, { objectId: o.id }, { zIndex: 2 });
  for (const v of Object.values(doc.variables)) add(v.id, 'variable', v.position, { variableId: v.id }, { zIndex: 4 });

  const groups = Object.values(doc.annotations).filter((a) => a.kind === 'group');
  for (const g of groups) {
    add(g.id, 'group', { x: 0, y: 0 }, { annotationId: g.id, width: 0, height: 0 }, { zIndex: 0 });
  }
  return layoutGroups(nodes, doc);
}

const PAD = 18;

/** Group frames are derived from their members' bounds. */
export function layoutGroups(nodes: Node[], doc: DocumentState): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return nodes.map((n) => {
    if (n.type !== 'group') return n;
    const g = doc.annotations[n.id];
    if (!g || g.kind !== 'group') return n;
    const members = g.memberIds.map((id) => byId.get(id)).filter((m): m is Node => Boolean(m));
    if (!members.length) return { ...n, hidden: true };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const m of members) {
      const w = m.measured?.width ?? DEFAULT_SIZE.width;
      const h = m.measured?.height ?? DEFAULT_SIZE.height;
      minX = Math.min(minX, m.position.x);
      minY = Math.min(minY, m.position.y);
      maxX = Math.max(maxX, m.position.x + w);
      maxY = Math.max(maxY, m.position.y + h);
    }
    const width = maxX - minX + PAD * 2;
    const height = maxY - minY + PAD * 2;
    return {
      ...n,
      hidden: false,
      position: { x: minX - PAD, y: minY - PAD },
      data: { ...n.data, width, height },
      style: { width, height },
    };
  });
}
