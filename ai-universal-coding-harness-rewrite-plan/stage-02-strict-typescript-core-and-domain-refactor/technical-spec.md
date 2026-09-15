# Technical Specification — Stage 02

## Suggested module decomposition

### Configuration

Refactor `src/core/config.ts` into cohesive pieces if needed:

```text
src/config/
├── types.ts
├── defaults.ts
├── paths.ts
├── loader.ts
├── env.ts
├── validation.ts
└── templates.ts
```

The exact structure may differ, but avoid one module owning parsing, environment
mapping, path resolution, templates and compatibility aliases simultaneously.

### Process boundary

Create a typed process result:

```ts
interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
```

Process execution must support:

- timeout;
- abort/cancellation where practical;
- Windows paths;
- no Bash-only assumptions.

### Git

Keep Git lifecycle isolated behind `GitRepository`/`BranchManager`.

Test:

- branch detection;
- dirty workspace;
- stash/recovery;
- patch fingerprint;
- diff check;
- staged/unstaged/untracked changes.

### State

Validate persisted JSON before trusting it.

Do not cast parsed JSON directly to `RunState`.

Use runtime type guards or lightweight validators.

### Stage source

Preserve strict stage contract:

```text
stage-NN-kebab-name/
├── functional-spec.md
├── technical-spec.md
└── prompt.md
```

Validation errors should be structured, not only concatenated strings.

### Plan coordinator

Model results as a discriminated union:

```text
needs_revision
accepted
accepted_with_notes
```

The review budget remains advisory and can never itself create a blocked state.

## Public API

Review `src/index.ts`.

Only export types/classes intended for external harness/plugin consumers.

Do not expose internal implementation helpers by accident.

## Tests required

Add unit tests for at least:

- config precedence;
- invalid config values;
- environment compatibility layer;
- process timeout;
- process failure;
- Git branch and dirty-state behavior;
- ProjectWorkspace init/reset;
- RunLock live/stale lock;
- RunStateStore invalid JSON/state;
- CLI parser;
- stage validation;
- plan coordinator convergence;
- public exports compile fixture.

## Definition of done

Run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:cli
npm run verify
```

No new lint/type suppressions without explanation.
