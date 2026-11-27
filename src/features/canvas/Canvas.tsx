import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import type { Id, Point, RefSource } from '../../core/model/types';
import { describeRefSource } from '../../core/model/queries';
import { dispatch, useProjectStore } from '../../stores/projectStore';
import { useUiStore, type ToolId } from '../../stores/uiStore';
import { HeapObjectNode } from '../objects/HeapObjectNode';
import { VariableNode } from '../variables/VariableNode';
import { FrameNode } from '../methods/FrameNode';
import { ContextNode } from '../execution/ContextNode';
import { DrawingNode, GroupNode, NullMarkerNode, TextNode } from './AnnotationNodes';
import { ReferenceEdge } from '../references/ReferenceEdge';
import { buildEdges } from '../references/buildEdges';
import { buildNodes, layoutGroups } from './buildNodes';
import { createWithTool } from './actions';
import { PencilOverlay } from './PencilOverlay';
import { cx } from '../../components/ui';

const nodeTypes = {
  heapObject: HeapObjectNode,
  variable: VariableNode,
  frame: FrameNode,
  context: ContextNode,
  text: TextNode,
  drawing: DrawingNode,
  group: GroupNode,
  nullMarker: NullMarkerNode,
};
const edgeTypes = { reference: ReferenceEdge };

const GRID = 16;
const CREATE_TOOLS: ToolId[] = ['object', 'node', 'variable', 'null', 'array', 'matrix', 'container', 'loop', 'condition', 'method', 'frame', 'text'];

export function snap(p: Point, enabled: boolean): Point {
  return enabled ? { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID } : { x: Math.round(p.x), y: Math.round(p.y) };
}

export function handleToSource(nodeId: Id, handleId: string | null | undefined, nodeType: string | undefined): RefSource | null {
  if (nodeType === 'variable' && handleId === 'out') return { kind: 'variable', variableId: nodeId };
  if (handleId?.startsWith('slot:')) return { kind: 'slot', objectId: nodeId, slotId: handleId.slice(5) };
  return null;
}

/** Applies "source now refers to / takes its value from target node" as an explicit command. */
export function connectSourceToNode(source: RefSource, targetId: Id): void {
  const doc = useProjectStore.getState().doc;
  const ui = useUiStore.getState();
  if (doc.objects[targetId]) {
    dispatch({ type: 'setReference', source, target: { kind: 'object', objectId: targetId } });
  } else if (doc.annotations[targetId]?.kind === 'nullMarker') {
    dispatch({ type: 'setReference', source, target: { kind: 'null', markerId: targetId } });
  } else if (doc.variables[targetId]) {
    if (source.kind === 'variable' && source.variableId === targetId) return;
    dispatch({ type: 'assignValue', target: source, source: { kind: 'operand', operand: { kind: 'variable', variableId: targetId } } });
  } else {
    ui.toast(`Drop ${describeRefSource(doc, source)} on an object, a variable (to copy its value) or a null marker.`);
  }
}

