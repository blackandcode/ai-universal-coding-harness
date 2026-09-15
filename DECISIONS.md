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
