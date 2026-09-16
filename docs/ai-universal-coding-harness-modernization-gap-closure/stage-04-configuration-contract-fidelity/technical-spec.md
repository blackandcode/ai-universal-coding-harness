# Technical Specification — Stage 04

## Primary files

```text
src/orchestrator/Orchestrator.ts
src/orchestrator/services/ReviewerRouter.ts
src/harness/codex/CodexReviewerHarness.ts
src/harness/codex/CodexProcessRunner.ts
src/harness/cursor/CursorReviewerHarness.ts
src/core/config.ts
src/config/validation.ts
src/config/templates.ts
config.example.jsonc
docs/configuration.md
tests/config/**
tests/orchestrator/**
tests/orchestrator/services/ReviewerRouter.test.ts
tests/harness/codex/**
```

## F-12 — Question budget

### Current behavior

`Orchestrator.questionDecision` caches answers by SHA-256 of `{ title, questions }` but never increments a per-stage distinct-fingerprint counter or reads `CONFIG.maxUniqueQuestionsPerStage` / `MAX_UNIQUE_QUESTIONS_PER_STAGE`.

### Target behavior

1. Track `distinctQuestionFingerprints` (or equivalent) on stage runtime state or orchestrator stage scope for the active stage attempt.
2. On each new fingerprint:
   - if under cap → existing reviewer path;
   - if at or over cap → skip reviewer call, apply autonomous first-option answers, append human-readable note to stage `DECISIONS.md`, emit `EventBus` semantic event.
3. Reused fingerprints within the same stage continue to hit the cache (do not double-count).

### Suggested test locations

```text
tests/orchestrator/orchestrator-unit.test.ts
tests/orchestrator/orchestrator-integration.test.ts (if question flow is covered)
```

## F-13 — Role config precedence

### Current behavior

`ReviewerRouter.resolveHarness` builds `mergedContext` with `reviewerModel`, `reviewerBinary`, `thinking`, `reasoningEffort`, `timeoutMinutes`, `timeoutSeconds` but **does not** pass `verbosity` or `contextMode`.

`CursorReviewerHarness` constructor applies context overrides for model, binary, thinking, timeouts.

`CodexReviewerHarness` reads only `harnesses.codex` via `harnessString` / `harnessNumber` in field initializers; context is ignored.

### Target behavior

1. Extend `HarnessContext` (Stage 01 may type this) with optional `verbosity`, `contextMode`, and any missing role fields.
2. `ReviewerRouter` copies all role-config tunables into context.
3. `CodexReviewerHarness` (and Cursor reviewer if any field still global-only) resolves each tunable as:

```text
role context value
  ?? harnesses.<adapter>.*
  ?? adapter static default
```

4. `CodexProcessRunner` continues to receive resolved options from the harness instance (no parallel config read).

5. Document precedence in `docs/configuration.md` with a short table: role block wins over `harnesses.*` for the same field.

### Registry note

`HarnessRegistry.reviewer(id, context)` must pass context into adapter constructors for built-in and external reviewer modules that support `HarnessContext`.

## F-14 — Contract tests

### Minimum test matrix

| Area | Assertion |
| ---- | --------- |
| Validation | `maxUniqueQuestionsPerStage` clamps to `>= 1` and surfaces on merged config |
| Router | `resolveHarness('primary')` with `reviewer.primary.reasoningEffort: 'high'` yields Codex runner options reflecting `high` when harness is `codex` |
| Orchestrator | Synthetic question stream exceeding cap does not call reviewer after cap |
| Examples | `configTemplate()` / `projectPlaceholderConfigTemplate()` parse as JSONC; keys in example match validation schema |

Optional: generate a manifest of known config keys from `src/config/types.ts` and assert every key in `config.example.jsonc` (uncommented) is in the manifest.

### Documentation sync

When implementing, update:

- `config.example.jsonc` — avoid duplicating Codex tunables under `harnesses.codex` when `reviewer.primary` is the documented override surface; use comments to show fallback defaults only.
- `src/config/templates.ts` — same structure as product example.
- `docs/configuration.md` — precedence section and question budget behavior.

## Verification commands

During implementation:

```bash
npm run check:changed
```

Before completion:

```bash
npm run verify
npm pack --dry-run
```

## ADR trigger

If precedence becomes a guaranteed public contract for external harness modules, author an ADR before merging behavioral changes that third-party adapters must rely on.
