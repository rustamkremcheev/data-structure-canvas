import { describe, expect, it } from 'vitest';
import { algorithmData, newest, Session } from './helpers';
import { applyCommand } from '../../src/core/commands/apply';
import { verifyCondition } from '../../src/core/execution/conditions';
import { conventionalNextPhase, LOOP_PHASES } from '../../src/core/execution/loops';
import type { LoopContext } from '../../src/core/model/types';
import { GLOBAL_SCOPE_ID } from '../../src/core/model/types';
import { currentScopeId } from '../../src/core/model/queries';

function setup() {
  const s = new Session();
  const nodes = s.list();
  const head = s.variable('head');
  s.point(head, nodes[0]);
  const i = s.variable('i');
  s.run({ type: 'initializeVariable', variableId: i, source: { kind: 'value', value: { kind: 'number', value: 0 } } });
  const loop = s.loop('while current != null');
  return { s, nodes, head, i, loop };
}

describe('manual loop phases', () => {
  it('requires entering a loop before changing its phase', () => {
    const { s, loop } = setup();
    expect(() => applyCommand(s.doc, { type: 'changePhase', contextId: loop, phase: 'body' })).toThrow(/Enter loop/);
  });

  it('INVARIANT: changing a loop phase does not modify algorithm data', () => {
    const { s, loop } = setup();
    s.run({ type: 'enterContext', contextId: loop });
    for (const phase of ['init', 'condition', 'body', 'update', 'exit', 'condition', 'body'] as const) {
      const before = algorithmData(s.doc);
      s.run({ type: 'changePhase', contextId: loop, phase });
      expect(algorithmData(s.doc)).toEqual(before);
      expect((s.doc.contexts[loop] as LoopContext).phase).toBe(phase);
    }
  });

  it('INVARIANT: starting/completing an iteration does not increment algorithm variables', () => {
    const { s, loop, i } = setup();
    s.run({ type: 'enterContext', contextId: loop });
    const before = algorithmData(s.doc);
    s.run({ type: 'changePhase', contextId: loop, phase: 'body' });
    s.run({ type: 'completeIteration', contextId: loop });
    s.run({ type: 'completeIteration', contextId: loop });
    expect(algorithmData(s.doc)).toEqual(before);
    expect(s.doc.variables[i].value).toEqual({ kind: 'number', value: 0 });
    expect((s.doc.contexts[loop] as LoopContext).iterationsCompleted).toBe(2);
  });

  it('INVARIANT: entering the condition phase does not evaluate the condition', () => {
    const { s, loop, head } = setup();
    s.run({
      type: 'updateContext',
      contextId: loop,
      patch: { condition: { left: { kind: 'variable', variableId: head }, operator: '!=', right: { kind: 'literal', value: { kind: 'null' } } } },
    });
    s.run({ type: 'enterContext', contextId: loop });
    s.run({ type: 'changePhase', contextId: loop, phase: 'condition' });
    const l = s.doc.contexts[loop] as LoopContext;
    expect(l.lastConditionResult).toBeNull();
    expect(l.phase).toBe('condition');
    // The user decides — even "wrongly".
    s.run({ type: 'recordConditionResult', contextId: loop, result: false });
    expect((s.doc.contexts[loop] as LoopContext).lastConditionResult).toBe(false);
    expect((s.doc.contexts[loop] as LoopContext).phase).toBe('condition');
  });

  it('optional verification is read-only and never changes the phase', () => {
    const { s, loop, head } = setup();
    const cond = { left: { kind: 'variable' as const, variableId: head }, operator: '!=' as const, right: { kind: 'literal' as const, value: { kind: 'null' as const } } };
    s.run({ type: 'updateContext', contextId: loop, patch: { condition: cond } });
    s.run({ type: 'enterContext', contextId: loop });
    s.run({ type: 'changePhase', contextId: loop, phase: 'condition' });
    const snapshot = JSON.stringify(s.doc);
    expect(verifyCondition(s.doc, cond)).toEqual({ status: 'true' });
    expect(JSON.stringify(s.doc)).toBe(snapshot);
  });

  it('verification reports uninitialized operands as undetermined', () => {
    const s = new Session();
    const x = s.variable('x');
    expect(verifyCondition(s.doc, { left: { kind: 'variable', variableId: x }, operator: '<', right: { kind: 'literal', value: { kind: 'number', value: 3 } } }).status).toBe(
      'undetermined',
    );
  });

  it('break and continue only move the phase', () => {
    const { s, loop } = setup();
    s.run({ type: 'enterContext', contextId: loop });
    s.run({ type: 'changePhase', contextId: loop, phase: 'body' });
    const before = algorithmData(s.doc);
    s.run({ type: 'continueLoop', contextId: loop });
    expect((s.doc.contexts[loop] as LoopContext).phase).toBe('condition');
    s.run({ type: 'breakLoop', contextId: loop });
    expect((s.doc.contexts[loop] as LoopContext).phase).toBe('exit');
    expect(algorithmData(s.doc)).toEqual(before);
  });

  it('exiting a loop produces no result', () => {
    const { s, loop } = setup();
    s.run({ type: 'enterContext', contextId: loop });
    s.run({ type: 'exitContext', contextId: loop });
    expect(s.doc.result).toBeNull();
    expect(s.doc.activeContextPath).toEqual([]);
    expect(s.doc.contexts[loop].status).toBe('exited');
  });

  it('suggests (but never applies) a conventional next phase', () => {
    expect(conventionalNextPhase(LOOP_PHASES.for, 'body', null)).toBe('update');
    expect(conventionalNextPhase(LOOP_PHASES.while, 'condition', false)).toBe('exit');
    expect(conventionalNextPhase(LOOP_PHASES.while, 'condition', null)).toBeNull();
  });
});

