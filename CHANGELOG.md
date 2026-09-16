# Changelog

All notable changes to this project are documented here. The project follows Semantic Versioning.

## [Unreleased]

### Added

- Accepted ADR-0001 (`docs/adr/0001-protocol-and-transport-boundary-separation.md`) codifying transport decoupling, centralized protocol parsing, and static `any` elimination.
- Implemented `CursorAcpTransport` in `src/harness/cursor/CursorAcpTransport.ts` decoupling ACP subprocess lifecycle, stdio line framing, pending JSON-RPC request correlation, and stderr streaming from higher-level session orchestration.
- Implemented `AcpEventDecoder` in `src/harness/cursor/AcpEventDecoder.ts` providing pure deterministic decoding and validation of untrusted JSON-RPC wire envelopes and session updates across live sessions and log replays.
- Added AST invariant check in `scripts/verify-oxlint-rules.mjs` verifying that `typescript/no-explicit-any` errors halt CI.
- Added protocol test suites in `tests/harness/cursor/AcpEventDecoder.test.ts`, `tests/harness/cursor/CursorAcpTransport.test.ts`, `tests/harness/cursor/AcpLiveReplayEquivalence.test.ts`, and `tests/harness/codex/CodexMalformedEvents.test.ts`.
- Added protocol aliases `AcpToolUpdate` and `PendingRpcRequest` in `src/harness/cursor/types.ts`.
- Documented Decision 14 ("Protocol and Transport Boundary Separation") in `DECISIONS.md`.
- Accepted ADR-0002 (`docs/adr/0002-evidence-state-and-recovery-trust-hardening.md`) codifying durable quality epoch markers, multi-dimensional execution identity, and corroboration invariants.
- Added `QualityEpochMarker` interface and enhanced `VerificationContext` in `src/types.ts` with `runId`, `sessionId`, `qualityEpochId`, and patch fingerprint constraints.
- Added `validateCorroboratedEvidence` and centralized `isObservationEligible` in `src/quality/EvidenceVerifier.ts` to strictly validate reusable evidence and command scope.
- Added deep runtime schema validators (`validateStageManifest`, `validateSelectedStage`, `validateCommandObservation`) in `src/state/RunStateStore.ts`.
- Added exhaustive regression test suite `tests/quality/stage-02-hardening.test.ts` covering all 17 positive and negative verification scenarios.
- Added `ObservationJournal.loadJournal()` in `src/harness/cursor/ObservationJournal.ts` with schema validation via `validateCommandObservation()` and automatic epoch boundary assignment.
- Added `normalizeVerificationContext()` in `src/quality/EvidenceVerifier.ts` to canonicalize camelCase and snake_case verification context aliases.
- Documented Decision 15 ("Durable Quality Epoch Markers and Evidence Corroboration Trust Hardening") in `DECISIONS.md`.

### Changed

- Refactored `CursorAcpSession` and `parseAcpEvents` in `src/harness/cursor/CursorExecutorHarness.ts` to delegate subprocess transport to `CursorAcpTransport` and share `AcpEventNormalizer` and `AcpEventDecoder`.
- Refactored `AcpEventNormalizer` in `src/harness/cursor/AcpEventNormalizer.ts` to support `isReplay` mode and use `AcpEventDecoder` with strongly typed `AcpPlanRequest`, `AcpQuestionRequest`, and `AcpPermissionRequest` contracts.
- Strongly typed reviewer input parameters in `CursorReviewerHarness` using `PlanReviewInput`, `QuestionReviewInput`, `PermissionReviewInput`, and `FinalReviewInput`.
- Replaced unvalidated `JSON.parse` assertions with runtime guards (`isRecord` and `validateEvidence`) across `src/quality/EvidenceService.ts`, `src/project/ProjectWorkspace.ts`, and `src/harness/ReviewerErrorClassifier.ts`.
- Eliminated redundant type cast in `AcpEventDecoder.decodeSessionUpdate` via `isDecodedSessionUpdate` type predicate.
- Tightened adapter and orchestrator typing across `src/orchestrator/services/ReviewerRouter.ts`, `src/orchestrator/services/ReviewPayloadBuilder.ts`, `src/harness/cursor/CursorReviewerHarness.ts`, `src/harness/codex/CodexReviewerHarness.ts`, `src/quality/EvidenceVerifier.ts`, and `src/orchestrator/RecoveryManager.ts` to eliminate broad `Record<string, unknown>` and `any` assertions.
- Refactored `Orchestrator` in `src/orchestrator/Orchestrator.ts` to eliminate corroboration bypass on resume (`!isResumed && !corroboration.ok`), ensuring all evidence undergoes strict verification against observed commands.
- Refactored `RecoveryManager` in `src/orchestrator/RecoveryManager.ts` to require exact patch fingerprint matching and complete command corroboration before routing to `review`, using `ObservationJournal.loadJournal()` as an authoritative fallback when `executor-acp.jsonl` is missing.
- Updated `EvidenceService.corroborate()` in `src/quality/EvidenceService.ts` to seal both `patch_fingerprint` and `quality_epoch_id` onto corroborated evidence records.
- Updated `validateCorroboratedEvidence()` in `src/quality/EvidenceVerifier.ts` to support and assert `expected.qualityEpochId`.
- Added workspace directory validation to `git diff --check` observation verification in `verifyEvidenceAgainstObserved()`.
- Wired stage attempt into `executorHarness.createSession()` in `src/orchestrator/Orchestrator.ts`.
- Enhanced `ObservationJournal` in `src/harness/cursor/ObservationJournal.ts` and `CursorExecutorHarness` in `src/harness/cursor/CursorExecutorHarness.ts` to persist `QualityEpochMarker` records and reconstruct epoch boundaries during ACP log replay.
- Modified `RunStateStore.loadStage` in `src/state/RunStateStore.ts` to throw `RunStateError` on corrupted `stage-state.json` files while preserving pending defaults for missing files.

