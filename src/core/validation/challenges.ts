import type { DocumentState } from '../model/types';
import { walkChain } from '../model/queries';
import { formatValue, valuesEqual } from '../model/values';

export interface CheckItem {
  label: string;
  status: 'pass' | 'fail' | 'skipped';
  detail: string;
}

export interface CheckReport {
  status: 'pass' | 'fail' | 'incomplete';
  summary: string;
  items: CheckItem[];
}

export interface ChallengeExample {
  input: string;
  output: string;
}

export interface ChallengeDefinition {
  id: string;
  number: number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  /** Original concise description written for DataCanvas. Contains no solution steps. */
  description: string[];
  examples: ChallengeExample[];
  constraints: string[];
  /** Explains what the user must explicitly do so the result can be checked. */
  checkingNotes: string[];
  /** Read-only. Must never modify `doc`. */
  validate(doc: DocumentState): CheckReport;
}

const reverseLinkedList: ChallengeDefinition = {
  id: 'leetcode-206',
  number: 206,
  title: 'Reverse Linked List',
  difficulty: 'Easy',
  description: [
    'You are given the head of a singly linked list. Every node holds a value (val) and a reference to the following node (next).',
    'Rearrange the list so its nodes appear in the opposite order, and identify the head of the rearranged list.',
  ],
  examples: [
    { input: 'head = [1, 2, 3, 4, 5]', output: '[5, 4, 3, 2, 1]' },
    { input: 'head = [1, 2]', output: '[2, 1]' },
    { input: 'head = []', output: '[]' },
  ],
  constraints: ['The number of nodes is in the range [0, 5000].', '-5000 ≤ Node.val ≤ 5000', 'The last node’s next is null.'],
  checkingNotes: [
    'Build your own input list on the canvas, point a variable at its first node, and press “Capture input” before changing anything. The capture is a read-only snapshot used for checking.',
    'When you are done, identify the result explicitly (“Mark as result” on a variable or node).',
  ],
  validate(doc) {
    const items: CheckItem[] = [];
    const input = doc.capturedInput;
    if (!doc.result) {
      return {
        status: 'incomplete',
        summary: 'No result identified yet. Use “Mark as result” on the variable or node that is the head of your answer.',
        items,
      };
    }
    const rv = doc.result.value;
    if (rv.kind !== 'ref' && rv.kind !== 'null') {
      return { status: 'fail', summary: `The identified result is ${formatValue(rv, doc)}, not a node reference or null.`, items };
    }
    const walk = walkChain(doc, rv.kind === 'ref' ? rv.targetId : null, 'next');
    const terminationDetail: Record<typeof walk.end, string> = {
      null: `Reached null after ${walk.ids.length} node(s).`,
      cycle: `A cycle was found after ${walk.ids.length} node(s): the list never reaches null.`,
      uninitialized: 'A next field is uninitialized, so the list has no defined end.',
      dangling: 'A next field references a deleted object.',
      primitive: 'A next field holds a primitive instead of a reference.',
      'missing-field': 'A node in the result has no "next" field.',
      limit: 'The list is too long to check.',
    };
    items.push({ label: 'List terminates with null', status: walk.end === 'null' ? 'pass' : 'fail', detail: terminationDetail[walk.end] });

    const values = walk.ids.map((id) => {
      const o = doc.objects[id];
      const slot = o?.slots.find((s) => s.name === 'val') ?? o?.slots.find((s) => s.kind !== 'reference');
      return slot?.value ?? ({ kind: 'uninitialized' } as const);
    });
    const shown = `[${values.map((v) => formatValue(v, doc)).join(', ')}]`;

    if (!input) {
      items.push({
        label: 'Order matches reversed input',
        status: 'skipped',
        detail: `Result reads ${shown}. No input was captured, so the order cannot be compared.`,
      });
      items.push({ label: 'Original nodes preserved', status: 'skipped', detail: 'No input was captured.' });
      return {
        status: walk.end === 'null' ? 'incomplete' : 'fail',
        summary: 'Capture the input list before you start so the result can be compared against it.',
        items,
      };
    }

    const expected = [...input.values].reverse();
    const orderOk = expected.length === values.length && expected.every((v, i) => valuesEqual(v, values[i]));
    items.push({
      label: 'Order matches reversed input',
      status: orderOk ? 'pass' : 'fail',
      detail: `Expected [${expected.map((v) => formatValue(v, doc)).join(', ')}], found ${shown}.`,
    });
    const expectedIds = [...input.nodeIds].reverse();
    const idsOk = expectedIds.length === walk.ids.length && expectedIds.every((id, i) => id === walk.ids[i]);
    const reused = walk.ids.filter((id) => input.nodeIds.includes(id)).length;
    items.push({
      label: 'Original nodes preserved',
      status: idsOk ? 'pass' : 'fail',
      detail: idsOk
        ? 'The result consists of the original node objects, re-linked.'
        : `${reused} of ${walk.ids.length} result node(s) are original input nodes (expected all ${input.nodeIds.length}, in reverse order).`,
    });
    const pass = items.every((i) => i.status === 'pass');
    return { status: pass ? 'pass' : 'fail', summary: pass ? 'Correct: the list is reversed in place.' : 'Not yet correct — see the details below.', items };
  },
};

const registry = new Map<string, ChallengeDefinition>([[reverseLinkedList.id, reverseLinkedList]]);

export function getChallenge(id: string): ChallengeDefinition | undefined {
  return registry.get(id);
}

export function listChallenges(): ChallengeDefinition[] {
  return [...registry.values()];
}
