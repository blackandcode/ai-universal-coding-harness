# ADR: Evidence, state and recovery trust hardening

- Status: Accepted
- Date: 2026-09-16

## Context

In AI Universal Coding Harness 2.1.2–2.1.7, several critical trust gaps were identified around quality evidence corroboration, persisted state validation, resume invariants, and autonomous crash recovery (Modernization Audit Findings F-03, F-04, F-05, and F-06):

1. **Quality Epoch and Scope Invariants (Finding F-03)**: Although `quality_epoch_id` was generated and passed to `EvidenceVerifier`, it was never evaluated against candidate command observations. Furthermore, observation filtering accepted records with missing stage or missing attempt fields, allowing unscoped or cross-attempt commands to satisfy quality claims. Run and session identities were not enforced.
2. **Asymmetric Resume Proof Standard (Finding F-04)**: `EvidenceService.checkReusableEvidence()` performed only `JSON.parse` on saved evidence without validating status, exit codes, or unresolved items. In `Orchestrator.ts`, the condition `if (!isResumed && !corroboration.ok)` explicitly bypassed corroboration failures for resumed runs, treating unverified cached evidence with greater trust than fresh executor output.
3. **Recovery Fingerprint Permissiveness and Epoch Replay Loss (Finding F-05)**: `RecoveryManager.recover()` allowed a missing `patch_fingerprint` to count as a match when deciding whether to resume at `REVIEW`. Additionally, historical ACP logs (`events.jsonl`) lacked explicit quality epoch boundaries, making post-crash log replay (`parseAcpEvents`) unable to reconstruct the quality epoch needed for corroboration.
4. **Shallow State Validation and Silent Corrupt Reset (Finding F-06)**: `validateRunState()` performed shallow property checks and casted untrusted JSON to `RunState` without validating nested `stages`, manifests, or SHA256 maps. In `loadStage()`, a corrupt JSON state file was silently swallowed and converted into a clean pending stage (`{ version: 1, phase: 'pending' }`), masking on-disk data corruption.

## Decision

We establish an authoritative, unified mechanical proof standard across live execution, resume, and recovery:

1. **Exact Multi-Dimensional Observation Eligibility**:
   - Centralize observation qualification in `isObservationEligible(obs, context)` within `src/quality/EvidenceVerifier.ts`.
   - When a verification context provides `stage`, `attempt`, `quality_epoch_id`, `run_id`, `session_id`, or `workspace`, matching candidate observations must match exactly.
   - Missing identity is never treated as equivalent to matching identity: unscoped observations cannot prove a scoped quality epoch.
   - Exclude autonomous permission broker executions (`source === 'broker'`) from proving project quality checks.

2. **Durable Quality Epoch Markers and Deterministic Replay**:
   - When `CursorAcpSession.setQualityEpoch(epochId)` is called, emit a durable epoch marker record (`record_type: 'quality_epoch_started'`) into `ObservationJournal` and write an explicit `EPOCH <json>` marker line to `events.jsonl`.
   - `parseAcpEvents()` walks event streams, updates the active epoch upon encountering epoch markers, and tags subsequently replayed command observations with the reconstructed `quality_epoch_id`.

3. **Unified Corroboration Standard for Fresh and Resumed Evidence**:
   - `EvidenceService.checkReusableEvidence()` requires deep validation via `validateCorroboratedEvidence()`: status must be `PASS`, quality and diff check exit codes must be `0`, `unresolved` items must be empty, and patch fingerprint plus quality epoch must be present and match.
   - Remove the `!isResumed` bypass in `Orchestrator.ts`: both fresh and resumed evidence must pass mechanical corroboration before proceeding to `REVIEW`. If resumed evidence fails corroboration, orchestration safely resets to `QUALITY`.

4. **Deterministic Recovery Invariants**:
   - `RecoveryManager` validates evidence using shared `validateCorroboratedEvidence()`.
   - Resuming at `REVIEW` requires an exact patch fingerprint match (`evidence.patch_fingerprint === currentPatchFingerprint`); a missing fingerprint is rejected and routes execution safely to `QUALITY`.
   - Replay ACP observations before corroboration to associate them with the reconstructed quality epoch.

5. **Deep Recursive Runtime State Validation**:
   - In `src/state/RunStateStore.ts`, implement deep validators: `validateRunState()`, `validateStageManifest()`, `validateSelectedStage()`, and `validateStageRuntimeState()`.
   - In `loadStage()`, a missing file safely returns the documented pending default (`{ version: 1, phase: 'pending' }`), but an existing corrupted or invalid state file throws a typed `RunStateError`.

## Alternatives considered

- **Alternative 1: Integrate an external validation library (e.g. Zod or Valibot)**:
  - _Cost_: Adds external runtime dependencies, bundle overhead, and package maintenance risks.
  - _Why rejected_: Pure TypeScript custom type guards with explicit error messages provide zero runtime overhead, preserve Node standard library idioms, and meet project zero-external-dependency constraints.

- **Alternative 2: Infer quality epochs using timestamps**:
  - _Cost_: Flaky and nondeterministic; file timestamps and system clocks drift across containers, WSL2, and operating systems.
  - _Why rejected_: Explicit, monotonically ordered sequence markers in the event log are deterministic and immune to clock skew.

- **Alternative 3: Execute project quality commands directly from Orchestrator as fallback**:
  - _Cost_: Violates core architectural invariant: the executor owns code implementation and quality check execution; the orchestrator coordinates and verifies.
  - _Why rejected_: The orchestrator must never execute project quality commands on behalf of the agent.

## Consequences

- **Positive**:
  - Eliminates false-positive quality passes from old attempts or mismatched sessions.
  - Guarantees that resumed and fresh runs satisfy the exact same proof standard.
  - Prevents corrupted state files from silently resetting execution progress.
  - Enables post-crash recovery to reliably reconstruct quality epochs from raw ACP logs.
- **Negative / Trade-offs**:
  - Existing corrupt state files that previously silently reset will now fail loudly with `RunStateError`, requiring explicit recovery or cleanup.
- **Compatibility / Migration**:
  - Forward and backward compatible with valid existing `state.json` and `evidence.json` files.
- **Security / Reliability**:
  - Protects the core product promise: code cannot reach `REVIEW` or be committed without verifiable, mechanically corroborated proof tied to the exact patch.

## Verification

- `tests/quality/evidence-integrity.test.ts`: Negative regression cases for mismatched epoch, missing epoch, wrong attempt, wrong session, and wrong run ID.
- `tests/quality/EvidenceService.test.ts`: Validation of corrupted, non-zero exit, unresolved, and missing-fingerprint reusable evidence.
- `tests/state/RunStateStore.test.ts`: Recursive state schema validation and `RunStateError` thrown on corrupt stage state files.
- `tests/orchestrator/recovery-hardening.test.ts`: Resumed evidence failing fresh corroboration routes to `QUALITY`; missing fingerprint in recovery routes to `QUALITY`.
- `tests/harness/cursor/AcpLiveReplayEquivalence.test.ts` & `CursorExecutorHarness.test.ts`: Epoch marker logging and ACP replay epoch reconstruction.
- `npm run verify`: Full suite passes with strict coverage thresholds.

## Revisit triggers

- Changes to the Agent Client Protocol (ACP) introducing native server-side epoch or execution boundary primitives.
- Restructuring of the run state storage hierarchy.
