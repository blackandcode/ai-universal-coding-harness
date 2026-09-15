# Rewrite Implementation Status

## Stage 01 — Modern Toolchain and Quality Foundation

Status: In Progress (Gap closure ready for review / stage gate)

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

Status: Not started

## Stage 03 — Harness, Evidence and Recovery Hardening

Status: Not started

## Stage 06 — Reviewer Routing, Fallback and Orchestrator Resilience

Status: Specified (pending implementation after Stage 03)

## Stage 04 — React 19 / Ink 7 UI and CLI Modernization

Status: Not started

## Stage 05 — Documentation, Test Completion and v2 Release

Status: Not started
