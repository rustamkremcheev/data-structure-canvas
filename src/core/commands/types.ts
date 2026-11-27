import type { StructureOptions } from '../model/structures';
import type {
  Annotation,
  Condition,
  ComparisonOperator,
  Id,
  LoopPhase,
  LoopType,
  MethodParameter,
  Operand,
  PastelColor,
  Point,
  RefSource,
  SlotKind,
  StructureKind,
  Value,
  HeapObject,
  Variable,
} from '../model/types';

/** Where an assigned value comes from: a literal the user typed, or an operand read at execution time. */
export type ValueSource = { kind: 'value'; value: Value } | { kind: 'operand'; operand: Operand };

export type NewContextSpec =
  | { kind: 'loop'; name: string; loopType: LoopType; parentId?: Id }
  | { kind: 'condition'; name: string; parentId?: Id }
  | { kind: 'method'; name: string; methodName: string; parameters: MethodParameter[]; returnType?: string; parentId?: Id };

export interface ContextPatch {
  name?: string;
  loopType?: LoopType;
  phases?: LoopPhase[];
  condition?: Condition | null;
  methodName?: string;
  parameters?: MethodParameter[];
  returnType?: string;
  parentId?: Id | null;
}

export type AnnotationDraft =
  | Omit<Extract<Annotation, { kind: 'text' }>, 'id'>
  | Omit<Extract<Annotation, { kind: 'drawing' }>, 'id'>
  | Omit<Extract<Annotation, { kind: 'group' }>, 'id'>
  | Omit<Extract<Annotation, { kind: 'nullMarker' }>, 'id'>;

export interface ClipboardPayload {
  objects: HeapObject[];
  variables: Variable[];
  annotations: Annotation[];
}

/**
 * Every state mutation in DataCanvas is one of these explicit commands.
 * Mapping to the conceptual command names:
 *   createObject → CreateObjectCommand, declareVariable → DeclareVariableCommand,
 *   initializeVariable → InitializeVariableCommand, assignValue → AssignValueCommand,
 *   setReference → SetReferenceCommand, enterContext → EnterContextCommand,
 *   changePhase → ChangePhaseCommand, completeIteration → CompleteIterationCommand,
 *   exitContext → ExitContextCommand, createStackFrame → CreateStackFrameCommand,
 *   setReturnValue → SetReturnValueCommand.
 */
export type Command =
  // Heap
  | { type: 'createObject'; kind: StructureKind; position: Point; options?: StructureOptions; name?: string; color?: PastelColor }
  | { type: 'renameObject'; objectId: Id; name: string }
  | { type: 'setObjectType'; objectId: Id; typeName: string }
  | { type: 'addSlot'; objectId: Id; name?: string; slotKind: SlotKind; position?: 'start' | 'end' }
  | { type: 'removeSlot'; objectId: Id; slotId: Id }
  | { type: 'renameSlot'; objectId: Id; slotId: Id; name: string }
  | { type: 'setSlotKey'; objectId: Id; slotId: Id; key: Value }
  // Variables
  | { type: 'declareVariable'; name: string; declaredType?: string; scopeId?: Id; position: Point; initialValue?: Value }
  | { type: 'initializeVariable'; variableId: Id; source: ValueSource }
  | { type: 'renameVariable'; variableId: Id; name: string }
  | { type: 'setVariableType'; variableId: Id; declaredType: string }
  // Assignment & references
  | { type: 'assignValue'; target: RefSource; source: ValueSource }
  | { type: 'setReference'; source: RefSource; target: { kind: 'object'; objectId: Id } | { kind: 'null'; markerId?: Id } | { kind: 'uninitialized' } }
  // Execution contexts
  | { type: 'createContext'; spec: NewContextSpec; position: Point }
  | { type: 'updateContext'; contextId: Id; patch: ContextPatch }
  | { type: 'enterContext'; contextId: Id }
  | { type: 'exitContext'; contextId: Id }
  | { type: 'changePhase'; contextId: Id; phase: LoopPhase }
  | { type: 'recordConditionResult'; contextId: Id; result: boolean }
  | { type: 'chooseBranch'; contextId: Id; branch: 'then' | 'else' }
  | { type: 'completeIteration'; contextId: Id }
  | { type: 'breakLoop'; contextId: Id }
  | { type: 'continueLoop'; contextId: Id }
  | { type: 'recordComparison'; left: Operand; operator: ComparisonOperator; right: Operand; result: boolean }
  // Methods & stack frames
  | { type: 'createStackFrame'; name: string; methodId?: Id; position: Point; declareParameters?: boolean }
  | { type: 'setReturnValue'; frameId: Id; source: ValueSource }
  | { type: 'exitFrame'; frameId: Id }
  // Results & challenge metadata
  | { type: 'markResult'; source: ValueSource; label: string }
  | { type: 'clearResult' }
  | { type: 'captureInput'; head: Operand; fieldName?: string }
  // Visual-only
  | { type: 'moveElements'; moves: { id: Id; to: Point }[] }
  | { type: 'setColor'; ids: Id[]; color: PastelColor }
  | { type: 'setIndexBinding'; variableId: Id; arrayId: Id | null }
  | { type: 'createAnnotation'; annotation: AnnotationDraft }
  | { type: 'updateAnnotation'; annotationId: Id; patch: { text?: string; label?: string; memberIds?: Id[] } }
  // Generic
  | { type: 'deleteElements'; ids: Id[] }
  | { type: 'paste'; payload: ClipboardPayload; offset: Point }
  | { type: 'batch'; label: string; commands: Command[] };

export type CommandType = Command['type'];

/** Fine-grained semantic classification used for statistics. */
export type OperationKind =
  | 'allocation'
  | 'declaration'
  | 'initialization'
  | 'assignment'
  | 'reference-change'
  | 'comparison'
  | 'condition-check'
  | 'iteration'
  | 'method-call'
  | 'return'
  | 'context-enter'
  | 'context-exit'
  | 'phase-change'
  | 'break'
  | 'continue'
  | 'structure-edit'
  | 'definition'
  | 'deletion'
  | 'result'
  | 'visual'
  | 'annotation';

/** Coarse category. Only `semantic` and `execution` operations are algorithm operations. */
export type OperationCategory = 'semantic' | 'execution' | 'visual' | 'annotation';

export function categoryOf(kind: OperationKind): OperationCategory {
  switch (kind) {
    case 'visual':
      return 'visual';
    case 'annotation':
      return 'annotation';
    case 'context-enter':
    case 'context-exit':
    case 'phase-change':
    case 'break':
    case 'continue':
    case 'iteration':
    case 'condition-check':
    case 'method-call':
    case 'return':
    case 'definition':
      return 'execution';
    default:
      return 'semantic';
  }
}

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}