describe('nested contexts', () => {
  it('supports arbitrary nested loops with independent metadata', () => {
    const s = new Session();
    const outer = s.loop('outer');
    const inner = s.loop('inner', outer);
    s.run({ type: 'enterContext', contextId: outer });
    s.run({ type: 'changePhase', contextId: outer, phase: 'body' });
    s.run({ type: 'enterContext', contextId: inner });
    expect(s.doc.activeContextPath).toEqual([outer, inner]);
    s.run({ type: 'changePhase', contextId: inner, phase: 'body' });
    s.run({ type: 'completeIteration', contextId: inner });
    s.run({ type: 'completeIteration', contextId: inner });
    s.run({ type: 'exitContext', contextId: inner });
    s.run({ type: 'completeIteration', contextId: outer });
    expect((s.doc.contexts[outer] as LoopContext).iterationsCompleted).toBe(1);
    expect((s.doc.contexts[inner] as LoopContext).iterationsCompleted).toBe(2);
    expect(s.doc.activeContextPath).toEqual([outer]);
    // Re-entering the inner loop starts fresh execution metadata.
    s.run({ type: 'enterContext', contextId: inner });
    expect((s.doc.contexts[inner] as LoopContext).iterationsCompleted).toBe(0);
  });

  it('exiting an outer context also exits its entered inner contexts', () => {
    const s = new Session();
    const a = s.loop('a');
    const b = s.loop('b', a);
    s.run({ type: 'enterContext', contextId: a });
    s.run({ type: 'enterContext', contextId: b });
    s.run({ type: 'exitContext', contextId: a });
    expect(s.doc.activeContextPath).toEqual([]);
    expect(s.doc.contexts[b].status).toBe('exited');
  });

  it('records the active context and iteration on each operation', () => {
    const { s, loop, i } = setup();
    s.run({ type: 'enterContext', contextId: loop });
    s.run({ type: 'changePhase', contextId: loop, phase: 'body' });
    s.run({ type: 'assignValue', target: { kind: 'variable', variableId: i }, source: { kind: 'value', value: { kind: 'number', value: 1 } } });
    const rec = s.history.entries.at(-1)!;
    expect(rec.contextId).toBe(loop);
    expect(rec.iteration).toBe(1);
  });

  it('INVARIANT: no algorithm-specific variables are created by contexts', () => {
    const s = new Session();
    s.loop('reverse loop');
    s.run({ type: 'createContext', spec: { kind: 'condition', name: 'if' }, position: { x: 0, y: 0 } });
    const loop = newest(s.doc.contexts);
    s.run({ type: 'enterContext', contextId: loop });
    expect(Object.keys(s.doc.variables)).toEqual([]);
    expect(Object.keys(s.doc.objects)).toEqual([]);
  });
});

