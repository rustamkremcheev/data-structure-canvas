import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Download, FolderOpen, Pencil, Plus, Trash2, Upload, Trophy } from 'lucide-react';
import { Modal } from '../../components/dialogs';
import { Button } from '../../components/ui';
import { deleteProject, duplicateProject, listProjects, loadProject, rememberLastProject, renameStoredProject, saveProject, type ProjectSummary } from '../../persistence/db';
import { parseProjectFile, projectToJson } from '../../core/serialization/project';
import { newId, useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { openConfirm, openForm } from '../../stores/dialogStore';

export async function saveCurrent(): Promise<void> {
  const store = useProjectStore.getState();
  store.setSaveStatus('saving');
  try {
    await saveProject(store.snapshot());
    rememberLastProject(store.meta.id);
    store.setSaveStatus('saved', Date.now());
  } catch (e) {
    store.setSaveStatus('error');
    useUiStore.getState().toast(`Save failed: ${(e as Error).message}`, 'error');
  }
}

export function exportCurrent(): void {
  const data = useProjectStore.getState().snapshot();
  const blob = new Blob([projectToJson(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.meta.name.replace(/[^\w-]+/g, '_') || 'project'}.datacanvas.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFromText(text: string): Promise<boolean> {
  const parsed = parseProjectFile(text);
  if (!parsed.ok) {
    useUiStore.getState().toast(`Import failed: ${parsed.errors.slice(0, 3).join('; ')}`, 'error');
    return false;
  }
  await saveCurrent();
  const data = { ...parsed.data, meta: { ...parsed.data.meta, id: newId('p'), name: `${parsed.data.meta.name} (imported)` } };
  useProjectStore.getState().load(data);
  await saveCurrent();
  useUiStore.getState().toast('Project imported', 'success');
  return true;
}

export function renameCurrentPrompt(): void {
  const meta = useProjectStore.getState().meta;
  openForm({
    title: 'Rename project',
    fields: [{ name: 'name', label: 'Name', type: 'text', defaultValue: meta.name, required: true }],
    submitLabel: 'Rename',
    onSubmit: (v) => {
      useProjectStore.getState().rename(String(v.name));
      void saveCurrent();
    },
  });
}

export function ProjectsDialog() {
  const open = useUiStore((s) => s.projectsOpen);
  const setOpen = useUiStore((s) => s.setProjectsOpen);
  const currentId = useProjectStore((s) => s.meta.id);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setProjects(await listProjects());
  }, []);

  useEffect(() => {
    if (open) void saveCurrent().then(refresh);
  }, [open, refresh]);

  if (!open) return null;
  const close = () => setOpen(false);

  const openProject = async (id: string) => {
    await saveCurrent();
    const data = await loadProject(id);
    if (data) {
      useProjectStore.getState().load(data);
      rememberLastProject(id);
      close();
    }
  };

  return (
    <Modal title="Projects" onClose={close} width="w-[620px]" testId="projects-dialog">
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Button
          variant="primary"
          data-testid="new-project"
          onClick={async () => {
            await saveCurrent();
            useProjectStore.getState().newProject('sandbox');
            await saveCurrent();
            close();
          }}
        >
          <Plus size={13} /> New sandbox
        </Button>
        <Button
          data-testid="new-challenge"
          onClick={async () => {
            await saveCurrent();
            useProjectStore.getState().newProject('challenge', 'leetcode-206');
            useUiStore.getState().setRightPanel(true, 'challenge');
            await saveCurrent();
            close();
          }}
        >
          <Trophy size={13} /> New challenge: Reverse Linked List
        </Button>
        <Button onClick={() => fileRef.current?.click()} data-testid="import-project">
          <Upload size={13} /> Import JSON
        </Button>
        <Button onClick={exportCurrent}>
          <Download size={13} /> Export current
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="import-file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f && (await importFromText(await f.text()))) close();
          }}
        />
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[11px] text-slate-400">
            <th className="pb-1 font-medium">Name</th>
            <th className="pb-1 font-medium">Mode</th>
            <th className="pb-1 font-medium">Operations</th>
            <th className="pb-1 font-medium">Updated</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="border-t border-slate-100" data-testid="project-row">
              <td className="py-1.5">
                <button type="button" className="font-medium text-slate-800 hover:underline" onClick={() => openProject(p.id)} data-testid={`open-${p.name}`}>
                  {p.name}
                </button>
                {p.id === currentId && <span className="ml-1.5 rounded bg-violet-50 px-1 text-[10px] text-violet-700">open</span>}
              </td>
              <td className="text-slate-500">{p.mode}</td>
              <td className="text-slate-500">{p.operationCount}</td>
              <td className="text-slate-500">{new Date(p.updatedAt).toLocaleString()}</td>
              <td className="py-1 text-right">
                <span className="inline-flex gap-0.5">
                  <Button size="xs" variant="ghost" title="Open" onClick={() => openProject(p.id)}>
                    <FolderOpen size={12} />
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    title="Rename"
                    onClick={() =>
                      openForm({
                        title: 'Rename project',
                        fields: [{ name: 'name', label: 'Name', type: 'text', defaultValue: p.name, required: true }],
                        submitLabel: 'Rename',
                        onSubmit: (v) => {
                          const name = String(v.name).trim();
                          if (p.id === currentId) useProjectStore.getState().rename(name);
                          void renameStoredProject(p.id, name).then(refresh);
                        },
                      })
                    }
                  >
                    <Pencil size={12} />
                  </Button>
                  <Button size="xs" variant="ghost" title="Duplicate" onClick={async () => (await duplicateProject(p.id, newId('p')), refresh())}>
                    <Copy size={12} />
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    title="Delete"
                    disabled={p.id === currentId}
                    onClick={() =>
                      openConfirm({
                        title: 'Delete project?',
                        message: `“${p.name}” will be permanently removed from this browser.`,
                        confirmLabel: 'Delete',
                        danger: true,
                        onConfirm: () => void deleteProject(p.id).then(refresh),
                      })
                    }
                  >
                    <Trash2 size={12} />
                  </Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {projects.length === 0 && <div className="py-4 text-center text-[12px] text-slate-400">No saved projects yet.</div>}
      <p className="mt-3 text-[11px] text-slate-400">Projects are stored locally in this browser (IndexedDB). Export to JSON to back them up or share them.</p>
    </Modal>
  );
}