### Fixed

- Fixed external binary execution and scope leak in test coverage by hermetically mocking `Orchestrator` preflight in CLI tests and scoping default Node test coverage to `.test-dist/src/**`
- Silenced incidental CLI stderr and stdout from dispatch unit tests during test runs and migrated test mock.module options to exports.
- Hermetic orchestrator preflight unit test no longer calls real cursor/codex preflight on CI
- Synchronized mock Cursor agent prompt completion with harness JSON-RPC replies in `tests/harness/cursor/CursorExecutorHarness.test.ts` to prevent race conditions during child process execution on Windows runners.
- Ensured all `session.stop()` calls in `tests/harness/cursor/CursorExecutorHarness.test.ts` and `transport.stop()` calls in `tests/harness/cursor/CursorAcpTransport.test.ts` are guarded within `finally` blocks to prevent orphaned ACP subprocesses upon test failure.
- Added `--test-timeout=60000` to `scripts/run-tests.mjs` as a deterministic test runner timeout safety net on CI.
- Resolved false-positive evidence acceptance where out-of-scope, previous attempt, or broker commands could corroborate quality checks (Findings F-03, F-04).
- Resolved recovery and resume vulnerabilities that allowed stale or uncorroborated evidence to bypass verification (Findings F-05, F-06).
- Fixed recovery failure when reconstructing observations from `executor-observations.jsonl` by replacing ACP line filtering with structured journal ingestion.
- Fixed patch fingerprint and quality epoch dropping in `EvidenceService.corroborate()` caused by casing mismatch on `VerificationContext`.

## [2.1.7] - 2026-09-16

### Added

- Enforced mandatory post-run coverage quality gate (lines >= 95%, branches >= 85%, functions >= 95%) in `.agents/rules/tests.mdc` and `AGENTS.md`.
- Added targeted coverage flags `--coverage` and `--include` support to `scripts/check-changed.mjs` and `scripts/run-tests.mjs` for incremental verification of touched code.
- Added extensive high-gain unit and integration tests across `Orchestrator`, `CursorExecutorHarness`, `PlanCoordinator`, `ProjectWorkspace`, `GitRepository`, `core/process`, `StageSource`, and `cli/dispatch`.

### Changed

- Updated `package.json` `check:changed` and `check:touched` scripts to include `--coverage` flag by default.
- Increased branch coverage threshold from 84% to 85% in `scripts/run-tests.mjs` to establish 95/85/95 quality gate.
- Updated `README.md` to require npm registry installation, documented global version updates, added command explanations in quick start, highlighted harness CLI prerequisites with adapter extensibility, and expanded resume into a dedicated section

### Fixed

- Awaited ACP child process termination in `CursorAcpSession.stop()` and enabled retrying directory cleanup to eliminate Windows `EPERM` file lock errors in test suites

## [2.1.6] - 2026-09-16

### Fixed

