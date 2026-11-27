import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { RefSource } from '../../core/model/types';
import { useProjectStore, dispatch } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import {
  assignFromPrompt,
  copySelection,
  createWithTool,
  deleteSelection,
  disconnectEdge,
  duplicateSelection,
  edgeToSource,
  groupSelection,
  markObjectAsResult,
  markResultFrom,
  pasteClipboard,
} from './actions';
import { TOOLS } from '../toolbar/tools';
import { snap } from './Canvas';

function Item({ children, onClick, danger, testId }: { children: ReactNode; onClick(): void; danger?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      className={`block w-full rounded px-2 py-1 text-left text-[12px] ${danger ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100'}`}
      onClick={() => {
        useUiStore.getState().openContextMenu(null);
        onClick();
      }}
    >
      {children}
    </button>
  );
}

const Sep = () => <div className="my-1 h-px bg-slate-100" />;

export function ContextMenu() {
  const menu = useUiStore((s) => s.contextMenu);
  const doc = useProjectStore((s) => s.doc);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) useUiStore.getState().openContextMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && useUiStore.getState().openContextMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);

  if (!menu) return null;
  const t = menu.target;
  const items: ReactNode[] = [];
  const inspect = () => useUiStore.getState().setRightPanel(true, 'inspect');

  if (t.kind === 'node') {
    const id = t.id;
    const sel = useUiStore.getState().selectedIds;
    if (sel.length > 1) {
      items.push(
        <Item key="g" onClick={groupSelection}>
          Group selection
        </Item>,
        <Item key="c" onClick={copySelection}>
          Copy
        </Item>,
        <Item key="d" onClick={duplicateSelection}>
          Duplicate
        </Item>,
        <Sep key="s" />,
        <Item key="x" danger onClick={deleteSelection}>
          Delete {sel.length} elements
        </Item>,
      );
    } else if (doc.objects[id]) {
      items.push(
        <Item key="i" onClick={inspect}>
          Inspect
        </Item>,
        <Item key="r" onClick={() => markObjectAsResult(id)} testId="ctx-mark-result">
          Mark as result
        </Item>,
        <Item key="c" onClick={copySelection}>
          Copy
        </Item>,
        <Item key="d" onClick={duplicateSelection}>
          Duplicate (new identity)
        </Item>,
        <Sep key="s" />,
        <Item key="x" danger onClick={deleteSelection}>
          Delete object
        </Item>,
      );
    } else if (doc.variables[id]) {
      const src: RefSource = { kind: 'variable', variableId: id };
      const name = doc.variables[id].name;
      items.push(
        <Item key="i" onClick={inspect}>
          Inspect
        </Item>,
        <Item key="a" onClick={() => assignFromPrompt(src)} testId="ctx-assign-from">
          {name} = … (copy from)
        </Item>,
        <Item key="n" onClick={() => dispatch({ type: 'setReference', source: src, target: { kind: 'null' } })} testId="ctx-assign-null">
          {name} = null
        </Item>,
        <Item key="r" onClick={() => markResultFrom(src)} testId="ctx-mark-result">
          Mark as result
        </Item>,
        <Sep key="s" />,
        <Item key="x" danger onClick={deleteSelection}>
          Delete variable
        </Item>,
      );
    } else if (doc.contexts[id]) {
      const entered = doc.activeContextPath.includes(id);
      items.push(
        entered ? (
          <Item key="e" onClick={() => dispatch({ type: 'exitContext', contextId: id })}>
            Exit context
          </Item>
        ) : (
          <Item key="e" onClick={() => dispatch({ type: 'enterContext', contextId: id })}>
            Enter context
          </Item>
        ),
        <Item key="f" onClick={() => useUiStore.getState().focusContext(id)}>
          Show in controller
        </Item>,
        <Item key="i" onClick={inspect}>
          Inspect / edit condition
        </Item>,
        <Sep key="s" />,
        <Item key="x" danger onClick={deleteSelection}>
          Delete context
        </Item>,
      );
    } else if (doc.frames[id]) {
      items.push(
        <Item key="p" onClick={() => dispatch({ type: 'exitFrame', frameId: id })}>
          Return (pop frame)
        </Item>,
        <Item key="i" onClick={inspect}>
          Inspect
        </Item>,
        <Sep key="s" />,
        <Item key="x" danger onClick={deleteSelection}>
          Delete frame
        </Item>,
      );
    } else if (doc.annotations[id]) {
      const a = doc.annotations[id];
      if (a.kind === 'text')
        items.push(
          <Item key="t" onClick={() => useUiStore.getState().setEditingText(id)}>
            Edit text
          </Item>,
        );
      items.push(
        <Item key="x" danger onClick={deleteSelection}>
          Delete {a.kind === 'nullMarker' ? 'null marker' : 'annotation'}
        </Item>,
      );
    }
  } else if (t.kind === 'edge') {
    const src = edgeToSource(t.id);
    items.push(
      <Item key="n" onClick={() => disconnectEdge(t.id)} testId="ctx-disconnect">
        {t.id.startsWith('e:i:') ? 'Hide index marker' : 'Disconnect (assign null)'}
      </Item>,
    );
    if (src)
      items.push(
        <Item key="r" onClick={() => assignFromPrompt(src)}>
          Redirect = … (copy from)
        </Item>,
        <Item key="i" onClick={inspect}>
          Inspect reference
        </Item>,
      );
  } else if (t.kind === 'slot') {
    const src: RefSource = { kind: 'slot', objectId: t.objectId, slotId: t.slotId };
    items.push(
      <Item key="n" onClick={() => dispatch({ type: 'setReference', source: src, target: { kind: 'null' } })}>
        = null
      </Item>,
      <Item key="a" onClick={() => assignFromPrompt(src)}>
        = … (copy from)
      </Item>,
      <Item key="r" onClick={() => markResultFrom(src)}>
        Mark as result
      </Item>,
    );
  } else if (t.kind === 'pane') {
    const at = snap({ x: t.flowX, y: t.flowY }, useUiStore.getState().snapToGrid);
    const create = TOOLS.filter((x) => ['node', 'object', 'variable', 'array', 'null', 'loop', 'text'].includes(x.id));
    items.push(
      ...create.map((tool) => (
        <Item key={tool.id} onClick={() => createWithTool(tool.id, at)}>
          {tool.label} here
        </Item>
      )),
      <Sep key="s" />,
      <Item key="p" onClick={() => pasteClipboard()}>
        Paste
      </Item>,
    );
  }

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="context-menu"
      className="fixed z-50 min-w-48 rounded-md border border-slate-200 bg-white p-1 shadow-sm"
      style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 320) }}
    >
      {items}
    </div>
  );
}
