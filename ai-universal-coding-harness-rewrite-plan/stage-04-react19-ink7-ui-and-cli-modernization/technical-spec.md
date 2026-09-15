# Technical Specification — Stage 04

## React configuration

Use the modern React JSX runtime:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
  },
}
```

Ensure `src/**/*.tsx` is compiled.

## State model

Create a typed `UiState`.

Use discriminated event unions where reasonable.

Avoid giant optional-object bags.

Example direction:

```ts
type PhaseStatus = 'pending' | 'active' | 'completed' | 'failed';

interface UiState {
  runStatus: RunUiStatus;
  phases: Record<StagePhase, PhaseStatus>;
  stage: StageDisplayState | null;
  messages: readonly UiMessage[];
  tools: ReadonlyMap<string, UiTool>;
  ...
}
```

Do not over-engineer immutable libraries; plain React reducer state is enough.

## Reducer

Reducer must be pure.

File IO belongs outside the reducer.

Tests should feed semantic events and assert resulting state.

## Event file

Move JSONL reading/following into a dedicated module.

Test:

- missing file;
- partial last line;
- invalid JSON line;
- bounded replay;
- append/follow behavior.

## Focus stream

Do not load arbitrarily large files into memory on each render.

Keep bounded UI state and read only the viewport/tail necessary where practical.

## Rendering

All panels get explicit props.

No component accepts `state: any`.

Use selectors to derive:

- current task;
- progress percentage;
- active/recent tools;
- visible focus lines.

## Ink tests

Use `ink-testing-library` for:

- main normal layout;
- compact layout;
- minimal layout;
- focus panel;
- todos;
- changed files;
- logs;
- quality failure;
- reviewer result;
- terminal-width truncation;
- keyboard panel switching where supported.

Snapshot tests may supplement but must not be the only assertion.

## CLI output

Review non-Ink CLI output for:

- consistent wording;
- errors to stderr;
- non-zero exit status on actual failures;
- machine-safe `--json` option only if already justified or added with tests.

Do not turn this stage into a CLI redesign.

## Documentation and docblock standards

### File-level header documentation

Every newly created UI component, hook, reducer, selector, or utility file—and any existing file edited during this stage—must include a top-of-file JSDoc/TSDoc header:

```tsx
/**
 * @fileoverview <Description of UI component/module purpose, rendering bounds, and role in the presentation layer>
 */
```

When an existing file is edited to add or change capabilities, the top-of-file docblock must be updated to reflect the new functionality.

### Docblock requirements for UI constructs

- **Components**: Document component purpose, layout role, expected behavior under different terminal widths/heights, and prop contracts.
- **Props Interfaces**: Document each prop, whether it is required or optional, and semantic meaning.
- **Reducers & Actions**: Document state transition semantics, invariant preservation, and action payload shapes.
- **Selectors & Utilities**: Document calculation logic, parameter expectations, and return values.

### Internal logic documentation

Document non-obvious internal logic with docblocks and explanatory comments:

- terminal height containment and overflow clamping;
- JSONL stream tailing, buffering, and reconnection;
- keyboard navigation and focus cycle logic;
- viewport calculation for logs and focus preview panels.
