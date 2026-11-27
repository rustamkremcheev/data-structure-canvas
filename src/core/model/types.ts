/**
 * Semantic domain model for DataCanvas.
 *
 * Everything in `DocumentState` is the authoritative algorithm state. The canvas
 * (React Flow) only renders it. Positions and appearance are carried on entities
 * as visual metadata, but no command that changes them touches semantic fields.
 */

export type Id = string;

export interface Point {
  x: number;
  y: number;
}

/** A value held by a variable, an object field, an array cell or a container slot. */
export type Value =
  | { kind: 'uninitialized' }
  | { kind: 'null' }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'ref'; targetId: Id };

export type ValueKind = Value['kind'];

/** What a slot is declared to hold. `any` slots accept primitives and references. */
export type SlotKind = 'primitive' | 'reference' | 'any';

/** A named storage location inside a heap object (field, array cell, matrix cell, container entry). */
export interface Slot {
  id: Id;
  name: string;
  kind: SlotKind;
  value: Value;
  /** Optional key for map-like containers. Purely user-entered; never derived. */
  key?: Value;
}

export type PastelColor = 'slate' | 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'teal';

export interface Appearance {
  color: PastelColor;
}

/** Registered heap structure kinds. See `structures.ts` for the registry. */
export type StructureKind = 'object' | 'node' | 'array' | 'matrix' | 'container';

export type ContainerFlavor = 'list' | 'stack' | 'queue' | 'deque' | 'set' | 'map';

export interface HeapObject {
  id: Id;
  /** Monotonic, human-readable identity number (displayed as `@serial`). */
  serial: number;
  kind: StructureKind;
  /** User-facing type name, e.g. `ListNode`, `Object`, `int[]`. */
  typeName: string;
  name?: string;
  slots: Slot[];
  /** Matrix dimensions. */
  shape?: { rows: number; cols: number };
  /** Container behaviour label (purely descriptive — the app never enforces LIFO/FIFO). */
  flavor?: ContainerFlavor;
  position: Point;
  appearance: Appearance;
}

export const GLOBAL_SCOPE_ID = 'global';

export interface Variable {
  id: Id;
  name: string;
  declaredType?: string;
  value: Value;
  /** `global` or the id of a stack frame. */
  scopeId: Id;
  position: Point;
  /** Visual-only: render this (numeric) variable as an index marker into an array. */
  indexInto?: Id;
}

export type FrameStatus = 'active' | 'returned';

export interface StackFrame {
  id: Id;
  name: string;
  methodId?: Id;
  /** Frame that was on top of the call stack when this frame was created. */
  callerFrameId?: Id;
  status: FrameStatus;
  /** `undefined` = no return value set yet. */
  returnValue?: Value;
  position: Point;
}

export type LoopType = 'while' | 'for' | 'do-while' | 'custom';
export type LoopPhase = 'init' | 'condition' | 'body' | 'update' | 'exit';

export type ComparisonOperator = '==' | '!=' | '<' | '<=' | '>' | '>=';

export type Operand =
  | { kind: 'variable'; variableId: Id }
  /** `variable.field` — follows the variable's current reference at read time. */
  | { kind: 'variableField'; variableId: Id; fieldName: string }
  | { kind: 'objectSlot'; objectId: Id; slotId: Id }
  /** The return value a stack frame was given. Reading it never assigns it anywhere. */
  | { kind: 'returnValue'; frameId: Id }
  | { kind: 'literal'; value: Value };

export interface Condition {
  left: Operand;
  operator: ComparisonOperator;
  right: Operand;
}

export type ContextStatus = 'idle' | 'active' | 'exited';

interface ContextBase {
  id: Id;
  name: string;
  /** Lexical parent chosen when the context was created (nesting). */
  parentId?: Id;
  status: ContextStatus;
  position: Point;
}

export interface LoopContext extends ContextBase {
  kind: 'loop';
  loopType: LoopType;
  /** Phase order shown on the mechanical selector. */
  phases: LoopPhase[];
  phase: LoopPhase | null;
  /** Execution metadata only — never an algorithm variable. */
  iterationsCompleted: number;
  condition?: Condition;
  /** The truth value the user chose the last time the condition phase was checked. */
  lastConditionResult: boolean | null;
}

export interface ConditionContext extends ContextBase {
  kind: 'condition';
  condition?: Condition;
  /** User-chosen result and the branch they decided to enter. */
  result: boolean | null;
  branch: 'then' | 'else' | null;
}

export interface MethodParameter {
  name: string;
  type?: string;
}

export interface MethodContext extends ContextBase {
  kind: 'method';
  methodName: string;
  parameters: MethodParameter[];
  returnType?: string;
}

export type ExecutionContext = LoopContext | ConditionContext | MethodContext;
export type ContextKind = ExecutionContext['kind'];

export type Annotation =
  | { id: Id; kind: 'text'; position: Point; text: string; color: PastelColor }
  | { id: Id; kind: 'drawing'; position: Point; points: Point[]; color: PastelColor; width: number; height: number }
  | { id: Id; kind: 'group'; position: Point; label: string; memberIds: Id[]; color: PastelColor }
  | { id: Id; kind: 'nullMarker'; position: Point };

/** The result the user explicitly identified (e.g. "the reversed list starts here"). */
export interface MarkedResult {
  value: Value;
  /** Where the user took it from, for display. */
  sourceLabel: string;
}

/** Read-only capture of a challenge input, taken by an explicit user action. */
export interface CapturedInput {
  headId: Id | null;
  nodeIds: Id[];
  values: Value[];
  terminated: boolean;
}

export interface DocumentState {
  /** Id generator, part of the state so undo/redo is deterministic. */
  seq: number;
  /** Object identity counter (`@1`, `@2`, …). */
  objectSerial: number;
  objects: Record<Id, HeapObject>;
  variables: Record<Id, Variable>;
  frames: Record<Id, StackFrame>;
  /** Bottom → top. The global scope is implicitly below the first frame. */
  callStack: Id[];
  contexts: Record<Id, ExecutionContext>;
  /** Entered contexts, outermost → innermost. The last one is active. */
  activeContextPath: Id[];
  annotations: Record<Id, Annotation>;
  /** Visual-only memory of which null marker a null reference was dropped on. */
  nullLinks: Record<string, Id>;
  result: MarkedResult | null;
  capturedInput: CapturedInput | null;
}

export type ElementType = 'object' | 'variable' | 'frame' | 'context' | 'annotation';

export function createEmptyDocument(): DocumentState {
  return {
    seq: 0,
    objectSerial: 0,
    objects: {},
    variables: {},
    frames: {},
    callStack: [],
    contexts: {},
    activeContextPath: [],
    annotations: {},
    nullLinks: {},
    result: null,
    capturedInput: null,
  };
}

/** Reference source: either a variable or a slot of a heap object. */
export type RefSource = { kind: 'variable'; variableId: Id } | { kind: 'slot'; objectId: Id; slotId: Id };

export function refSourceKey(source: RefSource): string {
  return source.kind === 'variable' ? `v:${source.variableId}` : `s:${source.objectId}:${source.slotId}`;
}