function eventPoint(e: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('changedTouches' in e && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  const m = e as MouseEvent;
  return { x: m.clientX, y: m.clientY };
}

export function Canvas() {
  const doc = useProjectStore((s) => s.doc);
  const projectId = useProjectStore((s) => s.meta.id);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const selectedEdgeIds = useUiStore((s) => s.selectedEdgeIds);
  const tool = useUiStore((s) => s.tool);
  const showGrid = useUiStore((s) => s.showGrid);
  const snapEnabled = useUiStore((s) => s.snapToGrid);
  const editingTextId = useUiStore((s) => s.editingTextId);
  const pendingRef = useUiStore((s) => s.pendingRefSource);
  const rf = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>([]);
  const nodesRef = useRef<Node[]>(nodes);
  nodesRef.current = nodes;
  const groupDrag = useRef<Map<Id, Point>>(new Map());

  useEffect(() => {
    const sel = new Set(selectedIds);
    setNodes((prev) => buildNodes(doc, sel, new Map(prev.map((n) => [n.id, n])), editingTextId));
  }, [doc, selectedIds, editingTextId]);

  const edges: Edge[] = useMemo(() => buildEdges(doc, new Set(selectedEdgeIds)), [doc, selectedEdgeIds]);

  useEffect(() => {
    const scheduledAt = useProjectStore.getState().revision;
    const t = setTimeout(() => {
      // Never move the viewport under a user who has already started working.
      if (useProjectStore.getState().revision !== scheduledAt) return;
      if (Object.keys(useProjectStore.getState().doc.objects).length || Object.keys(useProjectStore.getState().doc.variables).length) {
        rf.fitView({ padding: 0.2, maxZoom: 1.2, duration: 0 });
      } else rf.setViewport({ x: 0, y: 0, zoom: 1 });
    }, 50);
    return () => clearTimeout(t);
  }, [projectId, rf]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const ui = useUiStore.getState();
    const selectChanges = changes.filter((c) => c.type === 'select');
    if (selectChanges.length) {
      const next = new Set(ui.selectedIds);
      for (const c of selectChanges) {
        if (c.type !== 'select') continue;
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      ui.setSelection([...next], next.size ? [] : ui.selectedEdgeIds);
    }
    const local = changes.filter((c) => c.type === 'position' || c.type === 'dimensions');
    if (!local.length) return;
    setNodes((prev) => {
      let next = applyNodeChanges(local, prev);
      // Dragging a group frame drags its members.
      for (const c of local) {
        if (c.type !== 'position' || !c.position) continue;
        const before = prev.find((n) => n.id === c.id);
        if (before?.type !== 'group') continue;
        const g = useProjectStore.getState().doc.annotations[c.id];
        if (!g || g.kind !== 'group') continue;
        const dx = c.position.x - before.position.x;
        const dy = c.position.y - before.position.y;
        const members = new Set(g.memberIds);
        next = next.map((n) => (members.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n));
        for (const m of members) groupDrag.current.set(m, { x: 0, y: 0 });
      }
      const docNow = useProjectStore.getState().doc;
      return local.some((c) => c.type === 'dimensions') || local.some((c) => c.type === 'position' && !c.dragging) ? layoutGroups(next, docNow) : next;
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const ui = useUiStore.getState();
    const sel = changes.filter((c) => c.type === 'select');
    if (!sel.length) return;
    const next = new Set(ui.selectedEdgeIds);
    for (const c of sel) {
      if (c.type !== 'select') continue;
      if (c.selected) next.add(c.id);
      else next.delete(c.id);
    }
    ui.setSelection(next.size ? [] : ui.selectedIds, [...next]);
  }, []);

  const onNodeDragStop = useCallback(
    (_e: MouseEvent | TouchEvent, _node: Node, dragged: Node[]) => {
      const doc = useProjectStore.getState().doc;
      const ids = new Set(dragged.map((n) => n.id));
      for (const id of groupDrag.current.keys()) ids.add(id);
      groupDrag.current.clear();
      const moves: { id: Id; to: Point }[] = [];
      for (const n of nodesRef.current) {
        if (!ids.has(n.id) || n.type === 'group') continue;
        const el = doc.objects[n.id] ?? doc.variables[n.id] ?? doc.frames[n.id] ?? doc.contexts[n.id] ?? doc.annotations[n.id];
        if (!el) continue;
        const to = snap(n.position, snapEnabled);
        if (el.position.x !== to.x || el.position.y !== to.y) moves.push({ id: n.id, to });
      }
      if (moves.length) {
        if (!dispatch({ type: 'moveElements', moves })) {
          // Cancelled (e.g. viewing a past state): snap nodes back to the document.
          setNodes((prev) => buildNodes(useProjectStore.getState().doc, new Set(useUiStore.getState().selectedIds), new Map(prev.map((p) => [p.id, p])), null));
        }
      }
    },
    [snapEnabled],
  );

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    const fromNode = state.fromNode;
    const fromHandle = state.fromHandle;
    if (!fromNode || !fromHandle) return;
    const source = handleToSource(fromNode.id, fromHandle.id, fromNode.type);
    if (!source) return;
    const p = eventPoint(event);
    const under = document.elementFromPoint(p.x, p.y)?.closest('.react-flow__node')?.getAttribute('data-id');
    const targetId = under ?? state.toNode?.id;
    if (!targetId) return;
    if (targetId === fromNode.id && fromNode.type === 'variable') return;
    connectSourceToNode(source, targetId);
  }, []);

  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      const ui = useUiStore.getState();
      ui.openContextMenu(null);
      if (ui.tool === 'reference' && ui.pendingRefSource) {
        ui.setPendingRefSource(null);
        return;
      }
      if (!CREATE_TOOLS.includes(ui.tool)) return;
      const at = snap(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), ui.snapToGrid);
      createWithTool(ui.tool, at);
    },
    [rf],
  );

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    const ui = useUiStore.getState();
    ui.openContextMenu(null);
    if (ui.tool === 'reference' && ui.pendingRefSource) {
      connectSourceToNode(ui.pendingRefSource, node.id);
      ui.setPendingRefSource(null);
      return;
    }
    if (ui.tool === 'eraser') eraseIfAnnotation(node.id);
    if (node.type === 'context') ui.focusContext(node.id);
  }, []);

  const onNodeMouseEnter = useCallback((e: React.MouseEvent, node: Node) => {
    if (useUiStore.getState().tool === 'eraser' && e.buttons === 1) eraseIfAnnotation(node.id);
  }, []);

  const onNodeDoubleClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (node.type === 'text') useUiStore.getState().setEditingText(node.id);
    if (node.type !== 'text' && node.type !== 'drawing') useUiStore.getState().setRightPanel(true, 'inspect');
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    const ui = useUiStore.getState();
    if (!ui.selectedIds.includes(node.id)) ui.setSelection([node.id]);
    ui.openContextMenu({ x: e.clientX, y: e.clientY, target: { kind: 'node', id: node.id } });
  }, []);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault();
    const ui = useUiStore.getState();
    ui.setSelection([], [edge.id]);
    ui.openContextMenu({ x: e.clientX, y: e.clientY, target: { kind: 'edge', id: edge.id } });
  }, []);

  const onPaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault();
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      useUiStore.getState().openContextMenu({ x: e.clientX, y: e.clientY, target: { kind: 'pane', flowX: p.x, flowY: p.y } });
    },
    [rf],
  );

  const isHand = tool === 'hand';
  const isDrawingTool = tool === 'pencil' || tool === 'eraser';
  return (
    <div
      className={cx(
        'relative h-full w-full',
        tool === 'pencil' && 'dc-tool-pencil',
        tool === 'eraser' && 'dc-tool-eraser',
        tool === 'reference' && 'dc-tool-reference',
        CREATE_TOOLS.includes(tool) && 'dc-tool-create',
      )}
      data-testid="canvas"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnectEnd={onConnectEnd}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onMoveStart={() => useUiStore.getState().openContextMenu(null)}
        connectOnClick={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        panOnDrag={isHand ? true : [1, 2]}
        selectionOnDrag={tool === 'select'}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomActivationKeyCode={['Meta', 'Control']}
        nodesDraggable={!isHand && !isDrawingTool}
        nodesConnectable={!isHand && !isDrawingTool}
        elementsSelectable={!isHand && tool !== 'eraser'}
        snapToGrid={snapEnabled}
        snapGrid={[GRID, GRID]}
        minZoom={0.1}
        maxZoom={3}
        connectionRadius={28}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: false }}
      >
        {showGrid && <Background variant={BackgroundVariant.Dots} gap={GRID} size={1.2} color="#d4d8de" />}
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap position="top-right" pannable zoomable nodeColor="#e2e8f0" maskColor="rgba(248,250,252,0.7)" style={{ width: 150, height: 96 }} />
      </ReactFlow>
      {tool === 'pencil' && <PencilOverlay />}
      {tool === 'reference' && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-violet-200 bg-white px-3 py-1 text-[12px] text-violet-800" data-testid="reference-hint">
          {pendingRef
            ? `Now click the target for ${describeRefSource(doc, pendingRef)} — an object, a variable (copy) or a null marker. Esc cancels.`
            : 'Reference tool: click a variable or a reference field to choose the source.'}
        </div>
      )}
    </div>
  );
}

function eraseIfAnnotation(id: Id) {
  const a = useProjectStore.getState().doc.annotations[id];
  if (a && (a.kind === 'drawing' || a.kind === 'text')) dispatch({ type: 'deleteElements', ids: [id] });
}
