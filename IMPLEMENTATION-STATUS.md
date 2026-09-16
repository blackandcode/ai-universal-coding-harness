# Implementation Status

This document tracks the authoritative implementation status, architectural milestones, quality gates, and modernization roadmap for AI Universal Coding Harness.

## 1. Project & Release Baseline

- **Current Release**: `2.2.0`
- **Node Runtime Target**: `>=24.18.0` (specified in `package.json`, `.nvmrc`, and enforced by runtime checks)
- **TypeScript Baseline**: TypeScript 7 (`ES2024`, `NodeNext` modules, strict mode)
- **Linting & Formatting**: Oxlint (with invariant rules) and Oxfmt
- **Test Runner & Coverage**: Built-in Node.js 24 test runner (`node:test`) and native coverage (`--experimental-test-coverage`) with zero external test libraries

---

## 2. Core Subsystems & Architecture

The codebase enforces strict harness-neutral orchestration boundaries:

- **Orchestration Flow (`src/orchestrator/`)**: Owns stage workflow state machine, execution transitions, and branch/stage lifecycle.
- **Harness Adapters (`src/harness/`)**:
  - `src/harness/cursor/`: Cursor ACP transport (`CursorAcpTransport`), protocol event decoding (`AcpEventDecoder`), and semantic observation journal (`ObservationJournal`).
  - `src/harness/codex/`: Codex review harness and execution adapters.
- **Permissions & Security Sandboxing (`src/permissions/`)**: Autonomous command classifier (`CommandClassifier`) and hierarchical permission engine (`PermissionEngine`) enforcing workspace boundaries and denying hard-dangerous operations.
- **Quality & Mechanical Corroboration (`src/quality/`)**: Verifies executor claims against observed ACP command events (`EvidenceVerifier`, `EvidenceService`) across execution attempts, epochs, and patch fingerprints.
- **Git Lifecycle Safety (`src/git/`)**: Dedicated branch management (`ai-harness/<run-id>`), commit per approved stage, patch fingerprint calculation, and working tree safety. Never pushes or merges automatically.
- **State Persistence & Recovery (`src/state/`, `src/orchestrator/RecoveryManager.ts`)**: Deep schema validation for run and stage manifests (`RunStateStore`), durable locking, dry-run recovery previews, and deterministic routing between `review` and `quality`.
- **Terminal User Interface (`src/ui/`)**: React 19 + Ink 7 presentation layer consuming semantic harness events without managing orchestration business state.

---

## 3. Modernization Gap Closure Roadmap

| Stage        | Focus Area                                    | Status        | Key Deliverables                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | --------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stage 01** | Complete Type and Protocol Boundaries         | **Completed** | ADR-0001, `CursorAcpTransport`, `AcpEventDecoder`, zero production `any`, strict JSON-RPC session handling.                                                                                                                                                                                                                                                                                                           |
| **Stage 02** | Evidence, State, and Recovery Trust Hardening | **Completed** | ADR-0002, durable `quality_epoch_id` markers, unified corroboration standards without resume bypass, strict patch fingerprint matching, deep recursive state validation, `tests/quality/stage-02-hardening.test.ts`.                                                                                                                                                                                                  |
| **Stage 03** | Quality Gates, CI, and Governance Closure     | **Completed** | Independent critical subsystem coverage gates (`permissions`, `evidence`, `recovery` >= 85% branch, >= 90% lines/funcs), complete verification chain (`npm run verify` running 9 distinct gates), cross-platform script test runner, explicit CI minimum-runtime matrix (`24.18.0` on Ubuntu/Windows/macOS), relative documentation link checking (`scripts/check-doc-links.mjs`), authoritative `DECISIONS.md`.      |
| **Stage 04** | Configuration Contract Fidelity               | **Completed** | ADR-0003, Decision 17, distinct question budget cap (`maxUniqueQuestionsPerStage`) with autonomous fallback and `executor.question.budget` event emission (F-12), reviewer role precedence hierarchy (`reviewer.<role>` overrides `harnesses.<adapter>`) across `ReviewerRouter` and reviewer harnesses (F-13), configuration contract and validation test suites, and reconciled templates and documentation (F-14). |

---

## 4. Quality Gates & Verification Chain

The project enforces an authoritative, non-overlapping 9-step quality verification chain executed via `npm run verify`:

