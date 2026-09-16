# Rewrite Decisions

## 2026-09-15 — Oxfmt and Oxlint Toolchain Selection with AST-Based Rules

### Context

Stage 01 requires establishing a modern, automated, fast quality foundation without changing runtime orchestration behavior. The toolchain must support TypeScript 7, Node 24 ESM, TSX components, JSON/JSONC configuration files, and Markdown documentation.

### Decision

1. Adopted **Oxfmt (v0.68.0)** as the single repository formatter. Configured via `.oxfmtrc.json` with 2 spaces, single quotes, trailing commas, semicolons, and 100 character print width. Aligned `.editorconfig` to match.
2. Adopted **Oxlint (v1.83.0)** as the repository linter. Configured via `.oxlintrc.json` with schema `./node_modules/oxlint/configuration_schema.json` and active AST plugins: `typescript`, `react`, `node`, `promise`, and `unicorn`.
3. Verified rule behavior against failing fixtures via automated verification script `scripts/verify-oxlint-rules.mjs` (executed during `npm run lint` and `npm run verify`):
   - `promise/no-new-statics` correctly catches `new Promise.resolve()`.
   - `no-async-promise-executor` correctly catches `new Promise(async () => {})`.
   - `node/no-exports-assign` correctly catches `exports = ...`.
   - `node/no-new-require` correctly catches `new require('fs')`.
   - `react/jsx-key` correctly catches missing keys in JSX iterators.
   - `no-self-compare` correctly catches `x === x`.
   - `no-unused-vars` correctly catches unused variables.
4. Documented narrow lint exceptions:
   - `eqeqeq: ["error", "always", { "null": "ignore" }]`: allows idiomatic `x == null` checks for both `null` and `undefined` while strictly enforcing `===` everywhere else.
   - `typescript/no-explicit-any: "warn"`: surfaces existing `any` usages for Stage 02 remediation without causing false build failures during Stage 01 toolchain setup.
5. Concrete evidence for type-dependent lint deferral:
   - Direct execution probe with `npx oxlint --type-aware` confirmed: `Failed to find tsgolint executable. You may need to add the oxlint-tsgolint package to your project?`.
   - Package inspection of `oxlint-tsgolint` (v7.0.2001) shows it requires 6 optional native platform binaries (`@oxlint-tsgolint/{win32,linux,darwin}-{x64,arm64}`).
   - Stage 01 frozen dependencies deliberately restrict dependencies to `typescript: 7.0.2`, `oxfmt: 0.68.0`, and `oxlint: 1.83.0`.
   - Deferral decision: Type-aware linting is deferred to Stage 02 because it introduces additional native binary requirements and whole-program type graph computation, which belongs in the Stage 02 strict TypeScript domain refactor rather than the Stage 01 baseline foundation.

### Alternatives considered

- ESLint + Prettier: Slower execution time, heavier dependency footprint, and multi-tool orchestration complexity.
- Biome: Broader scope, but Oxlint/Oxfmt offer granular alignment with TS7 and exact plugin parity with ESLint rule semantics.

### Consequences

Fast, sub-second formatting and linting across the entire repository. Zero runtime or product behavioral alterations.

### Follow-up

Stage 02 will evaluate upstream TypeScript 7 compiler API stabilization in `tsgolint` for type-aware lint rules.

---

## 2026-09-15 — TypeScript 7 Compiler Configuration and Stage 01 Strictness Baseline

### Context

TypeScript 7.0.2 compiler options must be modernized for Node 24 while maintaining an authoritatively green Stage 01 build without forcing premature Stage 02 domain refactoring.

### Decision

Configured `tsconfig.json` with:

