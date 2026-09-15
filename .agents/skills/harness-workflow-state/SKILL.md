---
name: harness-workflow-state
description: Implement the AI Harness run/stage state machine, durable resume state, hashes/fingerprints, Git lifecycle coordination, locks, event replay, command/evidence corroboration, retries, and idempotent continuation. Use when changing orchestration phases, `.ai-orchestrator` persistence, resume behavior, stage commits, run recovery, evidence verification, or stale-state invalidation. Do not place provider parsing or permission classification here.
compatibility: AI Universal Coding Harness; Node.js 24.18+; TypeScript 7.x.
metadata:
  role: workflow-reliability
---

# Harness Workflow, State, and Evidence

This skill protects the product promise: a long-running run can stop, resume, rework, and commit without trusting stale or agent-authored claims.

Read:

- `references/state-machine.md`
- `references/durable-state-resume.md`
- `references/git-lifecycle.md`
- `references/evidence-corroboration.md`
- `references/idempotency-retry-timeout.md`

## Authority separation

- Orchestrator decides the next phase.
- State subsystem persists/reloads state safely.
- Git module performs Git mechanics.
- Quality subsystem corroborates evidence.
- Adapter supplies provider observations.

Do not merge those roles just to shorten a call chain.

## Reliability posture

- phase transitions are explicit and testable;
- irreversible orchestrator-owned side effects have durable before/after semantics;
- resume validates repository/branch/spec hashes/patch fingerprint before reusing work;
- retries are scoped to operations known to be retryable;
- event replay reconstructs observations, not new truth that contradicts the current patch;
- one approved stage produces one orchestrator-owned commit.
