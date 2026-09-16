# Coding Agent Prompt — Stage 02

Implement **Stage 02: Evidence, State and Recovery Trust Hardening**.

**Related:** configuration contract fidelity (F-12–F-14) is **Stage 04**; no overlap with evidence epoch invariants.

This stage protects the core product promise. Treat correctness as more important than minimizing code changes.

## Rules

1. Read `AGENTS.md` and the workflow-state, adapter-protocol, security/permissions, testing, TypeScript, and architecture skills.
2. Add failing regression tests before fixing each trust gap whenever practical.
3. Do not make the orchestrator execute arbitrary project quality commands to compensate for missing telemetry.
4. Do not trust reviewer claims or executor-written evidence without mechanical corroboration.
5. Fresh and resumed evidence must use the same proof standard.
6. Missing scope/provenance is not a match.
7. Persist quality-epoch boundaries so crash recovery can reconstruct them.
8. Use one shared runtime validator/corroborator path across normal execution and recovery.
9. Do not silently convert corrupted persisted state into fresh pending state.
10. Update `CHANGELOG.md`, `DECISIONS.md`, and `IMPLEMENTATION-STATUS.md`.

## Required verification

Use focused tests during implementation, especially:

```text
tests/quality/**
tests/orchestrator/recovery-hardening.test.ts
tests/orchestrator/orchestrator-integration.test.ts
tests/harness/cursor/**
tests/state/RunStateStore.test.ts
```

Finish with:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run test:cli
npm run verify
```

Do not declare completion until the new negative regression cases demonstrate that stale/wrong-context evidence cannot reach REVIEW.
