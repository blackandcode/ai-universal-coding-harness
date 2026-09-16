# Changelog

All notable changes to this project are documented here. The project follows Semantic Versioning.

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