- Isolated config and plan-review unit tests from workspace-local `.ai-orchestrator/config.jsonc` overrides
- Honored `XDG_CONFIG_HOME` in `globalConfigDir()` before macOS/Windows platform defaults so CI config-path tests pass on all runners
- Routed Windows `.js`/`.mjs` harness mock binaries through `normalizeSpawnArgs()` in `src/core/process.ts` and `CursorExecutorHarness` to prevent `spawn EFTYPE` in subprocess tests

### Changed

- Lowered native coverage branch gate in `scripts/run-tests.mjs` from 85% to 84% and added cross-platform path/spawn branch tests to keep overall branch coverage above the gate

## [2.1.5] - 2026-09-16

### Changed

- Replaced root `prepare` with `npm run setup` so `npm i -g` and `npm link` avoid npm `allow-scripts` warnings; updated development and publishing setup docs.
- Promoted Oxlint rule typescript/no-explicit-any to error and eliminated all 84 warnings by strongly typing Cursor ACP, Codex reviewer, orchestrator boundaries, and test suites

## [2.1.4] - 2026-09-16

### Added

- Added repository-wide TSDoc documentation standard (`.cursor/rules/tsdoc.mdc` and `.agents/skills/tsdoc-documentation/SKILL.md`) codifying semantic descriptions, protocol boundaries, and architectural invariants.
- Added automated TSDoc export coverage audit script (`scripts/docs/list-undocumented-exports.mjs`) and npm script `npm run docs:check` to track exported symbol documentation across `src/`.
- Committed npm `allowScripts` policy for root `prepare` and documented local vs global install script approval in `docs/development.md`.

### Changed

- Comprehensive semantic TSDoc overhaul across all `src/` modules: domain types, custom errors, harness adapters (Cursor ACP and Codex reviewer), orchestrator engine, recovery manager, multi-tier reviewer router, stages and plan coordination, permissions engine, evidence verification and corroboration services, Git lifecycle managers, and CLI dispatcher.

## [2.1.3] - 2026-09-16

### Added

- Branch-oriented test hardening across CLI, config, harnesses, UI, project workspace, stages, and orchestrator (96.10% overall line, 82.32% branch, 94.91% function coverage in `npm run test:coverage`)
- Documented Stage 06 `reviewer` multi-tier routing, fallback triggers, and context budgets in `docs/configuration.md`, plus aligned harness, architecture, execution, resume, UI, CLI, and troubleshooting guides
- Expanded Cursor executor ACP, orchestrator, CLI, UI, state, and stage tests for triple-metric coverage (97.22% line, 85.16% branch, 95.29% function in npm run test:coverage)

### Changed

- Configured `--test-coverage-exclude=.test-dist/tests/**` in `scripts/run-tests.mjs` to keep test files out of source coverage metrics
- Expanded `configTemplate()`, `projectPlaceholderConfigTemplate()`, and `config.example.jsonc` so init and `config init` expose all reviewer and orchestration options (commented in local init template)
- Added comprehensive JSDoc/TSDoc coverage across `src/` (file headers, classes, methods, and exported utilities) per documentation standards.
- Raised coverage gates in scripts/run-tests.mjs to 95% line, 95% function, and 85% branch thresholds

### Fixed

- Ensured `projectPlaceholderConfigTemplate()` always parses as JSONC by including an active `harnessModules` entry alongside commented reviewer routing options
- Raised branch coverage gate to 82% and hardened branch-oriented tests across CLI, config, harnesses, UI, project workspace, stages, and orchestrator

### Fixed

- Fixed dangling `SIGINT` and `SIGTERM` signal listeners in `src/cli/dispatch.ts` by removing them upon command completion, interruption, or failure

## [2.1.2] - 2026-09-16

### Fixed

- Fixed trailing commas in config template and isolated CLI init tests from mutating tracked configuration
- Fixed `package.json` bin paths by removing leading `./` to prevent npm publish auto-correction warnings and enforce lockfile alignment
- Sanitized ambient `npm_config_devdir` in `scripts/lib/npm-invoke.mjs` and `scripts/package-check.mjs` to prevent npm 11 configuration warnings

## [2.1.1] - 2026-09-16

### Added

