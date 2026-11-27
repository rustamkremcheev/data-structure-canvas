import { describe, expect, it } from 'vitest';
import { algorithmData, Session } from './helpers';
import {
  addCheckpoint,
  BranchRequiredError,
  commit,
  cursorOfEntry,
  goTo,
  redo,
  switchToBranch,
  undo,
} from '../../src/core/history/history';
import { computeStats } from '../../src/core/execution/stats';
import { runDiagnostics } from '../../src/core/validation/diagnostics';
import { getChallenge } from '../../src/core/validation/challenges';
import { parseProjectFile, projectToJson, serializeProject } from '../../src/core/serialization/project';

describe('undo / redo / timeline', () => {
  it('undo and redo restore exact states', () => {
    const s = new Session();
    const a = s.node();
    s.setVal(a, 10);
    const afterSet = s.doc;
    let st = undo(s.doc, s.history);
    expect(st.doc.objects[a].slots[0].value.kind).toBe('uninitialized');
    st = undo(st.doc, st.history);
    expect(st.doc.objects[a]).toBeUndefined();
    st = redo(st.doc, st.history);
    st = redo(st.doc, st.history);
    expect(st.doc).toEqual(afterSet);
  });

  it('navigates to any previous state without discarding entries', () => {
    const s = new Session();
    s.list([1, 2, 3]);
    const total = s.history.entries.length;
    const past = goTo(s.doc, s.history, 2);
    expect(past.history.cursor).toBe(2);
    expect(past.history.entries).toHaveLength(total);
    expect(Object.keys(past.doc.objects)).toHaveLength(2);
    const back = goTo(past.doc, past.history, total);
    expect(back.doc).toEqual(s.doc);
  });

  it('acting from a past state requires explicit branching and preserves the future', () => {
    const s = new Session();
    const a = s.node();
    s.setVal(a, 1);
    s.setVal(a, 2);
    const past = goTo(s.doc, s.history, 2);
    expect(() => commit(past.doc, past.history, { type: 'renameObject', objectId: a, name: 'x' })).toThrow(BranchRequiredError);
    const r = commit(past.doc, past.history, { type: 'renameObject', objectId: a, name: 'x' }, { allowBranch: true });
    expect(r.history.branches).toHaveLength(1);
    expect(r.history.branches[0].entries).toHaveLength(1);
    // Switch back to the stored branch — the original future is restored.
    const sw = switchToBranch(r.doc, r.history, r.history.branches[0].id);
    expect(sw.doc.objects[a].slots[0].value).toEqual({ kind: 'number', value: 2 });
    expect(sw.doc.objects[a].name).toBeUndefined();
    expect(sw.history.branches).toHaveLength(1);
  });

  it('checkpoints remember a timeline position; iterations create snapshots', () => {
    const s = new Session();
    const a = s.node();
    s.history = addCheckpoint(s.history, 'built node');
    s.setVal(a, 3);
    const cp = s.history.checkpoints[0];
    expect(cursorOfEntry(s.history, cp.entryId)).toBe(1);
    const loop = s.loop();
    s.run({ type: 'enterContext', contextId: loop });
    s.run({ type: 'completeIteration', contextId: loop });
    expect(s.history.checkpoints.filter((c) => c.kind === 'iteration')).toHaveLength(1);
  });

  it('INVARIANT: moving an object does not change semantic references or the operation count', () => {
    const s = new Session();
    const [a, b] = s.list([1, 2]);
    const head = s.variable('head');
    s.point(head, a);
    const before = algorithmData(s.doc);
    const statsBefore = computeStats(s.history.entries);
    s.run({ type: 'moveElements', moves: [{ id: a, to: { x: 500, y: 300 } }, { id: b, to: { x: 900, y: 10 } }, { id: head, to: { x: 1, y: 1 } }] });
    expect(algorithmData(s.doc)).toEqual(before);
    expect(s.doc.objects[a].position).toEqual({ x: 500, y: 300 });
    const statsAfter = computeStats(s.history.entries);
    expect(statsAfter.algorithmTotal).toBe(statsBefore.algorithmTotal);
    expect(statsAfter.uiActions).toBe(statsBefore.uiActions + 1);
    expect(s.history.entries.at(-1)?.category).toBe('visual');
  });

  it('INVARIANT: reassigning one reference does not modify other references', () => {
    const s = new Session();
    const [a, b] = [s.node(), s.node()];
    const x = s.variable('x');
    const y = s.variable('y');
    const holder = s.node();
    s.point(x, a).point(y, a).link(holder, a);
    s.point(x, b);
    expect(s.doc.variables[y].value).toEqual({ kind: 'ref', targetId: a });
    expect(s.doc.objects[holder].slots[1].value).toEqual({ kind: 'ref', targetId: a });
  });

  it('counts semantic operations by kind', () => {
    const s = new Session();
    s.list([1, 2]);
    const v = s.variable('head');
    s.run({ type: 'recordComparison', left: { kind: 'variable', variableId: v }, operator: '==', right: { kind: 'literal', value: { kind: 'null' } }, result: false });
    const st = computeStats(s.history.entries);
    expect(st.allocations).toBe(2);
    expect(st.assignments).toBe(2);
    expect(st.referenceChanges).toBe(2);
    expect(st.declarations).toBe(1);
    expect(st.comparisons).toBe(1);
  });
});

