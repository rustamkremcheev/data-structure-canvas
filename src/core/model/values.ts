import type { DocumentState, Id, Value } from './types';

export const UNINITIALIZED: Value = Object.freeze({ kind: 'uninitialized' }) as Value;
export const NULL: Value = Object.freeze({ kind: 'null' }) as Value;

export const num = (value: number): Value => ({ kind: 'number', value });
export const str = (value: string): Value => ({ kind: 'string', value });
export const bool = (value: boolean): Value => ({ kind: 'boolean', value });
export const ref = (targetId: Id): Value => ({ kind: 'ref', targetId });

export function isPrimitive(v: Value): boolean {
  return v.kind === 'number' || v.kind === 'string' || v.kind === 'boolean';
}

/** Identity-based equality: references are equal only when they target the same object. */
export function valuesEqual(a: Value, b: Value): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'uninitialized':
    case 'null':
      return true;
    case 'ref':
      return a.targetId === (b as typeof a).targetId;
    default:
      return a.value === (b as typeof a).value;
  }
}

export function cloneValue(v: Value): Value {
  return { ...v };
}

export function objectLabel(doc: DocumentState, id: Id): string {
  const o = doc.objects[id];
  if (!o) return `<missing ${id}>`;
  return `${o.name ? o.name + ' ' : ''}${o.typeName}@${o.serial}`;
}

export function formatValue(v: Value, doc?: DocumentState): string {
  switch (v.kind) {
    case 'uninitialized':
      return '?';
    case 'null':
      return 'null';
    case 'number':
      return String(v.value);
    case 'string':
      return JSON.stringify(v.value);
    case 'boolean':
      return String(v.value);
    case 'ref':
      if (!doc) return `→${v.targetId}`;
      return doc.objects[v.targetId] ? `→${objectLabel(doc, v.targetId)}` : `→<dangling ${v.targetId}>`;
  }
}

/**
 * Parses what a user typed into an inline value editor. Deterministic and
 * explicit: `null`, `true`/`false`, numbers, quoted or bare strings, and `?`
 * for "uninitialized".
 */
export function parseLiteral(text: string): Value {
  const t = text.trim();
  if (t === '?' || t === '') return UNINITIALIZED;
  if (t === 'null') return NULL;
  if (t === 'true') return bool(true);
  if (t === 'false') return bool(false);
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return num(Number(t));
  if ((t.startsWith('"') && t.endsWith('"') && t.length >= 2) || (t.startsWith("'") && t.endsWith("'") && t.length >= 2)) {
    return str(t.slice(1, -1));
  }
  return str(t);
}

/** Text to prefill an inline editor with, round-trippable through `parseLiteral`. */
export function valueToEditText(v: Value): string {
  switch (v.kind) {
    case 'uninitialized':
      return '';
    case 'null':
      return 'null';
    case 'string':
      return /^(null|true|false|\?|[-+]?\d.*)$/.test(v.value) || v.value.trim() !== v.value ? JSON.stringify(v.value) : v.value;
    case 'ref':
      return '';
    default:
      return String(v.value);
  }
}