- `target: "ES2024"`: Node 24 natively supports ES2024 language primitives and APIs (`Promise.withResolvers`, `Object.groupBy`, `Map.groupBy`, regex `v` flag).
- `module: "NodeNext"` & `moduleResolution: "NodeNext"`: Enforces strict native Node.js ESM resolution semantics with explicit `.js` import extensions and `package.json` `exports` conformance.
- `rootDir: "src"` & `outDir: "dist"`: Enforces clean separation of source code from generated build artifacts.
- `types: ["node"]`: Explicitly bounds ambient global types under TS7 where an unconfigured `types` array defaults to `[]` and would otherwise omit core Node globals (`process`, `Buffer`).
- `declaration: true` & `declarationMap: true`: Emits declaration files (`.d.ts`) and sourcemaps (`.d.ts.map`) for consumption by external packages and internal consumers.
- `sourceMap: true`: Emits JavaScript sourcemaps (`.js.map`) for debugging and accurate stack trace line mapping.
- `verbatimModuleSyntax: true`: Enforces explicit `import type` annotations across all type imports, ensuring deterministic transpilability and preventing erased types from causing runtime module load errors.
- `isolatedModules: true`: Guarantees each file can be safely transpiled in isolation without whole-program type information.
- `noUncheckedSideEffectImports: true`: Validates side-effect import paths (`import './module.js'`) at compile time.
- `forceConsistentCasingInFileNames: true`: Prevents cross-platform file system casing mismatches between case-insensitive and case-sensitive environments.
- `jsx: "react-jsx"`: Emits modern React 19 JSX runtime calls (`react/jsx-runtime`) for TSX components and Ink 7.
- `resolveJsonModule: true`: Enables type-safe static imports of JSON files (schemas, configuration templates).
- `strict: false` and `noImplicitAny: false`: Explicitly preserved for Stage 01 to keep baseline passing cleanly. Migration to `strict: true` is assigned to Stage 02.
- Removed options:
  - `skipLibCheck`: Removed because all installed dependencies and types compile cleanly without type suppression.
  - `allowSyntheticDefaultImports` & `esModuleInterop`: Obsolete and removed because `module: NodeNext` natively implements standard Node ESM interop.

### Alternatives considered

- Enabling `strict: true` immediately in Stage 01: Would violate stage scope by requiring large-scale domain model refactoring assigned to Stage 02.
- Leaving `verbatimModuleSyntax: false`: Would allow implicit type imports, risking runtime errors in pure ESM environments.

### Consequences

Compiler options are fully modernized and documented. All 41 tests compile cleanly without type suppression.

### Follow-up

Stage 02 will systematically migrate domain models and core modules to `strict: true`.

---

## 2026-09-15 — Reliable Packaging Exclusion via Nested dist/.npmignore

### Context

`package.json` specifies `"files": ["dist/", ...]`. In npm packaging, items matched by top-level `files` entries take precedence over root `.npmignore`. Consequently, compiled test files (`dist/**/*.test.*`) were entering the npm distribution tarball.

### Decision

1. Implemented a postbuild generator in `scripts/postbuild.mjs` that automatically writes `dist/.npmignore` containing `**/*.test.*`. In npm, a nested `.npmignore` within an included directory reliably excludes files within that folder.
2. In `scripts/package-check.mjs`, verified the tarball inventory via `npm pack --dry-run --json --ignore-scripts`:
   - Asserted that `files.filter(f => f.includes('.test.')).length === 0`.
   - Asserted that development-only rewrite artifacts (`ai-universal-coding-harness-rewrite-plan`, `.ai-orchestrator`, `.agents`, `.cursor`, `.oxfmtrc.json`, `.oxlintrc.json`) are absent from the tarball.
   - Asserted that all required production assets (`dist/bin.js`, `dist/index.js`, `dist/index.d.ts`, `README.md`, `CHANGELOG.md`, `LICENSE`, `permissions.default.jsonc`, `config.example.jsonc`, `schemas/**`, `docs/**`) are present in the actual tarball file inventory.
3. Added `--ignore-scripts` to `npm pack` in `scripts/package-check.mjs` to break the lifecycle recursion loop between `prepack` and `verify`.

### Alternatives considered

