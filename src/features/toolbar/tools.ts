import type { ComponentType } from 'react';
import { Eraser, Hand, MousePointer2, Pencil, Type } from 'lucide-react';
import type { ToolId } from '../../stores/uiStore';
import {
  ArrayIcon,
  ConditionIcon,
  ContainerIcon,
  FrameIcon,
  LoopIcon,
  MatrixIcon,
  MethodIcon,
  NodeIcon,
  NullIcon,
  ObjectIcon,
  ReferenceIcon,
  VariableIcon,
} from './icons';

export interface ToolDef {
  id: ToolId;
  label: string;
  shortcut: string;
  hint: string;
  icon: ComponentType<{ size?: number }>;
  group: 'navigate' | 'memory' | 'execution' | 'annotate';
}

export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', shortcut: 'V', hint: 'Select, multi-select (Shift) and move elements', icon: MousePointer2, group: 'navigate' },
  { id: 'hand', label: 'Hand / Pan', shortcut: 'H', hint: 'Drag to pan the canvas', icon: Hand, group: 'navigate' },
  { id: 'object', label: 'Create Object', shortcut: 'O', hint: 'Click the canvas to create an object with custom fields', icon: ObjectIcon, group: 'memory' },
  { id: 'node', label: 'Create Node', shortcut: 'N', hint: 'Click the canvas to allocate a ListNode (val, next)', icon: NodeIcon, group: 'memory' },
  { id: 'variable', label: 'Create Variable', shortcut: 'X', hint: 'Click the canvas to declare a variable', icon: VariableIcon, group: 'memory' },
  { id: 'reference', label: 'Create Reference', shortcut: 'R', hint: 'Click a variable/field, then click its target', icon: ReferenceIcon, group: 'memory' },
  { id: 'null', label: 'Create Null', shortcut: '0', hint: 'Place a null marker; drop references on it to assign null', icon: NullIcon, group: 'memory' },
  { id: 'array', label: 'Create Array', shortcut: 'A', hint: 'Click the canvas to create an array', icon: ArrayIcon, group: 'memory' },
  { id: 'matrix', label: 'Create Matrix', shortcut: 'M', hint: 'Click the canvas to create a 2D matrix', icon: MatrixIcon, group: 'memory' },
  { id: 'container', label: 'Create Container', shortcut: 'B', hint: 'List, stack, queue, deque, set or map', icon: ContainerIcon, group: 'memory' },
  { id: 'loop', label: 'Create Loop', shortcut: 'L', hint: 'Create a loop execution context', icon: LoopIcon, group: 'execution' },
  { id: 'condition', label: 'Create Condition', shortcut: 'C', hint: 'Create an if/else execution context', icon: ConditionIcon, group: 'execution' },
  { id: 'method', label: 'Create Method', shortcut: 'F', hint: 'Define a method signature', icon: MethodIcon, group: 'execution' },
  { id: 'frame', label: 'Create Stack Frame', shortcut: 'S', hint: 'Push a stack frame (call a method manually)', icon: FrameIcon, group: 'execution' },
  { id: 'text', label: 'Text', shortcut: 'T', hint: 'Click to add a text annotation', icon: Type, group: 'annotate' },
  { id: 'pencil', label: 'Pencil', shortcut: 'P', hint: 'Freehand annotation', icon: Pencil, group: 'annotate' },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', hint: 'Click or drag over annotations to erase them (never erases data)', icon: Eraser, group: 'annotate' },
];

export const TOOL_BY_SHORTCUT = new Map(TOOLS.map((t) => [t.shortcut.toLowerCase(), t.id]));