describe('diagnostics and validation are read-only', () => {
  it('INVARIANT: diagnostics do not modify state', () => {
    const s = new Session();
    const [a, , c] = s.list([1, 2, 3]);
    s.link(c, a);
    s.variable('dup');
    s.variable('dup');
    const frozen = JSON.stringify(s.doc);
    const diags = runDiagnostics(s.doc);
    expect(JSON.stringify(s.doc)).toBe(frozen);
    const codes = diags.map((d) => d.code);
    expect(codes).toContain('cycle');
    expect(codes).toContain('duplicate-variable');
    expect(codes).toContain('uninitialized-variable');
    expect(diags.find((d) => d.code === 'cycle')?.severity).toBe('info');
  });

  it('INVARIANT: unreachable objects are not automatically deleted', () => {
    const s = new Session();
    const [a, b] = s.list([1, 2]);
    s.link(a, null);
    runDiagnostics(s.doc);
    expect(s.doc.objects[b]).toBeDefined();
    expect(runDiagnostics(s.doc).some((d) => d.code === 'unreachable' && d.elementIds.includes(b))).toBe(true);
  });

  it('INVARIANT: result validation does not modify state; validates order, termination, identity', () => {
    const challenge = getChallenge('leetcode-206')!;
    const s = new Session();
    const nodes = s.list();
    const head = s.variable('head');
    s.point(head, nodes[0]);
    s.run({ type: 'captureInput', head: { kind: 'variable', variableId: head } });
    // Manual reversal performed by "the user".
    s.link(nodes[0], null).link(nodes[1], nodes[0]).link(nodes[2], nodes[1]).link(nodes[3], nodes[2]);
    s.point(head, nodes[3]);
    s.run({ type: 'markResult', source: { kind: 'operand', operand: { kind: 'variable', variableId: head } }, label: 'head' });
    const frozen = JSON.stringify(s.doc);
    const report = challenge.validate(s.doc);
    expect(JSON.stringify(s.doc)).toBe(frozen);
    expect(report.status).toBe('pass');

    // An incorrect solution (cycle) is allowed and reported, not fixed.
    s.link(nodes[0], nodes[3]);
    const bad = challenge.validate(s.doc);
    expect(bad.status).toBe('fail');
    expect(s.doc.objects[nodes[0]].slots[1].value).toEqual({ kind: 'ref', targetId: nodes[3] });
  });

  it('detects copied (non-original) nodes', () => {
    const challenge = getChallenge('leetcode-206')!;
    const s = new Session();
    const nodes = s.list([1, 2]);
    const head = s.variable('head');
    s.point(head, nodes[0]);
    s.run({ type: 'captureInput', head: { kind: 'variable', variableId: head } });
    const copies = s.list([2, 1]);
    s.run({ type: 'markResult', source: { kind: 'value', value: { kind: 'ref', targetId: copies[0] } }, label: 'copy' });
    const r = challenge.validate(s.doc);
    expect(r.items.find((i) => i.label === 'Order matches reversed input')?.status).toBe('pass');
    expect(r.items.find((i) => i.label === 'Original nodes preserved')?.status).toBe('fail');
  });
});

describe('serialization', () => {
  it('round-trips identities, references, contexts and history', () => {
    const s = new Session();
    const [a, b] = s.list([1, 2]);
    s.link(b, a);
    const loop = s.loop();
    s.run({ type: 'enterContext', contextId: loop });
    const data = { meta: { id: 'p1', name: 'Test', mode: 'sandbox' as const, createdAt: 1, updatedAt: 2 }, doc: s.doc, history: s.history };
    const json = projectToJson(data);
    const parsed = parseProjectFile(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.doc).toEqual(JSON.parse(JSON.stringify(s.doc)));
    expect(parsed.data.history.entries).toHaveLength(s.history.entries.length);
    // History still works after loading.
    const back = goTo(parsed.data.doc, parsed.data.history, 0);
    expect(Object.keys(back.doc.objects)).toHaveLength(0);
    expect(serializeProject(data).schemaVersion).toBe(1);
  });

  it('rejects invalid project files', () => {
    expect(parseProjectFile('not json').ok).toBe(false);
    expect(parseProjectFile({ format: 'datacanvas-project', schemaVersion: 1 }).ok).toBe(false);
    const s = new Session();
    s.node();
    const file = serializeProject({ meta: { id: 'p', name: 'n', mode: 'sandbox', createdAt: 0, updatedAt: 0 }, doc: s.doc, history: s.history });
    const broken = JSON.parse(JSON.stringify(file));
    broken.document.objects[Object.keys(broken.document.objects)[0]].slots[0].value = { kind: 'banana' };
    const r = parseProjectFile(broken);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/banana/);
  });
});
