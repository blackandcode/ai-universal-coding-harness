# Testing and Quality Gates

The project uses Node.js's built-in test runner (`node:test`) and native coverage tooling for unit, integration, and end-to-end verification.

```bash
npm run build
npm run test:unit
npm run test:coverage
npm run test:cli
npm test
npm run verify
```

## Test Discovery

The test runner (`scripts/run-tests.mjs`) discovers all compiled `.test.js` files under `dist/` (compiled from both `.test.ts` and `.test.tsx` source files) and sorts them deterministically by path before execution.

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
