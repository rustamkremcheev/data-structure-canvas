import type { DocumentState, RefSource, Value } from '../../core/model/types';
import { parseLiteral } from '../../core/model/values';
import { dispatch } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';

/** Parses inline editor input. `@3` means "reference to the object with identity @3". */
export function parseValueInput(doc: DocumentState, text: string): Value | { error: string } {
  const t = text.trim();
  const m = /^@(\d+)$/.exec(t);
  if (m) {
    const serial = Number(m[1]);
    const o = Object.values(doc.objects).find((x) => x.serial === serial);
    if (!o) return { error: `No object with identity @${serial}` };
    return { kind: 'ref', targetId: o.id };
  }
  return parseLiteral(t);
}

/** Commits an inline edit as the appropriate explicit command. */
export function commitInlineValue(doc: DocumentState, target: RefSource, text: string): boolean {
  const parsed = parseValueInput(doc, text);
  if ('error' in parsed) {
    useUiStore.getState().toast(parsed.error, 'error');
    return false;
  }
  if (parsed.kind === 'ref') return dispatch({ type: 'setReference', source: target, target: { kind: 'object', objectId: parsed.targetId } });
  if (target.kind === 'variable') {
    const v = doc.variables[target.variableId];
    if (v && v.value.kind === 'uninitialized' && parsed.kind !== 'uninitialized') {
      return dispatch({ type: 'initializeVariable', variableId: target.variableId, source: { kind: 'value', value: parsed } });
    }
  }
  if (parsed.kind === 'uninitialized') return dispatch({ type: 'setReference', source: target, target: { kind: 'uninitialized' } });
  return dispatch({ type: 'assignValue', target, source: { kind: 'value', value: parsed } });
}