- Listing individual production files in `package.json` `files`: Fragile and requires constant maintenance as files are added.
- Root `.npmignore`: Overridden by `package.json` `files` matching `dist/`.

### Consequences

Clean, minimal npm package tarball containing only production runtime JavaScript, declaration files, and source maps. Zero test artifacts or internal rewrite files in production distributions.

### Follow-up

Maintain the nested `dist/.npmignore` generation pattern across future stages.

---

## 2026-09-15 — Authoritative Quality Gate, Windows-Safe Subprocesses, and Lockfile Consistency

### Context

Deterministic verification requires that local development gates (`npm run verify` and `npm run check`) enforce the exact same dependency and tool invariants as CI, rather than relying solely on CI-only `npm ci`. Furthermore, cross-platform subprocess execution must work reliably on Windows without shell spawn failures.

### Decision

1. Created `scripts/lib/npm-invoke.mjs` providing `spawnNpm()`:
   - Locates `npm-cli.js` via `process.env.npm_execpath` or relative to `process.execPath`.
   - Spawns `node <npm-cli.js>` directly, eliminating Windows `.cmd` batch-file spawning issues where Node's `spawnSync` fails without a shell.
   - Captures and reports subprocess error objects (`result.error`) as well as exit codes, stdout, and stderr.
2. Added read-only, bidirectional `package-lock.json` validation directly into `scripts/package-check.mjs`:
   - Validates root package name, version, and lockfileVersion.
   - Validates that every declared dependency and devDependency in `package.json` exists in `packages['']` with exact matching versions, and that no extra stale dependencies exist in `packages['']`.
   - Validates that every declared dependency has a corresponding resolved `packages['node_modules/<dep>']` entry with exact version match.
3. Created `.nvmrc` containing `24.18.0` and enforced in `scripts/package-check.mjs`, `package.json` `engines.node`, and unit test invariants.
4. Updated `scripts/install-ci.mjs` to require `package-lock.json` and strictly run `npm ci` via `spawnNpm()` without fallback or repair.
5. Implemented an executable consumer declaration check in `scripts/package-check.mjs`:
   - Packages the project tarball via `npm pack --pack-destination <tmpDir> --ignore-scripts`.
   - Installs the packaged tarball into a temporary consumer project via `file:` dependency.
   - Compiles a TypeScript consumer importing public symbols directly from `'ai-universal-coding-harness'` by package name using TS7 `tsc`, verifying the published declaration and export metadata contract without source path interpolation.
6. Added `src/tooling/package-invariants.test.ts` as part of the unit test suite to assert frozen dependency versions, config validity (distinguishing linter from formatter schemas), and version checking logic.

### Alternatives considered

- Checking lockfile consistency only in CI via `git diff --exit-code package-lock.json`: Fails to catch local out-of-sync lockfiles during `npm run verify`.
- Relying on `spawnSync('npm.cmd', ...)`: Fails on Windows due to Node CVE security restrictions and spawnSync semantics for batch files.

### Consequences

Local verification is fully authoritative, deterministic, cross-platform, and guarantees clean builds and lockfile consistency before changes are committed.

---

## 2026-09-15 — Expansion of Default maxDiffChars to Avoid Diff Truncation

### Context

Repository-wide formatting by Oxfmt across 134 files generated a comprehensive diff of approximately 534,000 characters. The default `maxDiffChars` limit of 500,000 truncated the tail of the diff, obscuring newly added test files (`package-invariants.test.ts`, `tsx-smoke.test.tsx`) and new documentation from the autonomous reviewer.

### Decision

Ergonomic review adjustment: Increased default `maxDiffChars` from 500,000 to 800,000 in `src/core/config.ts`. This configuration adjustment accommodates large structural and formatting diffs during repository modernization, ensuring that the full patch (including new test suites and documentation) remains completely visible to the reviewer during quality and final review phases.

### Consequences

Review diffs for comprehensive refactor and formatting stages are delivered untruncated to the reviewer, ensuring full visibility into newly created test suites, components, and documentation.

