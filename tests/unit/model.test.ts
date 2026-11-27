import { describe, expect, it } from 'vitest';
import { Session } from './helpers';
import { reachableObjectIds, walkChain } from '../../src/core/model/queries';
import { parseLiteral, valuesEqual } from '../../src/core/model/values';
import { CommandError } from '../../src/core/commands/types';
import { applyCommand } from '../../src/core/commands/apply';

describe('object creation', () => {
  it('creates a node with uninitialized val and next', () => {
    const s = new Session();
    const id = s.node();
    const o = s.doc.objects[id];
    expect(o.kind).toBe('node');
    expect(o.typeName).toBe('ListNode');
    expect(o.serial).toBe(1);
    expect(o.slots.map((x) => [x.name, x.kind, x.value.kind])).toEqual([
      ['val', 'primitive', 'uninitialized'],
      ['next', 'reference', 'uninitialized'],
    ]);
  });

  it('objects with identical values remain distinct identities', () => {
    const s = new Session();
    const a = s.node();
    const b = s.node();
    s.setVal(a, 5).setVal(b, 5);
    expect(a).not.toBe(b);
    expect(s.doc.objects[a].serial).not.toBe(s.doc.objects[b].serial);
  });

  it('creates arrays and matrices with uninitialized cells', () => {
    const s = new Session();
    s.run({ type: 'createObject', kind: 'array', position: { x: 0, y: 0 }, options: { length: 4 } });
    s.run({ type: 'createObject', kind: 'matrix', position: { x: 0, y: 0 }, options: { rows: 2, cols: 3 } });
    const [arr, mat] = Object.values(s.doc.objects);
    expect(arr.slots.map((x) => x.name)).toEqual(['0', '1', '2', '3']);
    expect(arr.slots.every((x) => x.value.kind === 'uninitialized')).toBe(true);
    expect(mat.shape).toEqual({ rows: 2, cols: 3 });
    expect(mat.slots).toHaveLength(6);
  });

  it('generic objects support adding, renaming and removing fields', () => {
    const s = new Session();
    s.run({ type: 'createObject', kind: 'object', position: { x: 0, y: 0 }, options: { typeName: 'TreeNode' } });
    const id = Object.keys(s.doc.objects)[0];
    s.run({ type: 'addSlot', objectId: id, name: 'left', slotKind: 'reference' });
    s.run({ type: 'addSlot', objectId: id, name: 'key', slotKind: 'primitive' });
    const key = s.slotId(id, 'key');
    s.run({ type: 'renameSlot', objectId: id, slotId: key, name: 'val' });
    expect(s.doc.objects[id].slots.map((x) => x.name)).toEqual(['left', 'val']);
    s.run({ type: 'removeSlot', objectId: id, slotId: key });
    expect(s.doc.objects[id].slots.map((x) => x.name)).toEqual(['left']);
  });

  it('rejects storing a reference in a primitive field', () => {
    const s = new Session();
    const a = s.node();
    expect(() =>
      applyCommand(s.doc, { type: 'setReference', source: { kind: 'slot', objectId: a, slotId: s.slotId(a, 'val') }, target: { kind: 'object', objectId: a } }),
    ).toThrow(CommandError);
  });
});

describe('variables', () => {
  it('declares variables as uninitialized, distinct from null', () => {
    const s = new Session();
    const head = s.variable('head');
    expect(s.doc.variables[head].value).toEqual({ kind: 'uninitialized' });
    s.point(head, null);
    expect(s.doc.variables[head].value).toEqual({ kind: 'null' });
    expect(valuesEqual({ kind: 'null' }, { kind: 'uninitialized' })).toBe(false);
  });

  it('initializes explicitly and refuses double initialization', () => {
    const s = new Session();
    const i = s.variable('i');
    s.run({ type: 'initializeVariable', variableId: i, source: { kind: 'value', value: { kind: 'number', value: 0 } } });
    expect(s.doc.variables[i].value).toEqual({ kind: 'number', value: 0 });
    expect(() => applyCommand(s.doc, { type: 'initializeVariable', variableId: i, source: { kind: 'value', value: { kind: 'number', value: 1 } } })).toThrow(
      /already initialized/,
    );
    expect(s.history.entries.at(-1)?.ops).toEqual(['initialization']);
  });

  it('parses typed literals deterministically', () => {
    expect(parseLiteral('10')).toEqual({ kind: 'number', value: 10 });
    expect(parseLiteral('null')).toEqual({ kind: 'null' });
    expect(parseLiteral('')).toEqual({ kind: 'uninitialized' });
    expect(parseLiteral('true')).toEqual({ kind: 'boolean', value: true });
    expect(parseLiteral('"10"')).toEqual({ kind: 'string', value: '10' });
    expect(parseLiteral('abc')).toEqual({ kind: 'string', value: 'abc' });
  });
});

