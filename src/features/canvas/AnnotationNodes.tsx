import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { PALETTE } from '../../components/palette';
import { cx } from '../../components/ui';
import { dispatch, useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';

function TextNodeImpl({ data }: NodeProps) {
  const { annotationId } = data as { annotationId: string };
  const a = useProjectStore((s) => s.doc.annotations[annotationId]);
  const editing = useUiStore((s) => s.editingTextId === annotationId);
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing && a?.kind === 'text') {
      setText(a.text);
      setTimeout(() => ref.current?.select(), 0);
    }
    // Only re-seed the editor when editing starts, not on every store update.
  }, [editing]);
  if (!a || a.kind !== 'text') return null;
  const finish = () => {
    useUiStore.getState().setEditingText(null);
    if (text !== a.text) dispatch({ type: 'updateAnnotation', annotationId, patch: { text } });
  };
  return (
    <div className={cx('dc-node max-w-[320px] rounded px-1.5 py-0.5', editing && 'ring-1 ring-violet-300')} onDoubleClick={() => useUiStore.getState().setEditingText(annotationId)}>
      {editing ? (
        <textarea
          ref={ref}
          autoFocus
          onFocus={(e) => e.target.select()}
          className="nodrag nopan block min-h-8 w-64 resize border-none bg-transparent text-[13px] text-slate-700 outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) finish();
          }}
          onBlur={finish}
        />
      ) : (
        <div className={cx('whitespace-pre-wrap text-[13px]', PALETTE[a.color].text)} style={{ fontFamily: 'ui-rounded, "Comic Sans MS", var(--font-sans)' }}>
          {a.text || ' '}
        </div>
      )}
    </div>
  );
}

function DrawingNodeImpl({ data }: NodeProps) {
  const { annotationId } = data as { annotationId: string };
  const a = useProjectStore((s) => s.doc.annotations[annotationId]);
  if (!a || a.kind !== 'drawing') return null;
  const d = a.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <svg width={Math.max(a.width, 4)} height={Math.max(a.height, 4)} className="dc-node overflow-visible">
      <path d={d} fill="none" stroke={PALETTE[a.color].stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GroupNodeImpl({ data }: NodeProps) {
  const { annotationId, width, height } = data as { annotationId: string; width: number; height: number };
  const a = useProjectStore((s) => s.doc.annotations[annotationId]);
  if (!a || a.kind !== 'group') return null;
  return (
    <div className="dc-node rounded-lg border border-dashed border-violet-300 bg-violet-50/30" style={{ width, height }}>
      <div className="absolute -top-5 left-1 rounded bg-white px-1 text-[11px] font-medium text-violet-700">{a.label}</div>
    </div>
  );
}

function NullMarkerNodeImpl() {
  return (
    <div className="dc-node flex flex-col items-center" title="null marker — drop a reference here to assign null" data-testid="null-marker">
      <Handle type="target" id="in" position={Position.Top} className="dc-target-handle" />
      <svg width="34" height="30" viewBox="0 0 34 30">
        <line x1="17" y1="0" x2="17" y2="10" stroke="#64748b" strokeWidth="1.5" />
        <line x1="5" y1="10" x2="29" y2="10" stroke="#64748b" strokeWidth="1.5" />
        <line x1="10" y1="15" x2="24" y2="15" stroke="#64748b" strokeWidth="1.5" />
        <line x1="14" y1="20" x2="20" y2="20" stroke="#64748b" strokeWidth="1.5" />
      </svg>
      <span className="-mt-1 font-mono text-[10px] text-slate-500">null</span>
    </div>
  );
}

export const TextNode = memo(TextNodeImpl);
export const DrawingNode = memo(DrawingNodeImpl);
export const GroupNode = memo(GroupNodeImpl);
export const NullMarkerNode = memo(NullMarkerNodeImpl);
