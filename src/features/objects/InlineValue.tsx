import { useEffect, useRef, useState } from 'react';
import type { RefSource, Value } from '../../core/model/types';
import { valueToEditText } from '../../core/model/values';
import { ValueChip } from '../../components/values';
import { useProjectStore } from '../../stores/projectStore';
import { commitInlineValue } from './slotEditing';
import { cx } from '../../components/ui';

/**
 * A value cell that becomes an input on double-click. Accepts numbers, strings,
 * true/false, null, `?` (uninitialized) and `@n` (reference to object @n).
 */
export function InlineValue({ target, value, testId, className }: { target: RefSource; value: Value; testId?: string; className?: string }) {
  const doc = useProjectStore((s) => s.doc);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) setTimeout(() => ref.current?.select(), 0);
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref}
        data-testid={testId ? `${testId}-input` : undefined}
        className="nodrag nopan h-5 w-full min-w-12 rounded border border-violet-300 bg-white px-1 font-mono text-[11px] outline-none"
        value={text}
        placeholder="10, null, @2, ?"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            commitInlineValue(useProjectStore.getState().doc, target, text);
            setEditing(false);
          } else if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={() => setEditing(false)}
      />
    );
  }
  return (
    <button
      type="button"
      data-testid={testId}
      title="Double-click to edit (e.g. 10, null, @2, ?)"
      className={cx('nodrag min-w-0 cursor-text text-left', className)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setText(valueToEditText(value) || (value.kind === 'ref' && doc.objects[value.targetId] ? `@${doc.objects[value.targetId].serial}` : ''));
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          setText(valueToEditText(value));
          setEditing(true);
        }
      }}
    >
      <ValueChip value={value} doc={doc} compact />
    </button>
  );
}
