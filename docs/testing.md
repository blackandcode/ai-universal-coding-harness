# Testing and Quality Gates

The project uses Node.js's built-in test runner (`node:test`) and native coverage tooling for unit, integration, and end-to-end verification.

## Two-Tier Quality Gate Structure

### 1. Fast Day-to-Day Iterative Gate (`npm run check:changed`)

For day-to-day development iterations and AI agent workflows, run the incremental quality check:

```bash
npm run check:changed
```

- **Scope**: Modifed, staged, and untracked files across the repository.
- **Workflow**:
  1. Formats touched files with Oxfmt (`oxfmt --check`).
  2. Lints touched JS/TS files with Oxlint (`oxlint`).
  3. Typechecks with TypeScript (`tsc -p tsconfig.json --noEmit` and `tsc -p tsconfig.test.json --noEmit`).
  4. Resolves and compiles corresponding test suites into `.test-dist/` and runs targeted tests via `scripts/run-tests.mjs <paths...>`.
- **Default for Agents**: AI agents default to this command for iterative changes and must not run the full test suite unless explicitly requested.

### 2. Pre-Push Verification Gate (`npm run pre-push`)

A Git pre-push hook (`.githooks/pre-push` invoking `scripts/pre-push.mjs`) automatically executes full repository verification (`npm run verify`) prior to pushing to origin.

If any check, lint error, type failure, coverage deficit, CLI smoke failure, or packaging invariant fails, **`git push` is immediately halted** with an exit status of 1.

```bash
npm run verify
```

## Test Organization & Compilation Isolation

All tests reside in a root-level `tests/` directory that mirrors the `src/` directory hierarchy:

- `src/` contains **strictly production code**, compiled to `dist/` via `tsconfig.json`. Emitted test files are prohibited in `dist/`.
- `tests/` contains all unit, integration, regression, and component tests, mirroring `src/` subdirectories (`tests/cli/`, `tests/config/`, `tests/core/`, `tests/git/`, `tests/harness/`, `tests/orchestrator/`, `tests/permissions/`, `tests/project/`, `tests/quality/`, `tests/stages/`, `tests/state/`, `tests/ui/`).
- `tests/` and `src/` are compiled together to `.test-dist/` via `tsconfig.test.json` with `rootDir: "."` and `outDir: ".test-dist"`. Relative runtime imports within `.test-dist` resolve seamlessly.

## Test Discovery

The test runner (`scripts/run-tests.mjs`) discovers all compiled `.test.js` files under `.test-dist/tests/` (compiled from both `.test.ts` and `.test.tsx` source files) and sorts them deterministically by path before execution. It also supports accepting targeted test files as arguments for selective execution.

## Native Coverage Gates

Coverage is enforced using Node 24 native test coverage flags with zero external dependencies (no Istanbul/c8):

```bash
--experimental-test-coverage
--test-coverage-lines=85
--test-coverage-functions=85
--test-coverage-branches=80
```

Running `npm run test:coverage` (enforced automatically in `npm run verify`) executes the full test suite and verifies that coverage meets or exceeds these thresholds:

- **Line Coverage**: ≥ 85%
- **Function Coverage**: ≥ 85%
- **Branch Coverage**: ≥ 80%

### Critical Module Invariant

In addition to global repository thresholds, critical security, recovery, and evidence modules must independently maintain strict branch and line coverage:

- `src/permissions/CommandClassifier.ts` & `src/permissions/PermissionEngine.ts`
- `src/quality/EvidenceVerifier.ts` & `src/quality/EvidenceService.ts`
- `src/orchestrator/RecoveryManager.ts`

## Orchestrator Integration Suite

The integration test suite (`src/orchestrator/orchestrator-integration.test.ts`) validates end-to-end stage flows in isolated temporary Git repositories using deterministic scripted fake harnesses:

- **Happy Path Execution**: Verifies stage planning, executor implementation, quality gate passage, reviewer approval, and generation of a single stage-named Git commit with proper trailer metadata on a dedicated AI branch.
- **Reviewer Rework Iterations**: Verifies that reviewer `REWORK` verdicts increment attempts, supply structured feedback to the executor, and achieve eventual approval.
- **Resume Idempotence**: Verifies that interrupted runs resume seamlessly and reuse pre-approved plans without re-entering the planning phase.
- **Recovery Routing**: Verifies that corroborated valid evidence resumes at `REVIEW`, while stale or corrupted evidence safely routes to `QUALITY`.
- **Permission Volume Resilience**: Verifies that 25+ permission requests are classified, cached, and serviced without exceeding budgets or halting the stage.
- **Plan Budget Exhaustion**: Verifies that exhausted review budgets trigger `PlanCoordinator.forceAccept` consolidation with carryover guidance without hard blockers.

## Consumer Tarball Verification

`scripts/package-check.mjs` verifies the integrity of the published package:

1. Performs `npm pack` and unpacks the tarball into an isolated clean directory.
2. Asserts runtime ESM imports and type definitions.
3. Tests the CLI binary (`ai-harness --version`, `ai-harness init`, `ai-harness config show`, `ai-harness validate`) inside an initialized consumer Git workspace.

## Hermetic Offline Invariant

All unit, integration, and smoke tests execute completely offline in temporary workspaces. No real AI harness credentials, active daemon processes, or network requests are required.

## CI Matrix

CI runs on Linux (Ubuntu with Node 24.18.0), Windows, and macOS using Node 24 LTS.