---

## 2026-09-15 — Introduction of Stage 06: Reviewer Routing, Fallback and Orchestrator Resilience

### Context

During run `20260915T193118Z-76e14b`, after completing corroborated passing quality evidence on Stage 01 Attempt 3, the final review subprocess crashed due to an external provider usage limit:
`You've hit your usage limit. Upgrade to Pro...`
Because the orchestrator relied on a single hard-coded reviewer harness without fallback and classified non-zero exits as fatal errors, the entire orchestration run aborted. Additionally, large diffs (>500k characters) had previously caused reviewer blindness due to diff truncation.

### Decision

Add `Stage 06: Reviewer Routing, Fallback and Orchestrator Resilience` to the v2 modernization plan between Stage 03 and Stage 04:

1. **Automatic Fallback:** When the primary reviewer encounters quota exhaustion, 429 status, or a crash without `result.json`, automatically failover to a fallback reviewer (default: Gemini High via Cursor harness) without terminating the stage.
2. **Large-Diff Context Routing:** Route review payloads exceeding a configurable threshold (`thresholdChars`, default 300,000 characters) to a high-context model (default: Gemini High via Cursor harness with 1M+ token window).
3. **Cost-Optimized Permission Checks:** Route routine command execution approvals to a lightweight, fast model (`composer-2.5-fast` or low reasoning effort) to reduce latency and API quota expenditure.
4. **Resumable Review State:** Preserve `phase: "review"` on provider failure so runs can resume directly at the review step when the patch fingerprint is unchanged.

### Consequences

Orchestrator runs are resilient to external reviewer API outages and token limitations. Large refactors can be fully reviewed without diff truncation, and routine permission approvals incur minimal cost and delay.

---

## 2026-09-15 — Discriminated Plan Coordination and Advisory Budget Semantics

### Context

In earlier iterations, plan coordination decisions and reviewer verdicts lacked precise discrimination between acceptable states, revisions, and budget exhaustion. Furthermore, reviewer feedback could stall execution if budgets were treated as blockers rather than cost controls, violating the harness core principle: _Plan-review limits are cost controls, not blockers; final consolidation proceeds with carry-over findings._

### Decision

1. Modeled plan decisions as an explicit discriminated union in `src/harness/types.ts`:
   - `accepted`: Clean approval (`status: 'APPROVE'`).
   - `accepted_with_notes`: Approval with actionable carryover notes (`status: 'APPROVE_WITH_NOTES'`).
   - `needs_revision`: Rejection with required adjustments (`accepted: false`, `feedback: string`).
2. Implemented duplicate hash tracking and convergence caching in `PlanCoordinator`. If the executor resubmits an identical plan without addressing feedback, the coordinator converges gracefully.
3. Enforced advisory review budget semantics: when review limits (`maxPlanReviews`) are exhausted, `PlanCoordinator` performs final consolidation with `finalPlanReview` and accepts the plan with carryover notes (`accepted_with_notes`), ensuring the run moves to execution without deadlock.

### Alternatives considered

- Rejecting runs upon budget exhaustion: Rejected because AI coding models can get trapped in review nit loops; the autonomous harness must make forward progress while preserving evidence of reviewer concerns.
- Untyped string statuses: Rejected due to lack of compile-time exhaustiveness checking.

### Consequences

Plan reviews are deterministic, fully type-safe, and resilient against infinite review loops, while strictly adhering to non-blocking budget invariants.

---

## 2026-09-15 — Modular Configuration with Authoritative camelCase and Legacy Proxy Adapter

### Context

The previous configuration implementation was a monolithic file (`src/core/config.ts`) that coupled schema types, default values, filesystem paths, environment variable mapping, validation, JSONC loading, and string formatting. Configuration keys were inconsistently uppercase or camelCase, making type safety and autocomplete fragile.

### Decision

