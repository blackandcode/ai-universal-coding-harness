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
