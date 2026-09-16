# Rewrite Implementation Status

## Stage 01 — Modern Toolchain and Quality Foundation

Status: Completed (Ready for review / stage gate)

- **Quality Commands (Measured Results)**:
  - `npm run format:check` — Oxfmt formatting verification (0 formatting violations).
  - `npm run lint` — Oxlint static analysis and automated rule fixture check (`scripts/verify-oxlint-rules.mjs`) (0 errors, all 8 rule categories verified).
  - `npm run typecheck` — TypeScript 7 compiler verification (`tsc -p tsconfig.json --noEmit`) (0 errors).
  - `npm test` — Fresh build compilation and unit test suite execution (41 tests passing: 35 baseline + 1 TSX smoke + 5 package invariant tests).
  - `npm run test:coverage` — Fresh build compilation and unit test execution with `--experimental-test-coverage`.
  - `npm run test:cli` — CLI smoke execution (initialization, run creation, validation smoke pass).
  - `npm run verify` — Comprehensive quality gate running format check, lint, typecheck, tests, CLI smoke, bidirectional lockfile verification, and packaging validation.
  - `npm run check` — Standalone alias for `npm run verify`.
  - `npm pack --dry-run` — 152 files in package tarball inventory; 0 test files and 0 internal development artifacts.
- **Formatter**: Oxfmt 0.68.0 configured via `.oxfmtrc.json` with 2 spaces, single quotes, trailing commas, semicolons, and 100 print width. Formatted all source, script, configuration, and markdown files. Aligned `.editorconfig`.
- **Linter**: Oxlint 1.83.0 configured via `.oxlintrc.json` with schema `./node_modules/oxlint/configuration_schema.json` and active AST plugins (`typescript`, `react`, `node`, `promise`, `unicorn`). Verified against failing fixtures for promise statics, async executor, node export/require, react hooks/keys, equality (`eqeqeq` with null-ignore), and unused variables. Type-aware rules requiring `tsgolint` remain deferred to Stage 02 based on concrete probe evidence (requires optional platform-specific binaries).
- **TypeScript Configuration**: TypeScript 7.0.2 with `target: "ES2024"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `rootDir: "src"`, `outDir: "dist"`, `types: ["node"]`, `declaration: true`, `declarationMap: true`, `sourceMap: true`, `verbatimModuleSyntax: true`, `isolatedModules: true`, `noUncheckedSideEffectImports: true`, `forceConsistentCasingInFileNames: true`, `jsx: "react-jsx"`, and `resolveJsonModule: true`. Preserved `strict: false` and `noImplicitAny: false` for Stage 01 baseline stability.
- **Packaging and Exclusions**:
  - Build ownership consolidated into `npm run build` (`npm run clean && tsc -p tsconfig.json && node scripts/postbuild.mjs`).
  - Nested `dist/.npmignore` dynamically generated in `scripts/postbuild.mjs` containing `**/*.test.*`.
  - Verified via `npm pack --dry-run --json --ignore-scripts` that 0 test files and 0 development rewrite artifacts are present in the npm tarball.
  - Added `--ignore-scripts` to break lifecycle recursion between `prepack` and `verify`.
  - Asserted all required production assets are present in the actual npm inventory.
- **Testing**:
  - Added executable TSX smoke fixture (`src/ui/tsx-smoke.test.tsx`) asserting React 19 JSX compilation and execution under `node:test`.
  - Added toolchain and package invariants test suite (`src/tooling/package-invariants.test.ts`).
  - 41 tests passing (including 35 baseline tests, 1 TSX smoke test, and 5 package invariant tests). 0 failing.
- **Deterministic Installation and Cross-Platform Subprocesses**:
  - Created `.nvmrc` specifying `24.18.0`.
  - Added `scripts/lib/npm-invoke.mjs` with `spawnNpm()` executing `node <npm-cli.js>` directly for reliable cross-platform execution on Windows and Unix, capturing and reporting subprocess errors.
  - `scripts/install-ci.mjs` requires committed `package-lock.json` and runs `npm ci` strictly without repair or fallback.
  - Local verify gate in `scripts/package-check.mjs` validates `package-lock.json` bidirectionally against `package.json` and asserts resolved package entries match exact pinned versions.
  - Audited and updated CI matrix in `.github/workflows/ci.yml` across Ubuntu (with Node 24.18.0), Windows, and macOS on Node 24.
  - Added TS7 consumer declaration fixture verification in `scripts/package-check.mjs` compiling via package name `'ai-universal-coding-harness'` from an installed pack tarball.

## Stage 02 — Strict TypeScript Core and Domain Refactor

Status: Completed (Ready for review / stage gate)

- **Quality Commands (Measured Results)**:
  - `npm run format:check` — Oxfmt formatting verification passed (0 violations across 160 files).
  - `npm run lint` — Oxlint static analysis and automated rule fixture check (`scripts/verify-oxlint-rules.mjs`) passed (0 errors, all rule categories verified).
  - `npm run typecheck` — TypeScript 7 compiler verification under strict compilation (`"strict": true`, `"noImplicitAny": true`, `"noImplicitOverride": true` in `tsconfig.json`) passed (0 errors).
  - `npm test` — Fresh build compilation and unit test suite execution: 61 tests passing across 10 test suites (0 failures; 41 baseline tests + 20 new comprehensive tests).
  - `npm run test:cli` — CLI smoke execution passing across all verification scenarios.
  - `npm run verify` — Comprehensive quality gate passing (clean build, format check, lint, typecheck, unit tests, CLI smoke, bidirectional lockfile verification, and packaging consumer check).
  - `npm run check` — Standalone alias for `npm run verify` passed cleanly.
  - `npm pack --dry-run` — 167 files in package tarball inventory; 0 test files and 0 internal development artifacts.
- **Domain Types & Contracts**:
  - Semantic branded identifier types (`RunId`, `StageName`).
  - Strengthened `RunStatus`, `StageStatus`, `StagePhase` literal string unions.
  - Discriminated union types for `UiEvent` variants with generic fallback for backwards compatibility.
  - Structured evidence types replacing broad `any` across execution evidence.
- **Domain Error Hierarchy**:
  - Hierarchical domain errors subclassing `HarnessError`: `ConfigError`, `StageSourceError`, `GitLifecycleError`, `LockConflictError`, `RunStateError`, `ProcessExecutionError`.
  - Preserved underlying causes via `{ cause }`.
  - Rich metadata on `ProcessExecutionError` (`exitCode`, `signal`, `stdout`, `stderr`, `timedOut`).
  - Unit tests in `src/errors.test.ts`.
- **Modular Configuration**:
  - Decomposed configuration into `src/config/`: `types.ts`, `defaults.ts`, `paths.ts`, `env.ts`, `validation.ts`, `loader.ts`, `templates.ts`, `compat.ts`.
  - Authoritative camelCase `OrchestratorConfig` schema.
  - Backward compatibility adapter exporting `CONFIG` with uppercase getter Proxy.
  - `src/core/config.ts` maintained as re-export facade for backwards compatibility.
  - Comprehensive unit tests in `src/config/config.test.ts`.
- **Filesystem & Process Execution**:
  - Eliminated `any` in `src/core/fs.ts` and introduced `readJsonValidated<T>()`.
  - Strictly typed `ProcessResult` with `exitCode`, `signal`, `stdout`, `stderr`, `timedOut`, and backward-compatible `code` getter.
  - Added `timeoutMs` and `AbortSignal` cancellation support with process tree cleanup.
  - Comprehensive unit tests in `src/core/process.test.ts`.
- **Git, Project & State Resilience**:
  - Strictly typed `GitRepository` and `BranchManager` using `ProcessResult` and `GitLifecycleError`.
  - Runtime validation functions (`validateRunState`, `validateStageRuntimeState`) protecting against corrupted state JSON.
  - Strongly typed `RunLock` with PID liveness detection and `LockConflictError`.
  - Unit tests in `src/git/BranchManager.test.ts`, `src/project/ProjectWorkspace.test.ts`, `src/state/RunLock.test.ts`, and `src/state/RunStateStore.test.ts`.
- **Stages & Plan Coordinator**:
  - Structured stage validation and `StageSourceError` in `src/stages/StageSource.ts`.
  - Discriminated plan outcomes (`accepted`, `accepted_with_notes`, `needs_revision`) in `src/stages/PlanCoordinator.ts`.
  - Deduplication hash tracking and non-blocking advisory review budget semantics.
  - Unit tests in `src/stages/PlanCoordinator.test.ts`.
- **CLI Parsing & Dispatch Separation**:
  - Pure argument parser `parseCliArgs(argv: string[]): CliCommand` in `src/cli/parser.ts` returning discriminated union of commands.
  - Dedicated asynchronous command dispatcher in `src/cli/dispatch.ts`.
  - Streamlined `src/cli-main.ts` and `src/cli.ts` entry points.
  - Unit tests in `src/cli/parser.test.ts`.
- **Public API & Strict TS7 Configuration**:
  - Exported domain errors, types, configuration modules, and CLI parser/dispatchers in `src/index.ts`.
  - Unit tests in `src/index.test.ts` verifying all public exports.
  - Enabled `"strict": true`, `"noImplicitAny": true`, and `"noImplicitOverride": true` in `tsconfig.json`.
  - Updated `src/tooling/package-invariants.test.ts` to assert strict compiler flags.

## Stage 03 — Harness, Evidence and Recovery Hardening

Status: Completed (Ready for review / stage gate)

- **Quality Commands (Measured Results)**:
  - `npm run format:check` — Oxfmt formatting verification passed (0 violations across 178 files).
  - `npm run lint` — Oxlint static analysis and automated rule fixture check (`scripts/verify-oxlint-rules.mjs`) passed (0 errors, all 8 rule categories verified).
  - `npm run typecheck` — TypeScript 7 compiler verification under strict compilation (`tsc -p tsconfig.json --noEmit`) passed (0 errors).
  - `npm test` — Fresh build compilation and unit test suite execution: 109 tests passing across all test suites (0 failures).
  - `npm run test:cli` — CLI smoke execution passing across all verification scenarios.
  - `npm run verify` — Comprehensive quality gate passing (clean build, format check, lint, typecheck, unit tests, CLI smoke, bidirectional lockfile verification, and packaging consumer check).
  - `npm run check` — Standalone alias for `npm run verify` passed cleanly.
  - `npm pack --dry-run` — 184 files in package tarball inventory; 0 test files and 0 internal development artifacts.
- **Cursor ACP Protocol Modularization & Streaming Normalization**:
  - Decomposed monolithic Cursor executor into single-responsibility modules under `src/harness/cursor/`:
    - `types.ts`: Boundary types (`AccumulatedToolState`, `ProcessToolResult`, `ToolStatus`, `CommandConfidence`, `ParseAcpOptions`).
    - `AcpToolAccumulator.ts`: Manages multi-chunk tool calls keyed by `${sessionId}:${toolCallId}`, deep-merges partial `rawInput`/`rawOutput`, tracks mutation sequences, extracts exit codes across variants (`exitCode`, `exit_code`, `code`), and prevents inferring exit 0 on unstated completed status.
    - `AcpEventNormalizer.ts`: Safely routes and normalizes unknown JSON-RPC 2.0 messages from Cursor ACP into domain representations.
    - `ObservationJournal.ts`: Thread-safe in-memory cache and append-only persistence to `executor-observations.jsonl`.
    - `CursorAcpSession.ts` & `CursorExecutorHarness.ts`: Implements `ExecutorHarness` and `ExecutorSession` contracts.
  - Added comprehensive regression suite in `src/harness/cursor/acp-regression.test.ts`.
- **Evidence Integrity & EvidenceService**:
  - Hardened `EvidenceVerifier.ts` with `VerificationContext` (`quality_epoch_id`, `expected_patch_fingerprint`, `last_mutation_sequence`, `orchestrator_diff_check_ok`, `workspace`).
  - Added strict command normalization rejecting false-positive substring containment while supporting genuine shell wrappers (`bash -c`, `sh -c`, `cmd /c`, `powershell -Command`).
  - Enforced chronological evaluation: latest command execution is authoritative.
  - Disallowed autonomous permission broker executions (`source: 'broker'`) from validating quality evidence.
  - Created `EvidenceService.ts` extracting evidence lifecycle operations out of `Orchestrator.ts`.
  - Added comprehensive regression suite in `src/quality/evidence-integrity.test.ts`.
- **Codex Reviewer Modularization & Role Boundary Enforcement**:
  - Decomposed Codex reviewer harness into single-responsibility modules under `src/harness/codex/`:
    - `types.ts`: Typed options and decision models (`CodexDecisionKind`, `PromptBuilderOptions`, `CodexExecutionOptions`).
    - `CodexPromptBuilder.ts`: Builds structured Markdown prompts with frozen stage context and relevant skills digests.
    - `CodexProcessRunner.ts`: Executes ephemeral subprocesses in isolated git repositories with JSON-RPC stdio streaming.
    - `CodexEventParser.ts`: Parses event lines, accounts for token usage (`input`, `cached`, `output`), and detects role boundary violations (`file_change`, `mcp_tool_call`, `web_search`, `command_execution`).
    - `CodexResultParser.ts`: Reads, parses, and validates schema-conforming structured verdicts.
  - Added comprehensive test suite in `src/harness/codex/codex-reviewer.test.ts`.
- **Permission Engine Hardening**:
  - Hardened `CommandClassifier.ts` with cross-platform `pathInside` handling relative/absolute boundaries and Windows/POSIX separators.
  - Enforced non-negotiable hard dangerous command invariants (`hardDangerous`) even under `allow_all`.
  - Enforced non-fatal reviewer denials: individual denied commands reject the operation without terminating the stage.
  - Added test suite in `src/permissions/permission-hardening.test.ts`.
- **Recovery Hardening**:
  - Enhanced `RecoveryManager.ts` with dual recovery resume points based on provable evidence:
    - Resumes at `REVIEW` when corroborated green evidence matches the patch fingerprint and passes authoritative git diff check.
    - Resumes at `QUALITY` when evidence is missing, uncorroborated, or stale.
  - Built-in automatic timestamped backup generation (`run.backup.<timestamp>.json`, `stage-state.backup.<timestamp>.json`).
  - Automatic reconstruction of missing `executor-observations.jsonl` from historical `executor-acp.jsonl`.
  - Safe dry-run mode (`apply: false`) reporting planned transitions without filesystem modifications.
  - Added comprehensive test suite in `src/orchestrator/recovery-hardening.test.ts`.
- **Public API & Exports**:
  - Exported all new modular services and types in `src/index.ts`.
  - Verified public exports in `src/index.test.ts`.

## Stage 06 — Reviewer Routing, Fallback and Orchestrator Resilience

Status: Specified (pending implementation after Stage 03)

## Stage 04 — React 19 / Ink 7 UI and CLI Modernization

Status: Completed (Ready for review / stage gate)

- **Quality Commands (Measured Results)**:
  - `npm run format:check` — Oxfmt formatting verification passed (0 violations across 209 files).
  - `npm run lint` — Oxlint static analysis and automated rule fixture check (`scripts/verify-oxlint-rules.mjs`) passed (0 errors, all 8 rule categories verified).
  - `npm run typecheck` — TypeScript 7 compiler verification under strict compilation (`tsc -p tsconfig.json --noEmit`) passed (0 errors).
  - `npm test` — Fresh build compilation and unit test suite execution: 142 tests passing across all test suites (0 failures; 109 baseline tests + 33 new comprehensive UI tests).
  - `npm run test:cli` — CLI smoke execution passing across all verification scenarios.
  - `npm run verify` — Comprehensive quality gate passing (clean build, format check, lint, typecheck, unit tests, CLI smoke, bidirectional lockfile verification, and packaging consumer check).
  - `npm run check` — Standalone alias for `npm run verify` passed cleanly.
  - `npm pack --dry-run` — Packaging inventory verified; 0 test files and 0 internal development artifacts.
- **Modularity & TSX Migration**:
  - Removed legacy monolithic `src/ui/InkUi.ts` and its loosely typed `React.createElement` calls.
  - Added strictly typed `src/ui/types.ts` defining `UiState`, `UiMessage`, `UiTool`, `UiTodo`, `UiQualityDisplay`, `UiTokens`, `UiLogEntry`, `UiPanel`, `UiPhaseMap`, `StartInkUiOptions`, `FollowInkUiOptions`, and `InkUiInstance`.
  - Added pure text and glyph helpers in `src/ui/text.ts` (`normalizeOneLine`, `truncateText`, `wrapText`, `getPhaseIcon`, `getPhaseColor`, `getToolStatusIcon`, `getToolStatusColor`, `formatProgressBar`).
  - Added pure state machine reducer in `src/ui/reducer.ts` (`uiReducer`, `createInitialUiState`) with zero I/O and strict bounding (40 messages, 60 tools, 100 logs, 200,000 focus chars).
  - Added pure selectors in `src/ui/selectors.ts` (`selectActiveTask`, `selectTodoProgress`, `selectPhaseProgress`, `selectActiveAndRecentTools`, `selectRecentMessages`, `selectFocusContent`, `selectVisibleFocusLines`, `selectFormattedTodos`, `selectFormattedLogs`).
  - Added stream reading and tailing in `src/ui/eventFile.ts` (`readRecentEvents`, `followEventFile`) handling multi-chunk partial lines across polling intervals and skipping malformed JSON lines.
  - Created typed TSX components in `src/ui/components/`: `Header.tsx`, `FocusPreview.tsx`, `ToolActivity.tsx`, `Footer.tsx`, `ListPanel.tsx`, `FocusPanel.tsx`, `TodoPanel.tsx`, `ChangesPanel.tsx`, `LogsPanel.tsx`.
  - Created root React 19 / Ink 7 application in `src/ui/App.tsx` and runtime lifecycle runner in `src/ui/InkUi.tsx`.
- **Comprehensive Testing**:
  - Added reducer unit test suite in `src/ui/reducer.test.ts`.
  - Added selector unit test suite in `src/ui/selectors.test.ts`.
  - Added event file unit test suite in `src/ui/eventFile.test.ts`.
  - Added Ink render and keyboard interaction test suite in `src/ui/components.test.tsx` using `ink-testing-library` covering normal/compact/minimal layouts, modal panels (`f`, `t`, `d`, `l`, `q`, `Esc`), focus stream scrolling, and live event subscription.
- **Documentation**:
  - Added comprehensive top-of-file docblocks and TSDoc across all UI components, modules, functions, classes, interfaces, and types.
  - Updated existing `src/ui/layout.ts` and `src/ui/EventBus.ts` with complete top-of-file docblocks and explicit types.

## Stage 05 — Documentation, Test Completion and v2 Release

Status: Completed (Ready for release v2.0.0)

- **Quality Commands (Measured Results)**:
  - `npm run format:check` — Oxfmt formatting verification passed (0 violations across 221 files).
  - `npm run lint` — Oxlint static analysis and automated rule fixture check (`scripts/verify-oxlint-rules.mjs`) passed (0 errors, all 8 rule categories verified).
  - `npm run typecheck` — TypeScript 7 compiler verification (`tsc -p tsconfig.json --noEmit`) passed (0 errors).
  - `npm test` — Fresh build compilation and unit test suite execution: 219 tests passing across all test suites (0 failures).
  - `npm run test:coverage` — Native Node 24 test coverage gate passed: Line coverage 85.22% (threshold: 85%), Function coverage 88.30% (threshold: 85%), Branch coverage 80.19% (threshold: 80%).
  - `npm run test:cli` — CLI smoke execution passing across all verification scenarios.
  - `npm run verify` — Comprehensive quality gate passing (clean build, format check, lint, typecheck, coverage gate, CLI smoke, bidirectional lockfile verification, and packaging consumer check).
  - `npm run check` — Standalone alias for `npm run verify` passed cleanly.
  - `npm pack --dry-run` — Packaging inventory verified; 0 test files and 0 internal development artifacts.
- **Coverage Gates & Critical Invariants**:
  - Enforced native Node 24 coverage flags (`--experimental-test-coverage`, `--test-coverage-lines=85`, `--test-coverage-functions=85`, `--test-coverage-branches=80`) directly in `scripts/run-tests.mjs`.
  - Enforced coverage gate execution in `npm run test:coverage` and canonical `npm run verify`.
  - Critical subsystems independently verified exceeding thresholds: `src/permissions/**` (100% lines, 96.43% branches), `src/quality/**` (100% lines, 92.86% branches), `src/orchestrator/RecoveryManager.ts` (94.98% lines, 87.04% branches).
- **Deterministic Orchestrator Integration Suite**:
  - Added `src/orchestrator/orchestrator-integration.test.ts` validating complete stage lifecycles using scripted fake harnesses in temporary Git repositories:
    - Successful stage flow producing dedicated AI branch commit with proper trailer metadata.
    - Reviewer rework flow incrementing attempts, providing feedback, and achieving subsequent approval.
    - Idempotent resume flow reusing pre-approved plans without planning phase re-invocation.
    - Autonomous recovery flow routing corroborated evidence to `REVIEW` and uncorroborated evidence to `QUALITY`.
    - Permission volume resilience verifying 25+ permission requests without stage termination.
    - Review budget exhaustion consolidating findings into an approved fallback plan.
- **CLI Dispatch & Consumer Tarball Verification**:
  - Added unit test suite in `src/cli/dispatch.test.ts` verifying all CLI commands (`help`, `version`, `config`, `runs`, `list-stages`, `inspect`, `validate`, `status`, `tail`, `init`, `preflight`, `run`, `resume`, `recover`).
  - Expanded `scripts/package-check.mjs` with clean-environment consumer verification: packed tarball unpacking, runtime ESM import assertion, and full CLI subcommand execution (`--version`, `init`, `config show`, `validate`).
- **Core Test Gap Closures**:
  - Added unit test suites for `src/core/fs.test.ts`, `src/stages/context.test.ts`, `src/quality/EvidenceService.test.ts`, `src/ui/EventBus.test.ts`, `src/harness/cursor/AcpEventNormalizer.test.ts`, `src/harness/codex/CodexPromptBuilder.test.ts`, `src/harness/codex/CodexResultParser.test.ts`, `src/harness/cursor/CursorExecutorHarness.test.ts`, `src/harness/codex/CodexReviewerHarness.test.ts`, `src/harness/registry.test.ts`, `src/ui/text.test.ts`.
  - Expanded test suites for `ProjectWorkspace.test.ts`, `StageSource.test.ts`, `RecoveryManager.test.ts`, `PlanCoordinator.test.ts`, `BranchManager.test.ts`, `GitRepository.test.ts`, `PermissionEngine.test.ts`, `process.test.ts`, and `config.test.ts`.
- **Architectural Documentation & 7 Mermaid Diagrams**:
  - Updated all documentation files in `docs/` and root `README.md`.
  - Generated and integrated 7 architectural Mermaid diagrams:
    1. Package architecture & module boundaries (`docs/architecture.md`).
    2. Harness adapter boundary & contract decoupling (`docs/harnesses.md`).
    3. Run/stage lifecycle (`docs/execution-flow.md`).
    4. Autonomous permission decision flow (`docs/permissions.md`).
    5. Evidence & quality corroboration flow (`docs/execution-flow.md`).
    6. State persistence, resume, and recovery flow (`docs/state-and-resume.md`).
    7. UI semantic event stream & component rendering flow (`docs/ui.md`).
- **Codebase-wide Docblock Audit**:
  - Verified 100% `@fileoverview` header coverage across all TypeScript (`.ts`, `.tsx`) and script (`.mjs`) files in `src/` and `scripts/`.
  - Ensured comprehensive JSDoc/TSDoc annotations across all exported functions, methods, classes, interfaces, and types.
- **Release Metadata & Deprecations**:
  - Set version to `2.0.0` in `package.json`, `package-lock.json`, and `src/version.ts`.
  - Published comprehensive v2.0.0 entry in `CHANGELOG.md`.
  - Documented deprecation policies in `DECISIONS.md` for `AI_STAGE_*` environment variables, `.ai-stage-orchestrator.jsonc`, and internal uppercase config properties.

## Stage 06 — Reviewer Routing, Fallback and Orchestrator Resilience

Status: Completed (Ready for review / stage gate)

- **Quality Commands (Measured Results)**:
  - `npm run format:check` — Oxfmt formatting verification passed (0 violations across 270 files).
  - `npm run lint` — Oxlint static analysis and automated rule fixture check (`scripts/verify-oxlint-rules.mjs`) passed (0 errors, all 8 rule categories verified).
  - `npm run typecheck` — TypeScript 7 compiler verification (`tsc -p tsconfig.json --noEmit`) passed (0 errors).
  - `npm test` — Fresh build compilation and unit test suite execution: 249 tests passing across all test suites (0 failures).
  - `npm run test:coverage` — Native Node 24 test coverage gate passed: Line coverage 86.85% (threshold: 85%), Function coverage 88.71% (threshold: 85%), Branch coverage 80.35% (threshold: 80%).
  - `npm run test:cli` — CLI smoke execution passing across all verification scenarios.
  - `npm run verify` — Comprehensive quality gate passing (clean build, format check, lint, typecheck, coverage gate, CLI smoke, bidirectional lockfile verification, and packaging consumer check).
  - `npm run check` — Standalone alias for `npm run verify` passed cleanly.
  - `npm pack --dry-run` — Packaging inventory verified; 0 test files and 0 internal development artifacts.
- **Reviewer Contracts & Configuration**:
  - Defined reviewer roles (`primary`, `fallback`, `large_diff`, `permission`) and triggers (`usage_limit`, `rate_limit`, `quota_exhausted`, `process_crash`, `timeout`, `turn_failed`, `no_result`) in `src/harness/types.ts`.
  - Added `ReviewerModelConfig`, `ReviewerRouterConfig`, and `ReviewerFallbackMetadata` contracts.
  - Updated `FinalVerdict`, `PlanReviewVerdict`, and `QuestionVerdict` with optional `_orchestrator_meta` fallback provenance.
  - Added `reviewer` configuration in `src/config/types.ts`, defaults in `src/config/defaults.ts`, and validation with bounds clamping in `src/config/validation.ts`.
- **Reviewer Error Classification**:
  - Implemented `ReviewerErrorClassifier` in `src/harness/ReviewerErrorClassifier.ts`.
  - Accurately classifies provider usage limits, rate limits, quota limits, timeout, crashes without result, and turn failure events from exit code, stderr, event streams, and error objects.
  - Tested with real fixture from incident run `20260915T193118Z-76e14b` in `src/harness/ReviewerErrorClassifier.test.ts`.
- **Cursor Reviewer Harness Adapter**:
  - Implemented `CursorReviewerHarness` in `src/harness/cursor/CursorReviewerHarness.ts` implementing `ReviewerHarness`.
  - Enforces ephemeral sandbox execution (`--sandbox enabled`, `--mode plan`, `--trust`), schema-enforced prompt instructions, and verdict validation via `validateReviewerVerdict`.
  - Implemented robust `extractJsonFromText` parsing direct JSON, code fences, and wrapped JSON responses.
  - Registered `cursor` reviewer in `HarnessRegistry`.
- **Review Payload Builder**:
  - Implemented `ReviewPayloadBuilder` in `src/orchestrator/services/ReviewPayloadBuilder.ts`.
  - Calculates diff metrics (`char_count`, `estimated_tokens`, `truncated`, `original_chars`).
  - Preserves complete `diff_stat` and `changed_files` lists even when truncated.
  - Prioritizes files requested in prior `NEEDS_CONTEXT` reviewer verdicts.
- **Reviewer Router**:
  - Implemented `ReviewerRouter` in `src/orchestrator/services/ReviewerRouter.ts` implementing `ReviewerHarness`.
  - Dynamically dispatches permission requests to `permission`, large diffs exceeding threshold to `large_diff`, and general plan/verdicts to `primary`.
  - Wraps execution in `executeWithFallback` to intercept failures matching triggers, emit `reviewer.fallback` UI telemetry, invoke fallback reviewer, and annotate results with `_orchestrator_meta`.
  - Composite multi-role preflight reporting.
- **Orchestrator Resilience & UI Integration**:
  - Preserves stage state with `phase: 'review'` before invoking review in `src/orchestrator/Orchestrator.ts`.
  - Classifies quota/rate/usage failures as `external_dependency` and process crashes/timeouts as `retryable_error` in `classifyError`.
  - Handles `reviewer.fallback` event in UI reducer `src/ui/reducer.ts` and formats in `src/ui/EventBus.ts`.
  - End-to-end integration test in `src/orchestrator/orchestrator-integration.test.ts` verifying failover on usage limits, event emission, and metadata persistence.
