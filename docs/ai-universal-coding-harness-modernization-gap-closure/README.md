# AI Universal Coding Harness — Modernization Gap Closure Plan

## Purpose

This package reviews the original five-stage modernization plan against the supplied `2.1.7` source tree and defines only the remaining corrective work.

The modernization is substantially complete. The remaining work is concentrated in four areas:

1. protocol/type boundaries are still only partially strict;
2. evidence/state/recovery trust invariants are not fully enforced;
3. several quality/release gates are documented but not actually enforced;
4. some configuration keys are documented or templated but not fully enforced at runtime.

This is intentionally a **four-stage closure plan**, not another rewrite.

## Baseline reviewed

- Original modernization plan: `ai-universal-coding-harness-modernization-rewrite-plan(1).zip`
- Current implementation: `ai-universal-coding-harness-2.1.2.zip`
- Current package version: `2.1.7`
- Node engine: `>=24.18.0`
- TypeScript: `7.0.2`
- React: `19.2.8`
- Ink: `7.1.1`

### Provenance note

The modernization-plan README says it analyzed package version `1.0.2`, while the intended modernization baseline is described as `v1.0.3`. The current changelog contains an empty `1.0.3` section, so this may not represent a functional difference, but the provenance should be corrected in project documentation so future audits are unambiguous.

## What was successfully completed

The current 2.1.7 implementation successfully delivers most of the original plan:

- Node 24.18+ runtime floor and `.nvmrc`;
- TypeScript 7, ES2024, NodeNext, strict mode;
- Oxfmt + Oxlint;
- typed CLI parser/dispatcher split;
- decomposed configuration modules and legacy compatibility boundary;
- domain error hierarchy;
- process timeout/AbortSignal support;
- Git/workspace/state/stage tests;
- ACP accumulator and observation journal;
- Codex parser/runner/prompt/result separation;
- React 19 / Ink 7 TSX UI rewrite;
- reducer/selectors/event-file separation and keyboard tests;
- native coverage thresholds;
- package consumer verification;
- cross-platform CI;
- Trusted Publishing/OIDC;
- extensive architecture/testing documentation;
- deterministic orchestrator integration tests.

## Remaining findings

| ID   | Severity | Finding                                                                                                                                                                                                                                                                                                                     | Original plan requirement affected                             | Corrective stage |
| ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------- |
| F-01 | High     | Production code still contains ~55 explicit `any` constructs, concentrated in Cursor ACP, Codex reviewer, Orchestrator, and evidence boundaries.                                                                                                                                                                            | Stage 02 strict typing; Stage 03 `unknown` protocol boundaries | 01               |
| F-02 | High     | Cursor live/replay protocol decoding is still split across multiple implementations; `CursorAcpSession` remains transport + protocol + interactive-handler heavy.                                                                                                                                                           | Stage 03 parser/transport separation                           | 01               |
| F-03 | Critical | `quality_epoch_id` is created and passed to `EvidenceVerifier` but is not used to filter observations. Run/session identity is also not enforced, and stage/attempt filters accept unscoped observations.                                                                                                                   | Stage 03 evidence integrity                                    | 02               |
| F-04 | Critical | Reusable/resumed evidence is parsed without full validation. `Orchestrator` ignores failed fresh corroboration when `isResumed === true`.                                                                                                                                                                                   | Stage 03 recovery/evidence trust                               | 02               |
| F-05 | High     | `RecoveryManager` parses evidence directly, permits missing `patch_fingerprint`, and cannot reconstruct quality-epoch boundaries from raw ACP replay.                                                                                                                                                                       | Stage 03 quality epoch + deterministic recovery                | 02               |
| F-06 | High     | Persisted `RunState` / `StageRuntimeState` validation is shallow and then casts to full domain types; corrupt stage state is silently reset to `pending`.                                                                                                                                                                   | Stage 02 persisted-state validation                            | 02               |
| F-07 | Medium   | Documentation and decisions claim independent critical-module coverage gates, but `scripts/run-tests.mjs` enforces only global coverage thresholds.                                                                                                                                                                         | Stage 05 critical subsystem coverage                           | 03               |
| F-08 | Medium   | `tests/scripts/*.test.mjs` are behind `npm run test:versioning` but are not included in authoritative `npm run verify`.                                                                                                                                                                                                     | Stage 05 full test suite                                       | 03               |
| F-09 | Medium   | CI tests exact Node `24.18.0` only on Ubuntu; Windows/macOS use floating `24`. Original strategy required the minimum supported runtime on all three OSes, plus a latest Node 24 job.                                                                                                                                       | Stage 05 cross-platform minimum-runtime matrix                 | 03               |
| F-10 | Medium   | `DECISIONS.md` links to a rewrite-plan directory that is absent from the current source tree; `IMPLEMENTATION-STATUS.md` required by the modernization process is also absent.                                                                                                                                              | Rewrite governance requirements                                | 03               |
| F-11 | Low      | Product/architecture/CI documentation contains statements no longer matching implementation (for example critical coverage enforcement and moved test paths). **Excludes** configuration contract fidelity (`config.example.jsonc`, `docs/configuration.md` precedence, config key → behavior tests) — see F-14 / Stage 04. | Stage 05 documentation accuracy                                | 03               |
| F-12 | Medium   | `maxUniqueQuestionsPerStage` is loaded and validated but not enforced in orchestrator question flow.                                                                                                                                                                                                                        | Configuration contract                                         | 04               |
| F-13 | High     | `reviewer.<role>` Codex-tunable fields are not applied consistently at runtime; `harnesses.*` vs `reviewer.*` precedence is unclear.                                                                                                                                                                                        | Reviewer routing configuration                                 | 04               |
| F-14 | Medium   | No config contract tests; examples and docs can drift from runtime (for example dual Codex verbosity sources).                                                                                                                                                                                                              | Configuration contract                                         | 04               |

## Important architectural rule

Do not use these findings as an excuse for another product redesign.

Preserve:

```text
validated frozen specs
    -> planning
    -> implementation
    -> executor-owned quality commands
    -> mechanical corroboration
    -> independent reviewer
    -> orchestrator-owned commit
```

The executor remains responsible for implementation and project commands. The reviewer remains read-only. The orchestrator remains responsible for workflow/state/Git lifecycle. Mechanical corroboration must become stricter, not broader in authority.

## Stage order

1. **Stage 01 — Complete Type and Protocol Boundaries**
2. **Stage 02 — Evidence, State and Recovery Trust Hardening**
3. **Stage 03 — Quality Gates, CI and Governance Closure**
4. **Stage 04 — Configuration Contract Fidelity** (`stage-04-configuration-contract-fidelity/`)

Do not start Stage 03 before Stage 02 is green because Stage 03 turns several currently advisory/documented checks into hard gates.

Stage 04 is independent of Stage 02 evidence work but should run after or alongside Stage 01 when `HarnessContext` role typing is in flight. Stages 01–03 remain prerequisites for typing, trust, and CI hardening.