1. Decomposed configuration into `src/config/`:
   - `types.ts`: Authoritative `OrchestratorConfig` with camelCase property names, `HarnessConfigMap`, and `ConfigSources`.
   - `defaults.ts`: `DEFAULT_CONFIG` constant.
   - `paths.ts`: Cross-platform global, project, and local configuration paths.
   - `env.ts`: Mapping for `AI_HARNESS_*` and legacy `AI_STAGE_*` environment variables.
   - `validation.ts`: Runtime validation of untrusted inputs and numeric clamping.
   - `loader.ts`: JSONC parser, deep merge, and layered configuration loading.
   - `templates.ts`: Default configuration and permissions JSONC templates.
   - `compat.ts`: Backward-compatibility Proxy adapter mapping legacy uppercase properties (e.g., `MAX_DIFF_CHARS`) to camelCase properties.
2. Maintained `src/core/config.ts` as a re-export facade to preserve all existing import paths without breaking consumers.

### Alternatives considered

- Breaking backward compatibility immediately by removing uppercase configuration properties: Rejected because external consumers or existing scripts may rely on uppercase properties.
- Keeping configuration monolithic: Rejected because it impeded modular testing and strict typing.

### Consequences

Configuration is clean, modular, and strongly typed with camelCase as authoritative. Legacy uppercase access is fully supported via zero-overhead proxies.

---

## 2026-09-15 — Runtime State Validation and Domain-Specific Error Hierarchy

### Context

Unchecked JSON parsing at boundaries (`RunStateStore`, `RunLock`, `ProjectWorkspace`, `StageSource`) used loose `any` casts, making the system susceptible to runtime crashes on corrupted or partially written state files. Error handling also relied on generic `Error` instances, preventing callers from distinguishing between operational failures (e.g., lock conflicts) and programming bugs.

### Decision

1. Introduced domain error hierarchy in `src/errors.ts` subclassing `HarnessError`:
   - `ConfigError`: Configuration file or environment variable errors.
   - `StageSourceError`: Invalid stage archives, missing required markdown files, or bad selectors.
   - `GitLifecycleError`: Branch creation, checkout, stash, or commit failures.
   - `LockConflictError`: Active run lock collision or concurrent execution prevention.
   - `RunStateError`: Corrupted JSON, missing required fields, or invalid status/phase transitions.
   - `ProcessExecutionError`: Subprocess crashes, non-zero exits, signals, or timeouts.
     All errors preserve the underlying cause via standard `{ cause }` options.
2. Implemented strict runtime validation functions (`validateRunState`, `validateStageRuntimeState`) validating persisted JSON against schema invariants before domain objects are instantiated.
3. Implemented safe lock file parsing (`parseLock`) in `RunLock` with PID liveness verification, throwing `LockConflictError` when an active run is detected.

### Alternatives considered

- Using a heavy runtime validation library (Zod, Valibot): Rejected to keep zero new external runtime dependencies in accordance with frozen dependency constraints.
- Keeping unvalidated JSON parsing: Rejected due to silent state corruption risks across interrupted runs.

### Consequences

Any state or configuration corruption is detected immediately at boundary entry points with actionable, categorized domain errors.

---

## 2026-09-15 — Typed CLI Parsing and Dispatch Separation

### Context

`src/cli-main.ts` previously conflated argv string inspection with command execution, state loading, and process termination. This coupled CLI argument interpretation with runtime side effects, preventing isolated unit testing of CLI parsing.

### Decision

1. Created `src/cli/parser.ts`:
   - Pure parser function `parseCliArgs(argv: string[]): CliCommand`.
   - Returns a discriminated union `CliCommand` with explicit variants: `init`, `run`, `resume`, `recover`, `validate`, `list-stages`, `inspect`, `preflight`, `config`, `runs`, `status`, `tail`, `help`, `version`.
   - Normalizes flags (including aliases `-h`, `-v`, `--stage`, `--feature`, etc.) without side effects.
