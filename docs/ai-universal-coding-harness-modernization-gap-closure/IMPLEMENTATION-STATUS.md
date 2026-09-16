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

Status: Not started

Primary findings: F-03, F-04, F-05, F-06

## Stage 03 — Quality Gates, CI and Governance Closure

Status: Not started

Primary findings: F-07, F-08, F-09, F-10, F-11

## Stage 04 — Configuration Contract Fidelity

Status: Not started

Primary findings: F-12, F-13, F-14

Specs: `stage-04-configuration-contract-fidelity/` (functional-spec, technical-spec, prompt)
