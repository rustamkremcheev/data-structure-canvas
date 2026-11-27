import { memo } from 'react';
import { BaseEdge, getBezierPath, useInternalNode, type EdgeProps } from '@xyflow/react';

/** Bezier reference arrow with a dedicated loop shape for self-references. */
function ReferenceEdgeImpl(props: EdgeProps) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, interactionWidth } = props;
  const node = useInternalNode(source);

  if (source === target && node) {
    const w = node.measured.width ?? 150;
    const top = node.internals.positionAbsolute.y;
    const loopTop = top - 28;
    const leftX = node.internals.positionAbsolute.x - 8;
    const path = `M ${sourceX} ${sourceY} C ${sourceX + 40} ${sourceY}, ${sourceX + 40} ${loopTop}, ${sourceX - w / 2} ${loopTop} S ${leftX - 30} ${targetY}, ${targetX} ${targetY}`;
    return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth ?? 16} />;
  }

  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 });
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth ?? 16} />;
}

export const ReferenceEdge = memo(ReferenceEdgeImpl);
