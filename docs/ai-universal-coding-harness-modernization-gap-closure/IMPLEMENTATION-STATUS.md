# Gap Closure Implementation Status

## Stage 01 — Complete Type and Protocol Boundaries

Status: Completed

Primary findings: F-01, F-02

Delivered:

- Authoritative ADR-0001: Protocol and transport boundary separation (`docs/adr/0001-protocol-and-transport-boundary-separation.md`).
- Decoupled `CursorAcpTransport` (`src/harness/cursor/CursorAcpTransport.ts`) managing ACP child process lifecycle, stdio readline framing, pending JSON-RPC request correlation, and stderr diagnostics.
- Deterministic pure protocol parser `AcpEventDecoder` (`src/harness/cursor/AcpEventDecoder.ts`) validating JSON-RPC messages and session updates.
- Refactored `CursorAcpSession` and `parseAcpEvents` to share `AcpEventDecoder` and delegate subprocess operations to `CursorAcpTransport`.
- Eliminated loose assertions (`any`, `Record<string, unknown>`) across `ReviewerRouter`, `ReviewPayloadBuilder`, `CursorReviewerHarness`, `CodexReviewerHarness`, `EvidenceVerifier`, and `RecoveryManager`.
- Added Oxlint `typescript/no-explicit-any` invariant fixture check to `scripts/verify-oxlint-rules.mjs`.
- Added test coverage across unit, protocol decoding, live/replay parity, and Codex event parsing test suites.

## Stage 02 — Evidence, State and Recovery Trust Hardening

Status: Completed

Primary findings: F-03, F-04, F-05, F-06

Delivered:

- Authoritative ADR-0002: Durable quality epoch markers and evidence corroboration invariants (`docs/adr/0002-evidence-state-and-recovery-trust-hardening.md`).
- Enforced multi-dimensional execution identity (`run_id`, `session_id`, `stage`, `attempt`, `quality_epoch_id`) in `VerificationContext` and centralized observation eligibility via `isObservationEligible` in `src/quality/EvidenceVerifier.ts`.
- Implemented `validateCorroboratedEvidence` enforcing strict invariants (`PASS` status, zero exit codes, empty `unresolved`, non-empty `patch_fingerprint` and `quality_epoch_id`) for resumed and recovered evidence.
- Removed corroboration bypass on resume (`!isResumed && !corroboration.ok`) in `src/orchestrator/Orchestrator.ts`, ensuring all evidence is subject to mechanical verification against observed ACP commands.
- Implemented durable `QualityEpochMarker` records and reconstructed epoch boundaries during ACP log replay in `src/harness/cursor/ObservationJournal.ts` and `src/harness/cursor/CursorExecutorHarness.ts`.
- Deepened runtime state validation in `src/state/RunStateStore.ts` with `validateRunState`, `validateStageManifest`, `validateSelectedStage`, and `validateStageRuntimeState`, throwing `RunStateError` for corrupt `stage-state.json` while returning pending defaults for missing files.
- Hardened `RecoveryManager` in `src/orchestrator/RecoveryManager.ts` to require exact patch fingerprint match and full command corroboration before routing to `review`, falling back to `quality` when evidence is stale or uncorroborated.
- Added comprehensive regression test suite covering all 17 explicit negative and positive cases in `tests/quality/stage-02-hardening.test.ts`.

## Stage 03 — Quality Gates, CI and Governance Closure

Status: Completed

Primary findings: F-07, F-08, F-09, F-10, F-11

Delivered:

- Authoritative Decision 16 added to `DECISIONS.md`, establishing root `DECISIONS.md` as the authoritative single source of architectural decisions.
- Created root `IMPLEMENTATION-STATUS.md` detailing current release baseline, subsystem architecture, modernization status, and quality gates.
- Centralized coverage configuration in `scripts/coverage-config.mjs` defining global thresholds (85/85/80), incremental thresholds (95/95/85), and critical subsystem thresholds (90/90/85).
- Created independent critical subsystem runner `scripts/run-critical-coverage.mjs` enforcing machine-checked coverage for `permissions`, `evidence`, and `recovery` subsystems.
- Hardened `tests/orchestrator/RecoveryManager.test.ts` to reach 100% lines, 85% branches, and 100% functions on `RecoveryManager.ts`.
- Created cross-platform script test runner `scripts/run-script-tests.mjs` discovering and running all `tests/scripts/*.test.mjs` files without shell globbing dependencies.
- Updated `.github/workflows/ci.yml` matrix with explicit `include` testing exact Node `24.18.0` on Ubuntu, Windows, and macOS, plus forward Node `24` latest on Ubuntu.
- Implemented relative Markdown documentation link checker in `scripts/check-doc-links.mjs` with code-fence exclusion and anchor normalization, repairing 22 broken links across `DECISIONS.md` and `docs/stage-02-cursor-plan.md`.
- Added `DECISIONS.md` and `IMPLEMENTATION-STATUS.md` to `requiredDiskFiles` in `scripts/package-check.mjs`.
- Added governance and link integrity regression test suites in `tests/scripts/governance.test.mjs` and `tests/scripts/doc-links.test.mjs`.
- Reconciled documentation across `docs/testing.md`, `docs/development.md`, `docs/Functional-specification.md`, and recorded modernization baseline provenance under `[1.0.3]` in `CHANGELOG.md`.

## Stage 04 — Configuration Contract Fidelity

Status: Completed

Primary findings: F-12, F-13, F-14

Delivered:

- Authoritative ADR-0003: Configuration contract fidelity and reviewer role precedence (`docs/adr/0003-configuration-contract-fidelity-and-role-precedence.md`) and Decision 17 in `DECISIONS.md`.
- Implemented stage distinct question budget tracking and non-blocking autonomous fallback in `src/orchestrator/Orchestrator.ts` (`maxUniqueQuestionsPerStage`), emitting `executor.question.budget` semantic event on `EventBus` upon budget exhaustion (F-12).
- Wired reviewer role configuration precedence hierarchy (`reviewer.<role>` overrides `harnesses.<adapter>`) through `ReviewerRouter.resolveHarness()`, `CodexReviewerHarness`, `CursorReviewerHarness`, and `CodexProcessRunner`, propagating all tunables including `reasoningEffort`, `verbosity`, `contextMode`, `thinking`, `timeoutMinutes`, and `timeoutSeconds` (F-13).
- Added comprehensive configuration contract and validation test suites under `tests/config/contract.test.ts` and `tests/config/validation.test.ts` verifying numeric clamping, role override precedence, global fallback inheritance, and template schema fidelity (F-14).
- Reconciled documentation and configuration templates in `config.example.jsonc`, `src/config/templates.ts`, and `docs/configuration.md`, eliminating conflicting duplicate Codex tunables and adding explicit runtime precedence reference tables.
