---
name: harness-adapter-protocols
description: Design or implement executor/reviewer harness adapters, provider streaming/event normalization, sessions, external harness modules, registry/factory contracts, and structured provider responses. Use when working in `src/harness`, adding Cursor/Codex/future providers, changing adapter contracts, handling ACP/tool chunks, permission/question routing at adapter boundaries, or loading external harness plugins. Do not move generic orchestration policy into adapters.
compatibility: AI Universal Coding Harness; TypeScript 7.x; Node.js 24.18+.
metadata:
  role: provider-boundary
---

# Harness Adapter Protocols

Adapters isolate provider products from the orchestration engine.

Read:

- `references/adapter-contracts.md`
- `references/streaming-accumulation.md`
- `references/plugin-registry.md`
- `references/protocol-validation.md`

## Boundary rules

- Core/orchestrator code depends on harness-owned interfaces and semantic events, not Cursor/Codex SDK/ACP types.
- Parse/validate provider structured output before it becomes a trusted harness result.
- Preserve raw events for audit/reconstruction where policy allows; separately emit normalized semantic observations.
- Adapter capabilities are explicit. Do not discover behavior through scattered provider-name checks.
- Session/resume identity is adapter-owned data exposed through a generic contract.
- Permission and question requests are transported by the adapter but decided by the permission/reviewer workflow.
- An adapter must not create/commit/push/merge Git state.

## Streaming rule

Provider streams are deltas, not snapshots unless the provider contract explicitly says otherwise. Sparse later chunks must not erase facts learned from earlier chunks.

## Failure rule

Malformed/unknown provider data fails at the adapter boundary with diagnosable raw context. Do not coerce a partial provider result into `APPROVE`, successful command evidence, or completed execution.
