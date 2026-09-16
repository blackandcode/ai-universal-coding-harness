# Architecture Decisions

This document tracks all material architecture choices for AI Universal Coding Harness.
The authoritative log of rewrite decisions is maintained in `ai-universal-coding-harness-rewrite-plan/DECISIONS.md`.

Please refer to [ai-universal-coding-harness-rewrite-plan/DECISIONS.md](./ai-universal-coding-harness-rewrite-plan/DECISIONS.md) for the complete history of decisions, rationale, alternatives considered, and consequences.

## Summary of Key Architectural Decisions

1. **Oxfmt and Oxlint Toolchain Selection**: Fast AST-based linting and formatting without runtime overhead.
2. **TypeScript 7 Modern Compiler Baseline**: ES2024 target with NodeNext resolution and strict typing.
3. **Packaging Invariant Enforcement**: Reliable test exclusion via dynamically generated nested `dist/.npmignore`.
4. **Deterministic Quality Gates**: Bidirectional lockfile verification and consumer declaration compilation.
5. **Discriminated Plan Coordination**: Plan outcomes modeled as discriminated unions with non-blocking advisory budget limits.
6. **Modular Authoritative Configuration**: Decomposed `src/config/` modules with camelCase `OrchestratorConfig` and legacy Proxy adapter.
7. **Runtime State Validation and Domain Errors**: Strict schema validation for persisted run/stage state and hierarchical domain errors.
8. **Typed CLI Command Union and Dispatcher**: Pure functional CLI argument parsing decoupled from side-effect execution.
9. **Typed Process Execution and Cancellation Resilience**: Strictly typed `ProcessResult`, `AbortSignal` cancellation, and timeout management.
10. **Modular React 19 / Ink 7 UI Architecture**: Fully typed TSX presentation components, pure reducer state machine, responsive bounded layout budgets to prevent terminal jitter, and interactive keyboard navigation.
11. **Corroborated Evidence Lifecycle and Autonomous Recovery**: Strict mechanical corroboration between executor `evidence.json`, `ObservationJournal` tool exits, and git `patchFingerprint()`. Hardened recovery engine with dual deterministic recovery points (`REVIEW` vs `QUALITY`), dry-run preview, and automatic observation reconstruction from ACP logs.
12. **Deprecation of Legacy Configuration and Environment Variables**: Deprecated `AI_STAGE_*` in favor of `AI_HARNESS_*`, `.ai-stage-orchestrator.jsonc` in favor of `.ai-universal-coding-harness.jsonc`, and internal uppercase properties in favor of camelCase, while maintaining non-breaking backward compatibility loaders and proxies.
13. **Native Node 24 Coverage Gate Architecture**: Zero external coverage libraries; strict enforcement of native Node 24 coverage flags (`--experimental-test-coverage`, `--test-coverage-lines=85`, `--test-coverage-functions=85`, `--test-coverage-branches=80`) integrated into `npm run test:coverage` and `npm run verify`, with dedicated invariants for critical security, quality, and recovery modules.
14. **Protocol and Transport Boundary Separation**: Decomposed Cursor ACP integration into isolated boundaries: `CursorAcpTransport` for subprocess management and JSON-RPC transport, `AcpEventDecoder` as a pure deterministic protocol decoder and single source of truth, and `AcpEventNormalizer` for semantic event normalization across both live execution and historical log replay. Zero production `any` across all harness adapters and orchestrator boundaries. (Refer to [ADR-0001](./docs/adr/0001-protocol-and-transport-boundary-separation.md)).
15. **Durable Quality Epoch Markers and Evidence Corroboration Trust Hardening**: Bound observations to multi-dimensional execution identity (`run_id`, `session_id`, `stage`, `attempt`, `quality_epoch_id`), eliminated resume corroboration bypass (`!isResumed && !corroboration.ok`), enforced exact patch fingerprint and corroborated verification for recovery to `review`, and implemented durable epoch markers (`record_type: 'quality_epoch_started'`) with deterministic reconstruction during historical ACP log replay. Prevented silent state corruption by making corrupt `stage-state.json` throw `RunStateError` while maintaining pending defaults for missing files. (Refer to [ADR-0002](./docs/adr/0002-evidence-state-and-recovery-trust-hardening.md)).