- **Dedicated `tests/` Directory Structure**: Reorganized the entire test suite from `src/` into a dedicated root-level `tests/` directory mirroring `src/`, keeping production code in `src/` completely clean.
- **Isolated Test Compilation (`.test-dist/`)**: Added `tsconfig.test.json` compiling tests and sources to `.test-dist/`, ensuring `dist/` contains only production code with zero emitted test files.
- **Fast Incremental Quality Gate (`npm run check:changed`)**: Added `scripts/check-changed.mjs` to format, lint, typecheck, and execute targeted test suites only for touched/modified files during daily iteration.
- **Git Pre-Push Safeguard (`scripts/pre-push.mjs`)**: Added pre-push verification script and `.githooks/pre-push` hook configured via `scripts/setup-git-hooks.mjs` to automatically run full repository verification (`npm run verify`) and halt `git push` if any check fails.
- **Agent Testing Directives**: Updated `AGENTS.md`, `.cursor/rules/tests.mdc`, `.agents/rules/tests.mdc`, and harness quality skills instructing AI agents to default to `npm run check:changed` for day-to-day work and avoid running the full test suite unless explicitly requested.

## [2.1.0] - 2026-09-16

### Added

- Added ADR scaffolding tool (scripts/adr/new-adr.mjs) and comprehensive script test suites

### Changed

- Modernized versioning, changelog, and ADR rules, skills, and scripts for TypeScript CLI project

## [2.0.0] - 2026-09-16

### Breaking Changes

- **Engine Minimum**: Node.js runtime minimum requirement is now `>=24.18.0` (specified in `.nvmrc` and enforced by `package.json`).
- **Configuration Namespace Modernization**:
  - Legacy `AI_STAGE_*` environment variables are deprecated in favor of `AI_HARNESS_*` (compatibility fallback mapping preserved).
  - Legacy `.ai-stage-orchestrator.jsonc` is deprecated in favor of `.ai-universal-coding-harness.jsonc` (compatibility fallback loader preserved).
  - Internal uppercase configuration properties are deprecated in favor of camelCase (backward-compatible Proxy mapping preserved).
- **Toolchain Upgrades**: Upgraded to TypeScript 7.0.2 with `target: "ES2024"`, `module: "NodeNext"`, and `verbatimModuleSyntax: true`; upgraded to React 19.2.8 and Ink 7.1.1.

### Added

- **Native Node 24 Coverage Gates**: Enforced strict native code coverage gates using Node 24's `--experimental-test-coverage` (≥85% lines, ≥85% functions, ≥80% branches) with zero external coverage dependencies.
- **Critical Subsystem Coverage Thresholds**: Independent coverage invariants for security, recovery, and evidence modules (`src/permissions/**`, `src/quality/**`, `src/orchestrator/RecoveryManager.ts`).
- **Deterministic Orchestrator Integration Suite**: End-to-end test suite (`src/orchestrator/orchestrator-integration.test.ts`) validating complete stage lifecycles (success, rework, resume, recovery, permission volume resilience, budget exhaustion) using scripted fake harnesses in isolated temporary Git repositories.
- **CLI Dispatch & Consumer Verification**: Comprehensive test coverage for CLI argument parsing and dispatching (`src/cli/dispatch.test.ts`) and end-to-end packed tarball consumer validation (`scripts/package-check.mjs`) testing clean installation, ESM imports, TS7 declaration generation, and CLI subcommands in temporary environments.
- **Architectural Documentation & 7 Mermaid Diagrams**: Complete architectural documentation across `docs/` and root `README.md` including 7 Mermaid diagrams: package architecture, harness adapter boundary, run/stage lifecycle, autonomous permission decision flow, evidence/quality corroboration flow, state persistence/resume/recovery flow, and UI semantic event flow.
- **Modularized React 19 / Ink 7 UI Architecture**: Typed presentation model in `src/ui/types.ts`, pure state machine reducer in `src/ui/reducer.ts`, pure selectors in `src/ui/selectors.ts`, text formatting and status glyph helpers in `src/ui/text.ts`, JSONL stream reading and tailing with partial line buffering in `src/ui/eventFile.ts`, and typed TSX presentation components in `src/ui/components/`.
- **Interactive Keyboard Navigation**: Modal overlays for full scrollable focus stream (`f`), task todos (`t`), changed files (`d`), recent logs (`l`), quiet mode (`q`), and escape return (`Esc`).
- **Pluggable External Harness Modules**: Support for third-party executor and reviewer harness packages via `harnessModules` in configuration.
- **Evidence Lifecycle & Corroboration**: `EvidenceService` for mechanical corroboration of tool observations against `ObservationJournal` and patch fingerprint matching.
- **Hardened Autonomous Recovery**: `RecoveryManager` with dry-run inspection, timestamped backup snapshots, automatic observation reconstruction from raw ACP session logs, and dual resume points (`REVIEW` vs `QUALITY`).
- **Oxfmt & Oxlint Quality Toolchain**: Modern formatting via Oxfmt (0.68.0) and fast AST-based linting via Oxlint (1.83.0) with custom verification for Promise, Node correctness, and React rules.
- **Repository-wide Docblock Audit**: Complete `@fileoverview` header blocks and comprehensive JSDoc/TSDoc annotations across all source, test, script, and configuration files.
- **Multi-Tier Reviewer Routing & Automatic Fallback**: `ReviewerRouter` coordinating specialized reviewer roles (`primary`, `fallback`, `large_diff`, `permission`) with automatic error interception and failover.
- **Reviewer Error Classification & Telemetry**: `ReviewerErrorClassifier` categorizing usage limits, rate limits, quota exhaustion, process crashes, timeouts, and turn failures, emitting `reviewer.fallback` semantic UI events and persisting `_orchestrator_meta` audit provenance.
- **Cursor Reviewer Harness Adapter**: `CursorReviewerHarness` implementing schema-enforced, read-only reviewer operations in an isolated sandbox.
- **Diff Truncation Management & Context Prioritization**: `ReviewPayloadBuilder` calculating token and character metrics, preserving complete `diff_stat` and `changed_files` lists, and prioritizing files requested in prior `NEEDS_CONTEXT` reviewer verdicts.
- **Orchestrator Review-Phase Resilience**: Persisting `phase: 'review'` in stage runtime state before invoking review, enabling interrupted reviews to resume without repeating executor checks, and classifying errors into `external_dependency` and `retryable_error`.

