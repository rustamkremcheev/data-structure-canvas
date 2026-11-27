# DataCanvas architecture

## Guiding rule

The **semantic document** is the single source of truth. Everything the user sees on the canvas is derived from it. Every change to it is an explicit, user-initiated **command**. No code path changes algorithm data on its own: there is no scheduler, auto-step, propagation or garbage collection.

```
 user gesture ──► Command ──► applyCommand (Immer, patches) ──► History.commit ──► DocumentState
                                                                      │
 React Flow nodes/edges ◄── buildNodes / buildEdges ◄─────────────────┘
```

## Layers

| Layer | Path | Depends on |
| --- | --- | --- |
| Semantic core | `src/core` | Immer only (no React, DOM or storage) |
| State stores | `src/stores` | core, Zustand |
| Persistence | `src/persistence` | core serialization, Dexie |
| Features (UI) | `src/features/*` | stores, core, React, @xyflow/react |
| App shell | `src/app`, `src/components`, `src/hooks` | everything above |

The core is fully unit-tested without a browser (`tests/unit`).

### `src/core/model`

- `types.ts` defines `DocumentState` and its parts, all as discriminated unions:
  - `HeapObject` (with `slots`), `Variable`, `StackFrame`, `ExecutionContext` (loop, condition, method), `Annotation`, `Operand` and `Value`.
  - `Value` is `number | string | boolean | null | uninitialized | reference(objectId)`. Null and uninitialized are distinct kinds.
- `values.ts` holds value constructors, equality, formatting and literal parsing (`10`, `"s"`, `true`, `null`, `?`, `@n`).
- `structures.ts` is the **structure registry**. Each kind (`node`, `object`, `array`, `matrix`, `container`) registers how to create its initial slots. Fields, array cells, matrix cells and container entries are all `Slot`s with a kind of `primitive`, `reference` or `any`. Everything that reads or writes memory works on slots and does not special-case structures.
- `queries.ts` provides pure read helpers: slot lookup, scope resolution, reachability, reference enumeration, chain walking and context ancestry.

### `src/core/commands`

- `types.ts` defines the `Command` union. Examples are `createObject`, `declareVariable`, `assignValue`, `setReference`, `enterContext`, `changePhase`, `recordConditionResult`, `completeIteration`, `createStackFrame`, `exitFrame`, `markResult`, `moveElements` and `paste`. It also defines `OperationKind` and `categoryOf`:
  - Each applied command reports the **operation kinds** it counts as, such as `allocation`, `assignment`, `comparison` or `phase-change`.
  - `categoryOf` maps those kinds to a **category**: `semantic`, `execution`, `visual` or `annotation`.
- `apply.ts` contains `applyCommand(doc, command)`, which runs the command with Immer `produceWithPatches`. It returns the new document, forward and inverse patches, and a human-readable description. Invalid commands throw `CommandError` and leave the document untouched.

Important behaviors:

- `changePhase` only changes `phase`. It never evaluates conditions or touches memory.
- `recordConditionResult` stores the user's decision. `verifyCondition` (in `execution/conditions.ts`) is a separate read-only function and is never called by the engine.
- `deleteElements` leaves references dangling, and `exitFrame` doesn't propagate return values.

### `src/core/execution`

- `loops.ts`: phase sets per loop type and `conventionalNextPhase` (used for UI hints only).
- `conditions.ts`: operators, operand reading and read-only verification.
- `stats.ts`: operation counters derived from the history. They separate algorithm operations, execution control and UI actions.

### `src/core/history`

The history is a list of `OperationRecord`s. Each record has `id`, `type`, `timestamp`, `category`, `ops`, `contextId`, `iteration`, `description`, and `patches`/`inversePatches`. It also tracks a `cursor`.

- **undo/redo/goTo:** move the cursor by applying patches.
- **commit:** when the cursor is in the past, it throws `BranchRequiredError`. The UI asks the user, then commits with `allowBranch`. This moves the abandoned future into a `HistoryBranch`, and `switchToBranch` restores it exactly. Future history is never silently destroyed.
- **checkpoints:** cursor bookmarks, either manual or added on `completeIteration` (iteration snapshots).

### `src/core/validation`

- `diagnostics.ts`: optional, read-only findings with severities. They cover dangling references, duplicate names, out-of-scope variables, uninitialized values, null references, cycles, unreachable objects and set duplicates.
- `challenges.ts`: the challenge registry (`ChallengeDefinition`), currently LeetCode 206. A validator reads `doc.result` and `doc.capturedInput` and returns a report; it never mutates.

### `src/core/serialization`

`project.ts` covers JSON export and import. Files carry `format: "datacanvas-project"` and `schemaVersion`, and `parseProjectFile` validates them structurally before anything is loaded.

## UI layer

- `stores/projectStore.ts` (Zustand) holds the document, history and project meta.
  - `dispatch(command)` is the only way the UI mutates the document. It catches `CommandError` and shows a toast. On `BranchRequiredError` it stores a `pendingBranch` and opens the branch confirmation.
- `stores/uiStore.ts` holds view state only: active tool, selection, panels, grid and snap, pending reference source, clipboard, toasts, context menu.
- `features/canvas/Canvas.tsx` derives React Flow nodes and edges (`buildNodes.ts`, `buildEdges.ts`) from the document.
  - Dragging a node is local until drag stop, which commits a single `moveElements` command (category `visual`).
  - Reference drags are resolved in `onConnectEnd`: an object sets the reference, a variable copies its value, a null marker assigns null.
- `features/execution`, `features/loops`: the manual controller, phase dial, condition builder and execution panel. Each button dispatches exactly one command.
- `features/timeline`: history navigation, branches, checkpoints and an operation detail view.
- `persistence/db.ts` (Dexie) stores projects in IndexedDB. `hooks/useAutosave.ts` debounces saves (800 ms) and restores the last project on start.

## Extending

- **New structure:** add a `StructureKind`, call `registerStructure` with its slot factory, and add a body renderer in `features/structures` if it needs a custom layout. Commands, references, history, diagnostics and serialization work unchanged because they operate on slots.
- **New command:**
  1. Add a variant to `Command`.
  2. Implement it in `apply.ts`, returning a description and its operation kinds.
  3. Add a new `OperationKind` to `categoryOf` if needed.
  4. Add unit tests.

  The command automatically gets undo/redo, timeline display and stats.
- **New challenge:** add a `ChallengeDefinition` (statement, examples, constraints, validator) to `challenges.ts`. The validator must be a pure function of the document.

## Testing

- `tests/unit`: core behavior and the mandatory invariants. These cover:
  - nothing executes automatically;
  - phase changes don't touch data;
  - diagnostics and validation are read-only;
  - moving elements is not semantic;
  - unreachable objects persist;
  - branching keeps the future.
- `tests/e2e`: Playwright runs the full acceptance scenario (manual reversal of a 4-node list, timeline navigation, save and reopen), an intentionally wrong solution, and challenge mode.
