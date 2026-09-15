# Functional Specification — Stage 03: Harness, Evidence and Recovery Hardening

## Objective

Make harness integrations and quality corroboration reliable, typed,
restart-safe and independently testable.

This stage includes the known ACP streaming/evidence class of bugs.

## Scope

Refactor:

- `src/harness/types.ts`
- `src/harness/registry.ts`
- `src/harness/cursor/**`
- `src/harness/codex/**`
- `src/permissions/**`
- `src/quality/**`
- `src/orchestrator/Orchestrator.ts`
- `src/orchestrator/RecoveryManager.ts`

## Architectural requirements

### Harness neutrality

The orchestration engine sees only generic:

```text
ExecutorHarness
ExecutorSession
ReviewerHarness
```

Cursor/Codex-specific protocol details remain inside adapters.

External harness modules must continue to register without changing the engine.

### Cursor ACP parser separation

Extract ACP protocol normalization from process/session management.

Preferred responsibilities:

```text
CursorExecutorHarness
    -> binary/preflight/session creation

CursorAcpSession
    -> request/response transport

AcpToolAccumulator
    -> multi-chunk tool state

AcpEventNormalizer
    -> unknown protocol payload -> semantic event

ObservationJournal
    -> durable normalized command observations
```

Exact names may differ.

### ACP correctness

Must handle:

- initial `tool_call` containing command input;
- later update without `rawInput`;
- empty partial objects;
- late exit code;
- failed status without numeric exit;
- completed status without numeric exit;
- duplicate events;
- session reload/replay;
- duplicate tool IDs across sessions.

Never infer exit `0` from `"completed"`.

### Evidence integrity

A green quality claim is valid only when corroborated against:

- current run/stage/attempt;
- current executor session/quality epoch;
- current patch fingerprint;
- latest relevant execution;
- no later repository mutation.

Old successful commands must never validate a later modified patch.

### Permissions

Preserve:

- no permission-review quota that can block the stage;
- hard-dangerous deny invariant;
- deterministic safe/allowlist paths;
- reviewer fallback;
- command decision caching.

Permission tests must cover path scope and cross-platform command forms.

### Recovery

Recovery must be deterministic and must not require users to manually edit
`run.json` or `stage-state.json`.

Recovery should choose:

```text
resume at REVIEW
or
resume at QUALITY
```

based on provable evidence.

### Documentation and docblock standards

- **Top-of-file descriptions**: Every file added or modified in this stage must start with a descriptive top-level docblock explaining what the file is about, its architectural role, and core responsibilities.
- **Cross-stage header maintenance**: When editing an existing file (from earlier stages or the existing codebase) to add functionality or modify behavior, update the top-level file description docblock so it accurately reflects the additions and current module scope.
- **Thorough docblock coverage**: All functions, methods, classes, interfaces, and types must have clear, high-quality JSDoc/TSDoc docblocks detailing their intent, parameters, return values, errors thrown, and contract invariants.
- **Internal logic documentation**: Provide docblocks and explanatory comments for non-trivial internal logic where possible, including ACP payload accumulation, exit code extraction, quality epoch invalidation, permission evaluation, and recovery resume-point selection.

## Acceptance criteria

- ACP parsing is independently unit-testable without spawning Cursor.
- Reviewer parsing is independently testable without spawning Codex.
- evidence cannot pass on stale/old observations.
- missing telemetry returns to executor quality instead of silently passing.
- recovery has dry-run tests.
- no paid harness calls in normal test suite.
- all added or edited files contain descriptive top-of-file docblocks, with existing file headers updated to reflect new functionality.
- all functions, classes, interfaces, types, and internal logic have thorough docblock and explanatory documentation.