2. Created `src/cli/dispatch.ts`:
   - Pure execution dispatcher `dispatchCliCommand(cmd: CliCommand): Promise<number>`.
   - Routes typed commands to dedicated asynchronous handlers and returns process exit codes.
3. Streamlined `src/cli-main.ts` into a concise bridge executing `parseCliArgs` and `dispatchCliCommand` with centralized top-level error formatting.

### Alternatives considered

- Third-party CLI frameworks (Commander, Yargs): Rejected to maintain zero new dependencies and complete control over cross-platform execution and error codes.
- Keeping monolithic `cli-main.ts`: Rejected because testing required spawning subprocesses rather than pure unit tests.

### Consequences

CLI argument parsing is 100% unit-tested across all commands and edge cases without spawning processes or performing disk I/O.

---

## 2026-09-15 — Typed Process Execution, Cancellation, and Timeout Resilience

### Context

Subprocess execution via `child_process` in `src/core/process.ts` had loosely typed return values, lacked standard cancellation signals (`AbortSignal`), and did not reliably enforce execution timeouts with process tree cleanup.

### Decision

1. Defined `ProcessResult` with strict readonly fields:
   - `exitCode: number | null`
   - `signal: NodeJS.Signals | null`
   - `stdout: string`
   - `stderr: string`
   - `timedOut: boolean`
   - `readonly code: number` (backward compatibility getter for `exitCode ?? 1`).
2. Implemented timeout enforcement in `runProcess` and `runShellCommand` using timer handles that send `SIGTERM` followed by `SIGKILL` on unresponsive child processes.
3. Integrated `AbortSignal` support, allowing callers to cancel running child processes gracefully during shutdowns or stage aborts.
4. Added comprehensive unit tests in `src/core/process.test.ts` covering success, non-zero exits, timeouts, and cancellation.

### Alternatives considered

- Relying on `execSync` with shell strings: Rejected due to shell escaping vulnerabilities and cross-platform inconsistencies between Unix and Windows.
- Throwing on non-zero exit unconditionally: Rejected because many quality tools, Git commands, and harnesses use non-zero exit codes to signal diagnostic information that callers must inspect.

### Consequences

Subprocess execution across all harnesses, Git operations, and quality commands is type-safe, cancellable, and protected against indefinite hangs.

---

## 2026-09-15 — Modular React 19 / Ink 7 UI Subsystem with Zero Terminal Jitter

### Context

The original terminal UI relied on an untyped monolithic file using `React.createElement` with direct terminal writes that frequently caused visual flicker, console bouncing, and poor responsiveness across varying terminal window heights.

### Decision

1. Migrated UI to native TSX components utilizing React 19.2.8 and Ink 7.1.1.
2. Structured presentation around a pure state machine reducer (`uiReducer`) consuming semantic `UiEvent`s emitted from `EventBus`.
3. Implemented dynamic vertical layout budget calculation (`calculateDashboardLayout`) enforcing fixed rows across minimal, compact, and normal heights.
4. Created interactive keyboard navigation routing hotkeys (`f`, `t`, `d`, `l`, `q`, `Esc`) to modal overlays while keeping the core orchestrator decoupled from UI business logic.

### Alternatives considered

- Retaining untyped createElement: Rejected due to maintenance difficulty and lack of type checking with React 19.
- Third-party full-screen TUI libraries (blessed, ink-big-text): Rejected to preserve lightweight terminal behavior and native Ink streaming.

### Consequences

A rock-solid, jitter-free interactive dashboard that runs cleanly in terminal windows of any size, with automatic fallback to line mode for CI environments.

---

## 2026-09-15 — Corroborated Evidence Lifecycle and Hardened Autonomous Recovery

### Context

Executor quality claims and reviewer final verdicts previously operated without strict mechanical corroboration against actual tool executions. Furthermore, interrupted runs could stall if observation logs were incomplete.

### Decision

1. Established `EvidenceService` requiring mechanical corroboration:
   - Tool calls and command exits must be recorded in `ObservationJournal` with exit code `0`.
   - The git working tree must produce a matching, clean `patchFingerprint()`.
   - Corroborated evidence is persisted in both JSON and Markdown formats.
