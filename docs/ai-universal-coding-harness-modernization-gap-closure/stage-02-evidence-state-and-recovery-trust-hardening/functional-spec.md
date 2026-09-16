# Functional Specification — Stage 02: Evidence, State and Recovery Trust Hardening

## Objective

Close the remaining trust gaps in evidence corroboration, persisted state, resume, and recovery.

This is the highest-priority correctness stage.

## Core invariant

A quality PASS may be used for review or resume only when the system can prove it belongs to the current execution context and current patch.

At minimum the proof must bind to:

```text
run
stage
attempt
executor session
quality epoch
observed command execution
repository patch fingerprint
```

Missing identity must not be treated as equivalent to matching identity.

## Required outcomes

### 1. Enforce quality epoch

`quality_epoch_id` is already produced and transported through the system. It must become an actual verification constraint.

When a verification context supplies an epoch:

- observations from another epoch are rejected;
- unscoped observations must not prove the current epoch;
- quality command and diff-check observations must both belong to the current epoch.

### 2. Enforce run/session/attempt identity

Extend verification context as needed with:

```text
run_id
session_id
stage
attempt
quality_epoch_id
```

When these values are known, qualifying observations must match exactly.

Do not retain permissive logic such as:

```text
missing attempt OR matching attempt
```

for a context in which attempt identity is required.

### 3. Never weaken verification on resume

Reusable evidence must pass the same trust rules as fresh evidence.

Remove the behavior where failed corroboration is ignored solely because evidence was resumed.

Resume should avoid re-running expensive executor work when proof is valid; it must not bypass proof.

### 4. Deeply validate persisted evidence and state

Create shared runtime validators for at least:

- `RunState`;
- `SelectedStage`;
- `StageManifest`;
- `StageRuntimeState`;
- `ExecutionEvidence`;
- persisted `CommandObservation` when loaded from disk.

Missing state file may return a documented default where appropriate.

Existing-but-corrupt state must throw a typed error or route through explicit recovery. It must not silently reset to a fresh pending state.

### 5. Harden reusable evidence

`EvidenceService.checkReusableEvidence()` must:

- validate JSON structure;
- require `PASS`;
- require quality exit 0;
- require diff-check exit 0;
- require no unresolved items;
- require exact stage/attempt identity;
- require exact current patch fingerprint;
- require enough provenance to re-corroborate or prove prior corroboration.

### 6. Persist quality epoch boundaries for recovery

Raw ACP replay currently cannot reconstruct local quality-epoch boundaries.

Persist an explicit durable epoch marker when `setQualityEpoch()` is called.

Replay/recovery must be able to associate later observations with the correct epoch.

A marker can live in the observation journal or raw event log, but it must be deterministic and versioned.

### 7. Recovery must use shared validation

`RecoveryManager` must not directly trust `JSON.parse` into `ExecutionEvidence`.

It must use the same evidence validator/corroborator as normal execution.

Missing `patch_fingerprint` must not count as a match when recovering directly to review.

## Non-goals

- Do not make the orchestrator run the project's quality command as a fallback.
- Do not allow reviewer prose to replace mechanical proof.
- Do not require real Cursor/Codex calls in tests.
- Do not redesign Git ownership.

## Acceptance criteria

- Old attempt/session/epoch observations cannot prove a new quality PASS.
- Unscoped observations cannot prove a scoped quality epoch.
- Resumed evidence with tampered JSON is rejected.
- Resumed evidence with failed fresh corroboration returns to QUALITY.
- Recovery without an exact current fingerprint returns to QUALITY.
- Corrupt existing stage-state JSON is surfaced, not silently reset.
- Raw ACP/observation replay can reconstruct the quality epoch needed by recovery.
- All evidence/recovery regression tests pass.
- `npm run verify` passes.
