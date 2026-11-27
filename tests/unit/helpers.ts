import { commit, createHistory, type HistoryState } from '../../src/core/history/history';
import type { Command } from '../../src/core/commands/types';
import { createEmptyDocument, type DocumentState, type Id } from '../../src/core/model/types';

/** Small driver that applies commands the same way the UI store does. */
export class Session {
  doc: DocumentState = createEmptyDocument();
  history: HistoryState = createHistory();

  run(command: Command): this {
    const r = commit(this.doc, this.history, command, { allowBranch: true });
    this.doc = r.doc;
    this.history = r.history;
    return this;
  }

  node(x = 0): Id {
    this.run({ type: 'createObject', kind: 'node', position: { x, y: 0 } });
    return newest(this.doc.objects);
  }

  variable(name: string, scopeId?: Id): Id {
    this.run({ type: 'declareVariable', name, position: { x: 0, y: 0 }, ...(scopeId ? { scopeId } : {}) });
    return newest(this.doc.variables);
  }

  slotId(objectId: Id, name: string): Id {
    const s = this.doc.objects[objectId].slots.find((x) => x.name === name);
    if (!s) throw new Error(`no slot ${name}`);
    return s.id;
  }

  setVal(objectId: Id, value: number): this {
    return this.run({
      type: 'assignValue',
      target: { kind: 'slot', objectId, slotId: this.slotId(objectId, 'val') },
      source: { kind: 'value', value: { kind: 'number', value } },
    });
  }

  link(fromId: Id, toId: Id | null): this {
    return this.run({
      type: 'setReference',
      source: { kind: 'slot', objectId: fromId, slotId: this.slotId(fromId, 'next') },
      target: toId ? { kind: 'object', objectId: toId } : { kind: 'null' },
    });
  }

  point(variableId: Id, toId: Id | null): this {
    return this.run({
      type: 'setReference',
      source: { kind: 'variable', variableId },
      target: toId ? { kind: 'object', objectId: toId } : { kind: 'null' },
    });
  }

  loop(name = 'loop', parentId?: Id): Id {
    this.run({ type: 'createContext', spec: { kind: 'loop', name, loopType: 'while', ...(parentId ? { parentId } : {}) }, position: { x: 0, y: 0 } });
    return newest(this.doc.contexts);
  }

  /** Builds 10 → 20 → 30 → 40 → null manually and returns node ids. */
  list(values = [10, 20, 30, 40]): Id[] {
    const ids = values.map((_, i) => this.node(i * 200));
    values.forEach((v, i) => this.setVal(ids[i], v));
    ids.forEach((id, i) => this.link(id, ids[i + 1] ?? null));
    return ids;
  }
}

export function newest<T extends { id: Id }>(rec: Record<Id, T>): Id {
  const ids = Object.keys(rec);
  return ids.sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))[ids.length - 1];
}

/** The algorithm-data portion of a document (objects' slots, variables' values), positions removed. */
export function algorithmData(doc: DocumentState) {
  return {
    objects: Object.fromEntries(Object.values(doc.objects).map((o) => [o.id, o.slots.map((s) => ({ name: s.name, value: s.value }))])),
    variables: Object.fromEntries(Object.values(doc.variables).map((v) => [v.id, { name: v.name, value: v.value, scopeId: v.scopeId }])),
    frames: Object.fromEntries(Object.values(doc.frames).map((f) => [f.id, f.returnValue ?? null])),
    result: doc.result,
  };
}