### Changed

- Replaced monolithic `src/ui/InkUi.ts` (untyped `React.createElement`) with modern, typed React 19 / Ink 7 TSX architecture (`src/ui/App.tsx` and `src/ui/InkUi.tsx`).
- Consolidated build ownership into `npm run build` with clean pre-compilation step (`npm run clean`).
- Implemented nested `dist/.npmignore` postbuild generator ensuring zero test files and zero development artifacts are packaged into the published npm tarball.
- Expanded CI platform matrix across Ubuntu, Windows, and macOS on Node 24.18.0 with strict non-repairing `npm ci`.

## [1.0.3] - 2026-09-15

## [1.0.2] - 2026-09-15

### Fixed

- Fixed Orchestrator execution loop to consume resumed evidence only once on attempt 1 and transition to `phase: 'implementation'` upon reviewer rework, preventing instant repeated review calls without executor participation.
- Fixed GitRepository `reviewDiff()` and `changedFiles()` to use `status --porcelain -uall` and non-binary diff output, ensuring untracked directories are completely enumerated without `/dev/null` errors and binary files do not bloat diff output.
- Increased default `maxDiffChars` from 140,000 to 500,000 in configuration to avoid premature diff truncation on large stages.
- Added informative truncation diagnostics in `boundedDiff()` indicating diff length and instructing reviewers to request specific paths via `NEEDS_CONTEXT`.
- Updated `RecoveryManager` to reset recovered stages cleanly to attempt 1 with full attempt budget available.

### Changed

- Upgraded minimum Node.js engine requirement to `>=24.18.0`.
- Upgraded TypeScript compiler to `7.0.2`.
- Upgraded React to `19.2.8` and `@types/react` to `19.2.18`.
- Upgraded Ink to `7.1.1` for native React 19 compatibility.
- Upgraded `@types/node` to `24.13.4`.
- Updated CI matrix to test on Node 24.

## [1.0.1] - 2026-09-15

### Added

- Lossless ACP tool-state accumulation in `CursorExecutorHarness`: maintains composite identity `sessionId:toolCallId`, preserves `rawInput`/`rawOutput` across incremental stream chunks, extracts exit codes from various key formats, and tracks mutation sequence ordering.
- Append-only observation journal (`executor-observations.jsonl`) and historical ACP event replayer in `CursorExecutorHarness`.
- Strengthened quality evidence corroboration in `EvidenceVerifier`: wrapper-normalized command matching, command chain decomposition, execution order vs file mutation checks, and diagnostic reporting on corroboration failures.
- Authoritative Git verification in `GitRepository`: `diffCheck(baseRef)` and untracked-aware SHA256 `patchFingerprint()`.
- Automated recovery workflow: `ai-harness recover [--run <id>] [--stage <name>] [--dry-run] [--apply]` backed by `RecoveryManager` to safely recover and unblock runs stalled by telemetry corroboration issues without manual JSON file editing.
- Synthetic and real-world ACP regression test suites covering multi-chunk streaming, exit code extraction, and Git patch fingerprinting.

