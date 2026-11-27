import type { ComparisonOperator, Condition, DocumentState, Operand, Value } from '../model/types';
import { findSlotByName, getSlot } from '../model/queries';
import { formatValue, valuesEqual } from '../model/values';

export const OPERATORS: ComparisonOperator[] = ['==', '!=', '<', '<=', '>', '>='];

export function describeOperand(doc: DocumentState, op: Operand): string {
  switch (op.kind) {
    case 'variable':
      return doc.variables[op.variableId]?.name ?? '<missing>';
    case 'variableField':
      return `${doc.variables[op.variableId]?.name ?? '<missing>'}.${op.fieldName}`;
    case 'objectSlot': {
      const o = doc.objects[op.objectId];
      const s = getSlot(doc, op.objectId, op.slotId);
      return o && s ? `${o.typeName}@${o.serial}.${s.name}` : '<missing>';
    }
    case 'returnValue':
      return `return(${doc.frames[op.frameId]?.name ?? '<missing frame>'})`;
    case 'literal':
      return formatValue(op.value);
  }
}

export function describeCondition(doc: DocumentState, c: Condition | undefined): string {
  if (!c) return '(no condition defined)';
  return `${describeOperand(doc, c.left)} ${c.operator} ${describeOperand(doc, c.right)}`;
}

export type OperandReading = { ok: true; value: Value } | { ok: false; reason: string };

/** Reads an operand's current value. Read-only. */
export function readOperand(doc: DocumentState, op: Operand): OperandReading {
  switch (op.kind) {
    case 'literal':
      return { ok: true, value: op.value };
    case 'variable': {
      const v = doc.variables[op.variableId];
      return v ? { ok: true, value: v.value } : { ok: false, reason: 'variable no longer exists' };
    }
    case 'variableField': {
      const v = doc.variables[op.variableId];
      if (!v) return { ok: false, reason: 'variable no longer exists' };
      if (v.value.kind === 'null') return { ok: false, reason: `${v.name} is null (NullPointerException)` };
      if (v.value.kind === 'uninitialized') return { ok: false, reason: `${v.name} is uninitialized` };
      if (v.value.kind !== 'ref') return { ok: false, reason: `${v.name} is not a reference` };
      const slot = findSlotByName(doc, v.value.targetId, op.fieldName);
      if (!doc.objects[v.value.targetId]) return { ok: false, reason: `${v.name} points to a missing object` };
      if (!slot) return { ok: false, reason: `object has no field "${op.fieldName}"` };
      return { ok: true, value: slot.value };
    }
    case 'objectSlot': {
      const s = getSlot(doc, op.objectId, op.slotId);
      return s ? { ok: true, value: s.value } : { ok: false, reason: 'slot no longer exists' };
    }
    case 'returnValue': {
      const f = doc.frames[op.frameId];
      if (!f) return { ok: false, reason: 'frame no longer exists' };
      if (!f.returnValue) return { ok: false, reason: `${f.name} has no return value set` };
      return { ok: true, value: f.returnValue };
    }
  }
}

export type Verification = { status: 'true' | 'false' } | { status: 'undetermined'; reason: string };

/**
 * Optional, explicitly requested verification of a condition against the
 * current state. It is purely informational and never decides the next phase.
 */
export function verifyCondition(doc: DocumentState, c: Condition): Verification {
  const l = readOperand(doc, c.left);
  const r = readOperand(doc, c.right);
  if (!l.ok) return { status: 'undetermined', reason: `left operand: ${l.reason}` };
  if (!r.ok) return { status: 'undetermined', reason: `right operand: ${r.reason}` };
  const a = l.value;
  const b = r.value;
  if (a.kind === 'uninitialized' || b.kind === 'uninitialized') {
    return { status: 'undetermined', reason: 'an operand is uninitialized' };
  }
  if (c.operator === '==' || c.operator === '!=') {
    const eq = valuesEqual(a, b);
    return { status: (c.operator === '==') === eq ? 'true' : 'false' };
  }
  if ((a.kind === 'number' && b.kind === 'number') || (a.kind === 'string' && b.kind === 'string')) {
    const x = a.value;
    const y = b.value;
    const res = c.operator === '<' ? x < y : c.operator === '<=' ? x <= y : c.operator === '>' ? x > y : x >= y;
    return { status: res ? 'true' : 'false' };
  }
  return { status: 'undetermined', reason: `cannot order ${a.kind} and ${b.kind}` };
}
