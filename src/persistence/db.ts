import Dexie, { type Table } from 'dexie';
import { parseProjectFile, serializeProject, type ProjectData, type ProjectFile, type ProjectMode } from '../core/serialization/project';

export interface StoredProject {
  id: string;
  name: string;
  mode: ProjectMode;
  createdAt: number;
  updatedAt: number;
  operationCount: number;
  file: ProjectFile;
}

export type ProjectSummary = Omit<StoredProject, 'file'>;

class DataCanvasDB extends Dexie {
  projects!: Table<StoredProject, string>;

  constructor() {
    super('datacanvas');
    this.version(1).stores({ projects: 'id, name, updatedAt' });
  }
}

let db: DataCanvasDB | null = null;
function getDb(): DataCanvasDB {
  db ??= new DataCanvasDB();
  return db;
}

const LAST_PROJECT_KEY = 'datacanvas:lastProjectId';

export function rememberLastProject(id: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id);
  } catch {
    /* storage unavailable */
  }
}

export function lastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

/** Persists the existing state as-is. Never alters the document or history. */
export async function saveProject(data: ProjectData): Promise<void> {
  const file = serializeProject(data);
  await getDb().projects.put({
    id: data.meta.id,
    name: data.meta.name,
    mode: data.meta.mode,
    createdAt: data.meta.createdAt,
    updatedAt: data.meta.updatedAt,
    operationCount: data.history.entries.length,
    file,
  });
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await getDb().projects.orderBy('updatedAt').reverse().toArray();
  return all.map(({ file: _file, ...rest }) => rest);
}

export async function loadProject(id: string): Promise<ProjectData | null> {
  const row = await getDb().projects.get(id);
  if (!row) return null;
  const parsed = parseProjectFile(row.file);
  if (!parsed.ok) throw new Error(`Stored project is invalid: ${parsed.errors.slice(0, 3).join('; ')}`);
  return parsed.data;
}

export async function deleteProject(id: string): Promise<void> {
  await getDb().projects.delete(id);
}

export async function renameStoredProject(id: string, name: string): Promise<void> {
  const row = await getDb().projects.get(id);
  if (!row) return;
  row.name = name;
  row.file.project = { ...row.file.project, name };
  await getDb().projects.put(row);
}

export async function duplicateProject(id: string, newId: string): Promise<ProjectData | null> {
  const data = await loadProject(id);
  if (!data) return null;
  const now = Date.now();
  const copy: ProjectData = { ...data, meta: { ...data.meta, id: newId, name: `${data.meta.name} (copy)`, createdAt: now, updatedAt: now } };
  await saveProject(copy);
  return copy;
}