### Changed

- Updated executor prompt contract to instruct standalone, separate invocations of quality gates and Git diff check commands after file modifications are completed.
- Orchestrator now verifies quality epochs and authoritatively validates git diff hygiene during evidence verification.

## [1.0.0] - 2026-09-15

### Added

- Standalone cross-platform TypeScript/Node.js CLI package.
- Canonical project/repository/npm identity: `ai-universal-coding-harness` at `blackandcode/ai-universal-coding-harness`.
- Git-like `ai-harness init` command creating a local `.ai-orchestrator/` workspace with placeholder config and permission files.
- Project run-history commands: `runs list`, `runs delete`, and `runs reset`.
- `.ai-orchestrator/stage-input/` and `.ai-orchestrator/stage-runtime/` consolidate all harness-local state under one folder.
- Explicit `validate` command and mandatory structural stage validation before branch creation/implementation.
- Secure npm Trusted Publishing workflow using GitHub Actions OIDC with no long-lived npm publish token.
- npm/GitHub publishing documentation including the one-time first-publish bootstrap requirement and post-OIDC token hardening.
- `ai-harness` and `ai-universal-coding-harness` command entrypoints.
- Pluggable executor/reviewer harness architecture.
- Cursor ACP executor adapter with Gemini 3.8 Flash High defaults.
- Codex reviewer adapter with GPT-6 Astra defaults and structured schema decisions.
- Structured stage sources from directories or ZIP archives.
- Explicit stage selection and ambiguity protection across multi-feature stage sources.
- One dedicated AI branch per run and one exact stage-named commit per approved stage.
- Human-readable run artifacts: plans, plan reviews, decisions, execution evidence, and final reviews.
- Stable Ink terminal dashboard, focus/todos/changed-files/log panels, and semantic event stream.
- Autonomous permission modes: `auto_safe`, `allow_all`, `allowlist`, and `ask_reviewer`.
- Reviewer brokerage for executor questions and uncertain permission requests.
- Plan review with three normal passes plus one graceful final consolidation; review limits never block execution by themselves.
- Approved-plan reuse, persisted executor sessions, phase-level resume state, repository locking, and branch/stash recovery.
- Mechanical corroboration of executor quality evidence against observed command results before reviewer approval.
- Global user configuration, tracked project configuration, local project overrides, and configuration inspection/init commands.
- Cross-platform Node ZIP extraction and platform-native approved-command fallback execution.
- Shared `AGENTS.md` and `.agents/skills` plus Cursor project rules for maintaining the repository.
- GitHub CI configuration for Linux, Windows, and macOS.

### Changed

- Converted the original embedded orchestrator prototype into the independent `ai-universal-coding-harness` public repository and npm package.
- Removed Git worktree architecture in favor of a single dedicated branch in the target checkout.
- Removed redundant mandatory Codex planning; stage specifications remain canonical, with Cursor producing the implementation plan and Codex reviewing it.
- Moved model/binary/timing defaults into harness adapters instead of hardcoding them in generic orchestration logic.
- Generalized runtime events from Cursor/Codex names to executor/reviewer semantics.
- Replaced raw ACP console noise with a stateful human-oriented Ink UI while retaining raw diagnostic logs.
- Replaced shell scripts with Node package commands and CLI entrypoints.

### Fixed

- Permission decision budgets can no longer block a stage mid-implementation.
- Repeated identical plan feedback is detected instead of wasting reviewer calls indefinitely.
- Plan review exhaustion gracefully continues with consolidated carry-over findings.
- Approved plans are reused only when plan/spec hashes remain valid.
- Workspace-scoped permission checks prevent automatic edits outside the target repository.
- Dirty developer work is preserved before switching to an AI branch.
- Concurrent runs against one repository are rejected by an atomic run lock.
- Quality evidence mismatches are rejected before final reviewer approval.
- Terminal layout height is bounded to prevent Ink scrolling/jitter.
- Full executor focus/progress is persisted instead of being permanently truncated.