describe('methods and stack frames', () => {
  it('frames have independent local scopes and shared heap identity', () => {
    const s = new Session();
    const node = s.node();
    const g = s.variable('node');
    s.point(g, node);
    s.run({
      type: 'createContext',
      spec: { kind: 'method', name: 'reverse', methodName: 'reverse', parameters: [{ name: 'node', type: 'ListNode' }] },
      position: { x: 0, y: 0 },
    });
    const method = newest(s.doc.contexts);
    s.run({ type: 'createStackFrame', name: 'reverse#1', methodId: method, position: { x: 0, y: 0 }, declareParameters: true });
    const f1 = newest(s.doc.frames);
    expect(currentScopeId(s.doc)).toBe(f1);
    const local = Object.values(s.doc.variables).find((v) => v.scopeId === f1)!;
    expect(local.name).toBe('node');
    expect(local.value.kind).toBe('uninitialized');
    s.run({ type: 'assignValue', target: { kind: 'variable', variableId: local.id }, source: { kind: 'operand', operand: { kind: 'variable', variableId: g } } });
    // Nested call with its own "node"
    s.run({ type: 'createStackFrame', name: 'reverse#2', methodId: method, position: { x: 0, y: 0 }, declareParameters: true });
    const f2 = newest(s.doc.frames);
    const local2 = Object.values(s.doc.variables).find((v) => v.scopeId === f2)!;
    s.point(local2.id, null);
    expect(s.doc.variables[local.id].value).toEqual({ kind: 'ref', targetId: node });
    expect(s.doc.variables[g].value).toEqual({ kind: 'ref', targetId: node });
    expect(s.doc.frames[f2].callerFrameId).toBe(f1);
    expect(Object.keys(s.doc.objects)).toHaveLength(1);
  });

  it('return values are never propagated automatically', () => {
    const s = new Session();
    const result = s.variable('result');
    s.run({ type: 'createStackFrame', name: 'f()', position: { x: 0, y: 0 } });
    const f = newest(s.doc.frames);
    s.run({ type: 'setReturnValue', frameId: f, source: { kind: 'value', value: { kind: 'number', value: 42 } } });
    s.run({ type: 'exitFrame', frameId: f });
    expect(s.doc.variables[result].value.kind).toBe('uninitialized');
    expect(s.doc.frames[f].status).toBe('returned');
    expect(currentScopeId(s.doc)).toBe(GLOBAL_SCOPE_ID);
    s.run({ type: 'assignValue', target: { kind: 'variable', variableId: result }, source: { kind: 'operand', operand: { kind: 'returnValue', frameId: f } } });
    expect(s.doc.variables[result].value).toEqual({ kind: 'number', value: 42 });
  });

  it('only the top frame can be exited', () => {
    const s = new Session();
    s.run({ type: 'createStackFrame', name: 'a', position: { x: 0, y: 0 } });
    const a = newest(s.doc.frames);
    s.run({ type: 'createStackFrame', name: 'b', position: { x: 0, y: 0 } });
    expect(() => applyCommand(s.doc, { type: 'exitFrame', frameId: a })).toThrow(/top stack frame/);
  });
});
