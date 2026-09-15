# Source Analysis

## What is already modern

The uploaded repository already declares:

- Node `>=24.18.0`
- TypeScript `7.0.2`
- React `19.2.8`
- Ink `7.1.1`
- `@types/node` `24.13.4`
- `@types/react` `19.2.18`

The repository also already has useful engineering skills for:

- TypeScript 7
- Node 24
- React 19
- testing
- harness adapters
- release readiness
- trusted publishing

Those should be reused rather than replaced.

## Main gaps found

### 1. TypeScript configuration does not match the declared toolchain

Current `tsconfig.json` still contains:

```json
{
  "target": "ES2022",
  "strict": false,
  "noImplicitAny": false,
  "skipLibCheck": true
}
```

This leaves much of the benefit of TypeScript 7 unused.

### 2. Broad `any` usage

The analyzed source contains roughly 158 `any` occurrences.

Important examples include:

- harness factory context
- ACP protocol payloads
- JSON/config helpers
- UI state/event reducer
- reviewer JSON events
- evidence parsing
- tests

The correct migration is not "replace `any` with `unknown` everywhere".
Untrusted boundaries should become `unknown` and be narrowed into typed internal
models. Internal code should use concrete domain types.

### 3. Compatibility configuration is duplicated

`src/core/config.ts` exposes a typed camelCase config and then creates an
uppercase compatibility object such as:

```text
QUALITY_CMD
MAX_PLAN_REVIEWS
RUN_LOG_MAX_BYTES
...
```

Other modules consume a mixture of both styles.

Stage 2 should make one typed configuration contract authoritative and isolate
legacy aliases at the compatibility boundary.

### 4. Readability is poor in several critical files

Several modules contain many statements on a single physical line.

Important targets:

- `src/ui/InkUi.ts`
- `src/cli-main.ts`
- `src/core/config.ts`
- `src/core/fs.ts`
- `src/git/*`
- `src/harness/codex/CodexReviewerHarness.ts`
- `src/harness/cursor/CursorExecutorHarness.ts`
- `src/orchestrator/Orchestrator.ts`
- `src/stages/context.ts`

Formatting must be automated instead of manually maintained.

### 5. UI implementation does not use modern TSX

`src/ui/InkUi.ts` uses nested `React.createElement` calls and broadly typed
component props/state.

For React 19 + Ink 7, a typed `.tsx` component structure is significantly more
maintainable.

### 6. Tests exist, but coverage is concentrated

There are currently 28 test cases across these areas:

- config
- GitRepository
- Cursor ACP parsing
- harness registry
- permissions
- evidence verifier
- plan coordinator
- stage source
- UI layout

Missing or weakly tested areas include:

- CLI argument/command behavior at the TypeScript unit level
- `ProjectWorkspace`
- `RunStateStore`
- `RunLock`
- `BranchManager`
- process timeout/abort behavior
- Codex reviewer adapter
- orchestrator state transitions
- recovery manager
- configuration validation failures
- external harness module loading
- UI reducer/components
- real Ink render behavior
- package-consumer import/type resolution
- cross-platform shell/wrapper behavior

### 7. ACP/evidence logic needs stronger boundaries

The current repository already contains work toward:

- multi-chunk ACP parsing
- evidence corroboration
- patch fingerprints
- recovery

The modernization should preserve this functionality while making it typed and
testable. Do not bury ACP parsing inside the process-control class.

### 8. Current agent guidance is valuable

The existing `.agents/skills` are a good foundation. Stage 5 should update and
deduplicate them, not discard them.

## Architectural direction

Prefer:

```text
external/untrusted data
        ↓
boundary parser/validator
        ↓
typed domain object
        ↓
service
        ↓
semantic events/state
```

Avoid:

```text
any protocol object
        ↓
passed through many modules
        ↓
runtime property guessing everywhere
```
