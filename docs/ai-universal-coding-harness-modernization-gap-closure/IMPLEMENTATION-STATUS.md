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

Status: Not started

Primary findings: F-07, F-08, F-09, F-10, F-11

## Stage 04 — Configuration Contract Fidelity

Status: Not started

Primary findings: F-12, F-13, F-14

Specs: `stage-04-configuration-contract-fidelity/` (functional-spec, technical-spec, prompt)
