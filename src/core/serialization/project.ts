import type { HistoryState } from '../history/history';
import { createHistory } from '../history/history';
import type { DocumentState, Value } from '../model/types';
import { createEmptyDocument } from '../model/types';

export const SCHEMA_VERSION = 1;
export const FILE_FORMAT = 'datacanvas-project';

export type ProjectMode = 'sandbox' | 'challenge';

export interface ProjectMeta {
  id: string;
  name: string;
  mode: ProjectMode;
  challengeId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectData {
  meta: ProjectMeta;
  doc: DocumentState;
  history: HistoryState;
}

export interface ProjectFile {
  format: typeof FILE_FORMAT;
  schemaVersion: number;
  exportedAt: number;
  project: ProjectMeta;
  document: DocumentState;
  history: HistoryState;
}

export function newProjectData(id: string, name: string, mode: ProjectMode = 'sandbox', challengeId?: string, now = Date.now()): ProjectData {
  return {
    meta: { id, name, mode, ...(challengeId ? { challengeId } : {}), createdAt: now, updatedAt: now },
    doc: createEmptyDocument(),
    history: createHistory(),
  };
}

export function serializeProject(data: ProjectData, now = Date.now()): ProjectFile {
  return {
    format: FILE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    project: data.meta,
    // Round-trip through JSON so frozen Immer objects become plain data.
    document: JSON.parse(JSON.stringify(data.doc)) as DocumentState,
    history: JSON.parse(JSON.stringify(data.history)) as HistoryState,
  };
}

export function projectToJson(data: ProjectData): string {
  return JSON.stringify(serializeProject(data), null, 2);
}

export type ParseResult = { ok: true; data: ProjectData } | { ok: false; errors: string[] };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isPoint = (x: unknown) => isObj(x) && isNum(x.x) && isNum(x.y);

function checkValue(v: unknown, path: string, errors: string[]): void {
  if (!isObj(v) || !isStr(v.kind)) {
    errors.push(`${path}: not a value`);
    return;
  }
  const kind = v.kind as Value['kind'];
  switch (kind) {
    case 'uninitialized':
    case 'null':
      return;
    case 'number':
      if (!isNum(v.value)) errors.push(`${path}: number value expected`);
      return;
    case 'string':
      if (!isStr(v.value)) errors.push(`${path}: string value expected`);
      return;
    case 'boolean':
      if (typeof v.value !== 'boolean') errors.push(`${path}: boolean value expected`);
      return;
    case 'ref':
      if (!isStr(v.targetId)) errors.push(`${path}: reference target id expected`);
      return;
    default:
      errors.push(`${path}: unknown value kind "${String(v.kind)}"`);
  }
}

function checkDocument(d: unknown, errors: string[]): void {
  if (!isObj(d)) {
    errors.push('document: missing');
    return;
  }
  const empty = createEmptyDocument();
  for (const key of Object.keys(empty) as (keyof DocumentState)[]) {
    if (!(key in d)) errors.push(`document.${key}: missing`);
  }
  if (!isNum(d.seq) || !isNum(d.objectSerial)) errors.push('document: id counters must be numbers');
  if (isObj(d.objects)) {
    for (const [id, o] of Object.entries(d.objects)) {
      const p = `objects.${id}`;
      if (!isObj(o) || o.id !== id) {
        errors.push(`${p}: id mismatch`);
        continue;
      }
      if (!['object', 'node', 'array', 'matrix', 'container'].includes(o.kind as string)) errors.push(`${p}: unknown kind`);
      if (!isStr(o.typeName) || !isNum(o.serial) || !isPoint(o.position)) errors.push(`${p}: invalid header`);
      if (!Array.isArray(o.slots)) errors.push(`${p}.slots: array expected`);
      else
        o.slots.forEach((s, i) => {
          if (!isObj(s) || !isStr(s.id) || !isStr(s.name) || !['primitive', 'reference', 'any'].includes(s.kind as string)) {
            errors.push(`${p}.slots[${i}]: invalid slot`);
            return;
          }
          checkValue(s.value, `${p}.slots[${i}].value`, errors);
          if (s.key !== undefined) checkValue(s.key, `${p}.slots[${i}].key`, errors);
        });
    }
  } else errors.push('document.objects: object expected');
  if (isObj(d.variables)) {
    for (const [id, v] of Object.entries(d.variables)) {
      if (!isObj(v) || v.id !== id || !isStr(v.name) || !isStr(v.scopeId) || !isPoint(v.position)) {
        errors.push(`variables.${id}: invalid variable`);
        continue;
      }
      checkValue(v.value, `variables.${id}.value`, errors);
    }
  } else errors.push('document.variables: object expected');
  if (isObj(d.contexts)) {
    for (const [id, c] of Object.entries(d.contexts)) {
      if (!isObj(c) || c.id !== id || !['loop', 'condition', 'method'].includes(c.kind as string) || !isStr(c.name)) {
        errors.push(`contexts.${id}: invalid context`);
      }
    }
  } else errors.push('document.contexts: object expected');
  if (!isObj(d.frames)) errors.push('document.frames: object expected');
  if (!Array.isArray(d.callStack) || !d.callStack.every(isStr)) errors.push('document.callStack: string array expected');
  if (!Array.isArray(d.activeContextPath) || !d.activeContextPath.every(isStr)) errors.push('document.activeContextPath: string array expected');
  if (!isObj(d.annotations)) errors.push('document.annotations: object expected');
}

function checkHistory(h: unknown, errors: string[]): void {
  if (!isObj(h)) {
    errors.push('history: missing');
    return;
  }
  if (!Array.isArray(h.entries)) errors.push('history.entries: array expected');
  if (!isNum(h.cursor)) errors.push('history.cursor: number expected');
  if (Array.isArray(h.entries) && isNum(h.cursor) && (h.cursor < 0 || h.cursor > h.entries.length)) errors.push('history.cursor: out of range');
  if (Array.isArray(h.entries)) {
    h.entries.forEach((e, i) => {
      if (!isObj(e) || !isStr(e.id) || !Array.isArray(e.patches) || !Array.isArray(e.inversePatches) || !Array.isArray(e.ops)) {
        errors.push(`history.entries[${i}]: invalid operation record`);
      }
    });
  }
  if (!Array.isArray(h.checkpoints)) errors.push('history.checkpoints: array expected');
  if (!Array.isArray(h.branches)) errors.push('history.branches: array expected');
  if (!isNum(h.seq)) errors.push('history.seq: number expected');
}

export function parseProjectFile(input: unknown): ParseResult {
  let raw = input;
  if (isStr(raw)) {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ['File is not valid JSON'] };
    }
  }
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['Root must be an object'] };
  if (raw.format !== FILE_FORMAT) errors.push(`format: expected "${FILE_FORMAT}"`);
  if (!isNum(raw.schemaVersion)) errors.push('schemaVersion: missing');
  else if (raw.schemaVersion > SCHEMA_VERSION) errors.push(`schemaVersion ${raw.schemaVersion} is newer than supported (${SCHEMA_VERSION})`);
  const meta = raw.project;
  if (!isObj(meta) || !isStr(meta.id) || !isStr(meta.name) || !['sandbox', 'challenge'].includes(meta.mode as string)) {
    errors.push('project: invalid metadata');
  }
  checkDocument(raw.document, errors);
  checkHistory(raw.history, errors);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: { meta: raw.project as ProjectMeta, doc: raw.document as DocumentState, history: raw.history as HistoryState },
  };
}
