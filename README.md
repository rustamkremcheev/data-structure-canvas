# DataCanvas

**Don't watch algorithms. Think through them.**

DataCanvas is a browser-based visual environment for *manually* working through data-structure algorithms. You build memory (objects, nodes, arrays, variables, references) on a canvas and you drive every step yourself: you declare and initialize variables, move references, evaluate loop conditions, decide which branch is taken, enter and leave loops and method frames.

The application never does any of that for you. There is no "run", no auto-step, no auto-reverse and no auto-correction. Diagnostics and result checks are optional, read-only and never change state.

It runs entirely in the browser. There is no backend; projects are stored in IndexedDB and can be exported as JSON.

## Requirements

- Node.js 20.19+ or 22.12+ (developed with Node 22) and npm 10+
- A Chromium-based browser, Firefox or Safari for running the app
- For end-to-end tests: the Playwright Chromium browser (installed with the command below)

## Install

```bash
npm install
```

The repository ships an `.npmrc` with `legacy-peer-deps=true`. It works around an npm resolver crash with Vitest 4's optional peer dependencies. Keep it in place.

To run the end-to-end tests, install the browser once:

```bash
npx playwright install chromium
# on a fresh Linux machine you may also need: npx playwright install-deps chromium
```

## Run

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload at <http://localhost:5173> |
| `npm run build` | Typechecks (`tsc -b`) and builds the production bundle into `dist/` |
| `npm run preview` | Serves the production build at <http://localhost:4173> (run `npm run build` first) |
| `npm run typecheck` | TypeScript check only |
| `npm test` | Unit tests (Vitest) for the semantic core, execution engine, history, diagnostics and serialization |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:e2e` | Playwright end-to-end tests. Builds the app and starts `vite preview` automatically |

To run the E2E tests against an already running dev server instead:

```bash
E2E_BASE_URL=http://localhost:5173 npx playwright test
```

## Using the canvas

The layout has five parts:

- **Top bar:** project name, mode (Sandbox or Challenge), save status, undo/redo, grid and snap toggles, panel toggles, save, export/import and projects.
- **Left toolbar:** creation and annotation tools.
- **Canvas:** the main working area.
- **Right panel:** tabs for Properties, Execution, Stats, Diagnostics and Challenge.
- **Bottom:** a compact manual execution controller and a collapsible timeline.

### Navigation and selection

- **Pan:** use the Hand tool (`H`), or drag with the middle or right mouse button. **Zoom:** mouse wheel or the on-canvas controls. **Fit view:** `Shift+1`.
- **Select:** click an element. Shift-click adds to the selection, and dragging on empty canvas draws a selection box.
- **Move:** drag an element. Moving is a visual action only and never changes logical state. Snap to grid toggles with `Shift+G`; the grid itself with `G`.
- **Context menus:** right-click on elements, fields, edges, the canvas or a selection.
- **Editing:** copy `Ctrl/Cmd+C`, paste `Ctrl/Cmd+V` (pasted objects get new identities), duplicate `Ctrl/Cmd+D`, delete `Delete`, group `Ctrl/Cmd+G`, select all `Ctrl/Cmd+A`.
- **History:** undo `Ctrl/Cmd+Z`, redo `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y`.
- **Projects:** checkpoint `K`, save `Ctrl/Cmd+S`, open projects `Ctrl/Cmd+O`, help `?`.

Deleting an object that is still referenced asks for confirmation and leaves the references dangling. Diagnostics will then report them; nothing is fixed silently.

### Tools

| Tool | Key | Use |
| --- | --- | --- |
| Select | `V` | Select, multi-select and move |
| Hand | `H` | Pan |
| Object | `O` | Object with custom primitive and reference fields |
| Node | `N` | `ListNode` with `val` and `next` |
| Variable | `X` | Declare a variable (global or in the active stack frame), optionally with an initial value |
| Reference | `R` | Click a variable or reference field, then click the target |
| Null | `0` | Null marker; drop a reference on it to assign `null` |
| Array | `A` | Fixed-length array; variables can be shown as index markers |
| Matrix | `M` | 2D grid |
| Container | `B` | List, stack, queue, deque, set or map |
| Loop | `L` | Loop execution context (while, for, do-while, custom) |
| Condition | `C` | if/else execution context |
| Method | `F` | Method signature; calling it pushes a stack frame |
| Stack Frame | `S` | Push a frame manually |
| Text / Pencil / Eraser | `T` / `P` / `E` | Annotations. The eraser only removes annotations, never data |

### Values

Double-click any value to edit it inline. Accepted input:

| Input | Meaning |
| --- | --- |
| `10` | number |
| `"text"` or `text` | string |
| `true` / `false` | boolean |
| `null` | null |
| `?` | uninitialized (distinct from null) |
| `@3` | reference to the object displayed as `@3` |

Every object has a stable identity shown as `@n`. References point to identities, not to positions on the canvas. Cycles, self-references and shared targets are allowed. Unreachable objects are never deleted automatically.

## Building a linked list (example)

1. Press `N` and click four times on the canvas. This creates four `ListNode` objects (`@1` to `@4`) with uninitialized fields. Press `Esc` to go back to Select.
2. Double-click each `val` and type `10`, `20`, `30` and `40`.
3. Drag from the round handle on the right of `@1.next` onto node `@2`. Do the same from `@2` to `@3` and from `@3` to `@4`.
4. Double-click `@4.next` and type `null`.
5. Press `X`, click the canvas and declare `head`. Drag from its handle onto `@1`.
6. Declare `prev`, `current` and `next` the same way. Then:
   - set `prev` to `null`;
   - drag `current`'s handle onto the `head` variable. Dropping on a variable copies its value, so `current = head`.

Reference drop targets:

- **An object:** the reference now points to it.
- **A variable:** its value is copied.
- **A null marker:** the reference becomes `null`.

To assign from a field, such as `next = current.next`, right-click the variable, choose **next = … (copy from)** and pick `current.next`.

## The manual loop controller

1. Press `L`, click the canvas and name the loop (for example `reverse`). Choose a loop type:

   | Type | Phases |
   | --- | --- |
   | while | Init, Condition, Body, Exit |
   | for | Init, Condition, Body, Update, Exit |
   | do-while | Init, Body, Condition, Exit |
   | custom | All five |

2. Select the loop. In **Properties**, build its condition from a left operand, an operator and a right operand, for example `current != null`, and save it.
3. In the **Manual execution** controller at the bottom left, click **Enter loop**. Each context has its own Enter and Exit buttons. The breadcrumb shows the active context, including nested loops, conditions and frames.
4. Turn the phase dial yourself by clicking a phase. Changing the phase never changes your data.
5. In the **Condition** phase, read the condition and decide **True** or **False** yourself. **Verify** is optional: it only tells you what the condition currently evaluates to and never chooses for you.
6. In the **Body**, perform the steps by hand on the canvas. For the list reversal:
   - `next = current.next`
   - `current.next = prev`
   - `prev = current`
   - `current = next`
7. Click **Complete iteration** to count the iteration. This records an iteration checkpoint on the timeline. You can also use **Continue** or **Break**.
8. When you decide the condition is false, go to **Exit** and click **Exit loop**.
9. Mark the result (right-click `prev` and choose **Mark as result**). Optionally, run **Diagnostics**.

### History and timeline

Every action is an operation on the timeline. Each operation records its type, time, context, iteration and the exact state changes. Purely visual actions, such as moving elements, are hidden by default; use "show UI actions" to see them.

- **Inspecting the past:** click any card or use the slider to view a past state.
- **Acting from a past state:** you'll be asked first. The later operations are kept as a separate branch, which you can switch back to from the timeline. Future history is never silently discarded.
- **Checkpoints:** add a named checkpoint with `K`.

### Challenge mode

Open **Projects** and choose **New challenge: Reverse Linked List** (LeetCode 206). The Challenge tab shows the problem statement, examples and constraints; it does not show a solution. The workflow:

1. Build the input list.
2. Under **Capture input**, pick the variable pointing at the head and click **Capture**. This records the node order and identities.
3. Reverse the list manually.
4. Mark the result.
5. Press **Check Result**. This read-only check verifies:
   - the order is reversed;
   - the list terminates;
   - the original nodes were reused, not recreated.

### Projects

Projects autosave to IndexedDB in your browser. The Projects dialog supports:

- creating, opening, renaming, duplicating and deleting projects;
- exporting and importing JSON files (`datacanvas-project`, schema version 1). Imports are validated before loading.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) explains the semantic core, commands, history, React layer and how to add structures or challenges.
- [ROADMAP.md](./ROADMAP.md) lists planned work.
