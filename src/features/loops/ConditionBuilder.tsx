import { useEffect, useState } from 'react';
import type { ComparisonOperator, Condition, Id, Operand } from '../../core/model/types';
import { OPERATORS } from '../../core/execution/conditions';
import { OperandPicker } from '../../components/values';
import { Button, cx, inputClass } from '../../components/ui';
import { dispatch } from '../../stores/projectStore';

/** Left operand, operator, right operand. Defines the condition text only — it is never evaluated to drive execution. */
export function ConditionBuilder({ contextId, condition }: { contextId: Id; condition?: Condition }) {
  const [left, setLeft] = useState<Operand | null>(condition?.left ?? null);
  const [op, setOp] = useState<ComparisonOperator>(condition?.operator ?? '!=');
  const [right, setRight] = useState<Operand | null>(condition?.right ?? null);

  useEffect(() => {
    setLeft(condition?.left ?? null);
    setOp(condition?.operator ?? '!=');
    setRight(condition?.right ?? null);
  }, [contextId, condition]);

  return (
    <div className="space-y-1.5" data-testid="condition-builder">
      <OperandPicker value={left} onChange={setLeft} placeholder="left operand" testId="cond-left" />
      <select data-testid="cond-op" className={cx(inputClass, 'w-20 font-mono')} value={op} onChange={(e) => setOp(e.target.value as ComparisonOperator)}>
        {OPERATORS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <OperandPicker value={right} onChange={setRight} placeholder="right operand" testId="cond-right" />
      <div className="flex gap-1.5">
        <Button
          variant="primary"
          size="xs"
          data-testid="cond-save"
          disabled={!left || !right}
          onClick={() => left && right && dispatch({ type: 'updateContext', contextId, patch: { condition: { left, operator: op, right } } })}
        >
          Save condition
        </Button>
        {condition && (
          <Button size="xs" variant="ghost" onClick={() => dispatch({ type: 'updateContext', contextId, patch: { condition: null } })}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