describe('references', () => {
  it('assigns and reassigns a reference by identity', () => {
    const s = new Session();
    const [a, b] = [s.node(), s.node()];
    const head = s.variable('head');
    s.point(head, a);
    expect(s.doc.variables[head].value).toEqual({ kind: 'ref', targetId: a });
    s.point(head, b);
    expect(s.doc.variables[head].value).toEqual({ kind: 'ref', targetId: b });
  });

  it('multiple variables and fields may share the same target', () => {
    const s = new Session();
    const [a, b, c] = [s.node(), s.node(), s.node()];
    const x = s.variable('x');
    const y = s.variable('y');
    s.point(x, c).point(y, c).link(a, c).link(b, c);
    const targets = [s.doc.variables[x].value, s.doc.variables[y].value, s.doc.objects[a].slots[1].value, s.doc.objects[b].slots[1].value];
    expect(targets.every((t) => t.kind === 'ref' && t.targetId === c)).toBe(true);
  });

  it('copies the target of another reference without cloning the object', () => {
    const s = new Session();
    const a = s.node();
    const cur = s.variable('current');
    const prev = s.variable('prev');
    s.point(cur, a);
    const before = Object.keys(s.doc.objects).length;
    s.run({ type: 'assignValue', target: { kind: 'variable', variableId: prev }, source: { kind: 'operand', operand: { kind: 'variable', variableId: cur } } });
    expect(s.doc.variables[prev].value).toEqual({ kind: 'ref', targetId: a });
    expect(Object.keys(s.doc.objects)).toHaveLength(before);
  });

  it('reads variable.field operands and reports null dereferences', () => {
    const s = new Session();
    const [a, b] = s.list([1, 2]);
    const cur = s.variable('current');
    const nxt = s.variable('next');
    s.point(cur, a);
    s.run({ type: 'assignValue', target: { kind: 'variable', variableId: nxt }, source: { kind: 'operand', operand: { kind: 'variableField', variableId: cur, fieldName: 'next' } } });
    expect(s.doc.variables[nxt].value).toEqual({ kind: 'ref', targetId: b });
    s.point(cur, null);
    expect(() =>
      applyCommand(s.doc, { type: 'assignValue', target: { kind: 'variable', variableId: nxt }, source: { kind: 'operand', operand: { kind: 'variableField', variableId: cur, fieldName: 'next' } } }),
    ).toThrow(/NullPointerException/);
  });

  it('supports self-references', () => {
    const s = new Session();
    const a = s.node();
    s.link(a, a);
    expect(s.doc.objects[a].slots[1].value).toEqual({ kind: 'ref', targetId: a });
    expect(walkChain(s.doc, a).end).toBe('cycle');
  });

  it('supports circular references', () => {
    const s = new Session();
    const [a, b, c] = s.list([1, 2, 3]);
    s.link(c, a);
    const w = walkChain(s.doc, a);
    expect(w.end).toBe('cycle');
    expect(w.ids).toEqual([a, b, c]);
  });

  it('keeps unreachable objects and reports them as unreachable', () => {
    const s = new Session();
    const [a, b] = s.list([1, 2]);
    const head = s.variable('head');
    s.point(head, a);
    s.link(a, null);
    expect(s.doc.objects[b]).toBeDefined();
    expect(reachableObjectIds(s.doc).has(b)).toBe(false);
    expect(reachableObjectIds(s.doc).has(a)).toBe(true);
  });
});