1. **Format Check**: `npm run format:check` (`oxfmt --check`)
2. **Lint Invariants**: `npm run lint` (`oxlint` + `scripts/verify-oxlint-rules.mjs`)
3. **Typecheck**: `npm run typecheck` (`tsc -p tsconfig.json --noEmit` and `tsc -p tsconfig.test.json --noEmit`)
4. **Global Test Coverage**: `npm run test:coverage` (lines >= 85%, functions >= 85%, branches >= 80%)
5. **Critical Subsystem Coverage**: `npm run test:critical-coverage` (independent gates for `permissions`, `evidence`, and `recovery`: lines >= 90%, functions >= 90%, branches >= 85%)
6. **Script Governance Tests**: `npm run test:scripts` (cross-platform discovery of all `tests/scripts/*.test.mjs`)
7. **CLI Integration Smoke Tests**: `npm run test:cli`
8. **Packaging & Consumer Verification**: `node scripts/package-check.mjs` (validates clean tarball, TypeScript 7 consumer compatibility, OIDC publishing config, and required repository disk files)
9. **Documentation Link Validation**: `npm run docs:links` (`scripts/check-doc-links.mjs` verifying all relative Markdown links)

### Fast Day-to-Day Quality Gate

For iterative development, agents run the fast changed-files gate:

```bash
npm run check:changed
```

Enforces 95% line, 95% function, and 85% branch coverage on touched files while performing format, lint, and typechecks.

---

## 5. Compatibility & Deprecation Matrix

- **Environment Variables**:
  - `AI_STAGE_*` variables are deprecated in favor of `AI_HARNESS_*`.
  - Transparent backward compatibility loader supports legacy variables with advisory warnings.
- **Configuration Files**:
  - `.ai-stage-orchestrator.jsonc` is supported with deprecation notice; preferred name is `.ai-universal-coding-harness.jsonc`.
- **Configuration Properties**:
  - Legacy uppercase properties (`AUTO_APPROVE`, `HARD_DANGEROUS`, etc.) are proxied to canonical camelCase options.

---

## 6. Known Deferred Work

All findings identified in the Modernization Audit (F-01 through F-14) across Stages 01, 02, 03, and 04 are now closed. No modernization gaps remain open.

---

## 7. Stage Closure History

### Stage 01: Complete Type and Protocol Boundaries

- **Delivered**: [ADR-0001](docs/adr/0001-protocol-and-transport-boundary-separation.md), `CursorAcpTransport`, `AcpEventDecoder`, eliminated loose `any` assertions across orchestrator and harness boundaries, Decision 14 recorded in [DECISIONS.md](DECISIONS.md).

### Stage 02: Evidence, State, and Recovery Trust Hardening

- **Delivered**: [ADR-0002](docs/adr/0002-evidence-state-and-recovery-trust-hardening.md), durable `quality_epoch_id` markers, unified corroboration standards without resume bypass, strict patch fingerprint matching, deep recursive state validation, Decision 15 recorded in [DECISIONS.md](DECISIONS.md), regression suite `tests/quality/stage-02-hardening.test.ts`.

### Stage 03: Quality Gates, CI, and Governance Closure

- **Delivered**: Independent critical subsystem coverage runner ([scripts/run-critical-coverage.mjs](scripts/run-critical-coverage.mjs)), centralized coverage configuration ([scripts/coverage-config.mjs](scripts/coverage-config.mjs)), cross-platform script test runner ([scripts/run-script-tests.mjs](scripts/run-script-tests.mjs)), complete 9-step `npm run verify` quality chain, explicit CI minimum-runtime matrix ([.github/workflows/ci.yml](.github/workflows/ci.yml)), relative documentation link validator ([scripts/check-doc-links.mjs](scripts/check-doc-links.mjs)), authoritative [DECISIONS.md](DECISIONS.md) with Decision 16, root [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md), and packaging invariant enforcement in [scripts/package-check.mjs](scripts/package-check.mjs).

### Stage 04: Configuration Contract Fidelity

- **Delivered**: [ADR-0003](docs/adr/0003-configuration-contract-fidelity-and-role-precedence.md), Decision 17 recorded in [DECISIONS.md](DECISIONS.md), non-blocking stage distinct question budget cap (`maxUniqueQuestionsPerStage`) with autonomous fallback and `executor.question.budget` event emission (Finding F-12), normative reviewer role configuration precedence hierarchy (`reviewer.<role>` overrides `harnesses.<adapter>`) across `ReviewerRouter`, `CodexReviewerHarness`, and `CursorReviewerHarness` (Finding F-13), comprehensive configuration contract test suite in [tests/config/contract.test.ts](tests/config/contract.test.ts) and [tests/config/validation.test.ts](tests/config/validation.test.ts) (Finding F-14), and reconciled templates and documentation in [config.example.jsonc](config.example.jsonc), [src/config/templates.ts](src/config/templates.ts), and [docs/configuration.md](docs/configuration.md).