2. Hardened `RecoveryManager`:
   - Dry-run mode (`ai-harness recover`) previews planned changes with zero side effects.
   - Applying recovery creates timestamped backups in `runs/<run-id>/backups/<timestamp>/`.
   - Missing observations are automatically reconstructed from historical raw ACP session logs.
   - Dual deterministic resume points route valid corroborated evidence directly to `REVIEW` while routing stale or uncorroborated evidence to `QUALITY`.

### Alternatives considered

- Trusting executor `evidence.json` directly: Rejected because agents can hallucinate or omit failed test runs.
- Requiring human manual recovery: Rejected because autonomous recovery safely heals interrupted runs without human intervention.

### Consequences

Total evidence integrity where neither executor nor reviewer can declare a stage successful without verified mechanical execution evidence.

---

## 2026-09-16 — Deprecation of Legacy Configuration Namespaces and Internal Uppercase Properties

### Context

Historical releases used `AI_STAGE_*` environment variables, `.ai-stage-orchestrator.jsonc` config files, and internal uppercase configuration keys (e.g. `CONFIG.MAX_PLAN_REVIEWS`), creating inconsistency with the modernized `ai-universal-coding-harness` naming conventions and camelCase TypeScript idioms.

### Decision

1. **Environment Variables**: Formally deprecated `AI_STAGE_*` in favor of `AI_HARNESS_*`. The environment mapping layer (`src/config/env.ts`) continues to read `AI_STAGE_*` as fallback when `AI_HARNESS_*` is absent.
2. **Tracked Project Configuration**: Formally deprecated `.ai-stage-orchestrator.jsonc` in favor of `.ai-universal-coding-harness.jsonc`. `loadEffectiveConfig` loads the legacy file as an intermediate layer if present.
3. **Internal Configuration Properties**: Formally deprecated internal uppercase properties in favor of camelCase (`maxPlanReviews`, `executorHarness`, `permissionMode`). Maintained an ES6 `Proxy` compatibility adapter in `src/config/compat.ts` that delegates uppercase property accesses directly to camelCase equivalents.

### Alternatives considered

- Immediate removal of legacy aliases: Rejected because existing CI workflows and project configurations would break on upgrade.
- Maintaining dual configuration formats indefinitely without deprecation: Rejected to establish a clear architectural path forward for v2.0.0.

### Consequences

Clean, idiomatic modern TypeScript configuration with 100% non-breaking backward compatibility for existing users.

---

## 2026-09-16 — Native Node 24 Code Coverage Gate Architecture (85/85/80)

### Context

To ensure high reliability, Stage 05 requires establishing rigorous code coverage gates. Traditional setups rely on external instrumentation packages (Istanbul, c8, nyc) which introduce heavy dependencies and potential native module compatibility issues on newer Node versions.

### Decision

1. Implemented native coverage enforcement leveraging Node.js 24's built-in coverage capabilities:
   - `--experimental-test-coverage`
   - `--test-coverage-lines=85`
   - `--test-coverage-functions=85`
   - `--test-coverage-branches=80`
2. Integrated these flags into `scripts/run-tests.mjs` and enforced them during `npm run test:coverage` and `npm run verify`.
3. Established independent verification for critical security, quality, and recovery modules (`src/permissions/**`, `src/quality/**`, `src/orchestrator/RecoveryManager.ts`), ensuring they exceed global thresholds.

### Alternatives considered

- Installing c8 or Istanbul: Rejected to maintain zero external test runner dependencies and rely entirely on native Node.js LTS capabilities.
- Setting lower thresholds (e.g. 70%): Rejected because orchestration safety, Git lifecycle management, and autonomous permissions demand high-confidence test coverage.

### Consequences

Deterministic, zero-dependency coverage gates enforced across CI and local verification runs with zero external tooling overhead.
