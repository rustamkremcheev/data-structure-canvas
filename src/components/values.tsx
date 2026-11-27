import { useMemo, useState } from 'react';
import type { DocumentState, Operand, Value } from '../core/model/types';
import { formatValue, objectLabel, parseLiteral, valueToEditText } from '../core/model/values';
import { scopeName } from '../core/model/queries';
import { getStructure } from '../core/model/structures';
import { useProjectStore } from '../stores/projectStore';
import { cx, inputClass } from './ui';

export function ValueChip({ value, doc, compact }: { value: Value; doc: DocumentState; compact?: boolean }) {
  const base = 'inline-flex max-w-full items-center truncate rounded px-1.5 font-mono text-[11px] leading-5';
  switch (value.kind) {
    case 'uninitialized':
      return (
        <span className={cx(base, 'dc-hatch border border-amber-200 text-amber-700')} title="Uninitialized — no value assigned yet">
          ?{compact ? '' : ' uninit'}
        </span>
      );
    case 'null':
      return (
        <span className={cx(base, 'border border-slate-300 bg-slate-50 italic text-slate-500')} title="null — explicitly references nothing">
          null
        </span>
      );
    case 'ref': {
      const missing = !doc.objects[value.targetId];
      return (
        <span
          className={cx(base, missing ? 'border border-rose-300 bg-rose-50 text-rose-700' : 'border border-sky-200 bg-sky-50 text-sky-800')}
          title={missing ? 'Dangling reference to a deleted object' : `Reference to ${objectLabel(doc, value.targetId)}`}
        >
          → {missing ? 'deleted' : `@${doc.objects[value.targetId].serial}`}
        </span>
      );
    }
    case 'string':
      return <span className={cx(base, 'border border-emerald-200 bg-emerald-50 text-emerald-800')}>{JSON.stringify(value.value)}</span>;
    case 'boolean':
      return <span className={cx(base, 'border border-violet-200 bg-violet-50 text-violet-800')}>{String(value.value)}</span>;
    case 'number':
      return <span className={cx(base, 'border border-slate-200 bg-white text-slate-800')}>{value.value}</span>;
  }
}

/** Encodes operands for <select> values. */
export function operandKey(op: Operand | null | undefined): string {
  if (!op) return '';
  switch (op.kind) {
    case 'variable':
      return `var:${op.variableId}`;
    case 'variableField':
      return `vf:${op.variableId}:${op.fieldName}`;
    case 'objectSlot':
      return `os:${op.objectId}:${op.slotId}`;
    case 'returnValue':
      return `rv:${op.frameId}`;
    case 'literal':
      return op.value.kind === 'null' ? 'null' : 'lit';
  }
}

function decodeOperand(key: string, literalText: string): Operand | null {
  if (!key) return null;
  if (key === 'null') return { kind: 'literal', value: { kind: 'null' } };
  if (key === 'lit') return { kind: 'literal', value: parseLiteral(literalText) };
  const [kind, a, b] = key.split(':');
  if (kind === 'var') return { kind: 'variable', variableId: a };
  if (kind === 'vf') return { kind: 'variableField', variableId: a, fieldName: key.slice(kind.length + a.length + 2) };
  if (kind === 'os') return { kind: 'objectSlot', objectId: a, slotId: b };
  if (kind === 'rv') return { kind: 'returnValue', frameId: a };
  return null;
}

export function useOperandOptions(doc: DocumentState) {
  return useMemo(() => {
    const vars = Object.values(doc.variables).sort((a, b) => a.name.localeCompare(b.name));
    const fieldNames = new Set<string>();
    for (const o of Object.values(doc.objects)) {
      if (getStructure(o.kind).indexedSlots || o.kind === 'container') continue;
      for (const s of o.slots) fieldNames.add(s.name);
    }
    const groups: { label: string; options: { value: string; label: string }[] }[] = [
      { label: 'Variables', options: vars.map((v) => ({ value: `var:${v.id}`, label: `${v.name} (${scopeName(doc, v.scopeId)})` })) },
      {
        label: 'Variable fields',
        options: vars.flatMap((v) => [...fieldNames].sort().map((f) => ({ value: `vf:${v.id}:${f}`, label: `${v.name}.${f}` }))),
      },
      {
        label: 'Return values',
        options: Object.values(doc.frames).map((f) => ({ value: `rv:${f.id}`, label: `return of ${f.name}` })),
      },
      {
        label: 'Literal',
        options: [
          { value: 'null', label: 'null' },
          { value: 'lit', label: 'value…' },
        ],
      },
    ];
    return groups.filter((g) => g.options.length > 0);
  }, [doc]);
}

export function OperandPicker({
  value,
  onChange,
  placeholder = 'choose…',
  testId,
  allowLiteral = true,
}: {
  value: Operand | null;
  onChange(op: Operand | null): void;
  placeholder?: string;
  testId?: string;
  allowLiteral?: boolean;
}) {
  const doc = useProjectStore((s) => s.doc);
  const groups = useOperandOptions(doc);
  const [text, setText] = useState(value?.kind === 'literal' ? valueToEditText(value.value) : '');
  const key = operandKey(value);
  return (
    <div className="flex min-w-0 gap-1">
      <select
        data-testid={testId}
        className={cx(inputClass, 'min-w-0 flex-1 px-1')}
        value={key}
        onChange={(e) => onChange(decodeOperand(e.target.value, text))}
      >
        <option value="">{placeholder}</option>
        {groups
          .filter((g) => allowLiteral || g.label !== 'Literal')
          .map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
      {key === 'lit' && (
        <input
          data-testid={testId ? `${testId}-literal` : undefined}
          className={cx(inputClass, 'w-20 flex-none')}
          value={text}
          placeholder="e.g. 0"
          onChange={(e) => {
            setText(e.target.value);
            onChange({ kind: 'literal', value: parseLiteral(e.target.value) });
          }}
        />
      )}
    </div>
  );
}

export function formatValueShort(v: Value, doc: DocumentState) {
  return formatValue(v, doc);
}
