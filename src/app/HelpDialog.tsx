import { Modal } from '../components/dialogs';
import { Kbd, SectionTitle } from '../components/ui';
import { useUiStore } from '../stores/uiStore';
import { TOOLS } from '../features/toolbar/tools';

export function HelpDialog() {
  const open = useUiStore((s) => s.helpOpen);
  const setOpen = useUiStore((s) => s.setHelpOpen);
  if (!open) return null;
  return (
    <Modal title="DataCanvas — help" onClose={() => setOpen(false)} width="w-[640px]">
      <p className="text-[12px] leading-relaxed text-slate-600">
        DataCanvas never runs your algorithm. You create objects and variables, move references, step through loop phases and decide every condition. The app only records
        what you do.
      </p>
      <SectionTitle>Tools</SectionTitle>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        {TOOLS.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2">
            <span className="text-slate-700">{t.label}</span>
            <Kbd>{t.shortcut}</Kbd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-700">Create Checkpoint</span>
          <Kbd>K</Kbd>
        </div>
      </div>
      <SectionTitle>Editing</SectionTitle>
      <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-slate-600">
        <li>
          Double-click a value to edit it: <code>10</code>, <code>"text"</code>, <code>true</code>, <code>null</code>, <code>?</code> (uninitialized), <code>@3</code> (reference to object @3).
        </li>
        <li>Drag from a round handle (variable or reference field) onto an object to set the reference; onto a variable to copy its value; onto a null marker to assign null.</li>
        <li>Right-click elements and references for more actions. Delete on a selected reference assigns null.</li>
        <li>
          <Kbd>Ctrl/⌘+Z</Kbd> undo, <Kbd>Ctrl/⌘+Shift+Z</Kbd> redo, <Kbd>Ctrl/⌘+C/V/D</Kbd> copy/paste/duplicate, <Kbd>Ctrl/⌘+G</Kbd> group, <Kbd>Del</Kbd> delete,{' '}
          <Kbd>Shift+1</Kbd> fit view, <Kbd>G</Kbd> grid, <Kbd>Shift+G</Kbd> snap, <Kbd>]</Kbd> properties panel, <Kbd>Ctrl/⌘+S</Kbd> save.
        </li>
        <li>Pan with the Hand tool, middle/right mouse drag or the scroll wheel; zoom with Ctrl/⌘ + wheel or pinch.</li>
      </ul>
    </Modal>
  );
}
