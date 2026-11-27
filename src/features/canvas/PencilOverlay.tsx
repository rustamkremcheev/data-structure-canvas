import { useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { Point } from '../../core/model/types';
import { dispatch } from '../../stores/projectStore';

/** Freehand annotation capture. Uses pointer events (mouse, touch and pen). */
export function PencilOverlay() {
  const rf = useReactFlow();
  const [screenPts, setScreenPts] = useState<Point[]>([]);
  const flowPts = useRef<Point[]>([]);
  const drawing = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const local = (e: React.PointerEvent): Point => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div
      ref={box}
      data-testid="pencil-overlay"
      className="absolute inset-0 z-10 cursor-crosshair touch-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drawing.current = true;
        flowPts.current = [rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })];
        setScreenPts([local(e)]);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const p = local(e);
        setScreenPts((prev) => {
          const last = prev[prev.length - 1];
          if (last && Math.hypot(last.x - p.x, last.y - p.y) < 2) return prev;
          flowPts.current.push(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
          return [...prev, p];
        });
      }}
      onPointerUp={() => {
        if (!drawing.current) return;
        drawing.current = false;
        const pts = flowPts.current;
        setScreenPts([]);
        if (pts.length < 2) return;
        const minX = Math.min(...pts.map((p) => p.x));
        const minY = Math.min(...pts.map((p) => p.y));
        const maxX = Math.max(...pts.map((p) => p.x));
        const maxY = Math.max(...pts.map((p) => p.y));
        dispatch({
          type: 'createAnnotation',
          annotation: {
            kind: 'drawing',
            position: { x: minX, y: minY },
            points: pts.map((p) => ({ x: +(p.x - minX).toFixed(1), y: +(p.y - minY).toFixed(1) })),
            color: 'rose',
            width: maxX - minX,
            height: maxY - minY,
          },
        });
      }}
    >
      <svg className="pointer-events-none h-full w-full">
        <path
          d={screenPts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#e11d48"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
