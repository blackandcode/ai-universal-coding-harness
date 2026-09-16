# Technical Specification — Stage 02

## Primary files

```text
src/types.ts
src/state/RunStateStore.ts
src/harness/cursor/ObservationJournal.ts
src/harness/cursor/AcpToolAccumulator.ts
src/harness/cursor/AcpEventNormalizer.ts
src/harness/cursor/CursorExecutorHarness.ts
src/quality/EvidenceVerifier.ts
src/quality/EvidenceService.ts
src/orchestrator/RecoveryManager.ts
src/orchestrator/Orchestrator.ts
tests/state/**
tests/quality/**
tests/harness/cursor/**
tests/orchestrator/**
```

## Verification context

Extend `VerificationContext` to carry the authoritative identity required by the current run.

Suggested shape:

```ts
interface VerificationContext {
  runId: string;
  stage: string;
  attempt: number;
  sessionId: string;
  qualityEpochId: string;
  expectedPatchFingerprint: string;
  lastMutationSequence?: number;
  orchestratorDiffCheckOk: boolean;
  workspace: string;
}
```

Optional fields should be used only where the information truly cannot exist. Normal stage quality verification should provide all identity fields.

## Observation eligibility

Centralize eligibility logic rather than applying several permissive filters inline.

Example concept:

```text
isObservationEligible(observation, context)
```

It should check:

- source is not broker for quality proof;
- run id matches;
- stage matches;
- attempt matches;
- session id matches;
- quality epoch matches;
- cwd/workspace matches when recorded;
- observation status/exit are usable.

Diagnostics should explain which dimensions caused candidate observations to be rejected.

## Quality epoch marker

Add a durable record when a new epoch begins.

Possible journal schema:

```json
{
  "record_type": "quality_epoch_started",
  "run_id": "...",
  "stage": "...",
  "attempt": 2,
  "session_id": "...",
  "quality_epoch_id": "...",
  "sequence": 143,
  "timestamp": "..."
}
```

Command observations remain separate records.

Replay walks markers + observations in sequence and assigns the active epoch deterministically.

If the current journal format must stay command-only, persist epoch markers in a separate versioned JSONL file. Do not infer epochs from timestamps.

## Evidence validator

Create one shared validator returning either typed evidence or structured validation errors.

Validate all fields used by workflow decisions:

```text
stage
attempt
status
quality_command
quality_exit_code
git_diff_check_exit_code
focused_tests
quality_summary
changed_files
unresolved
patch_fingerprint (required for reusable/corroborated evidence)
quality_epoch_id (required for reusable/corroborated evidence)
```

Raw executor evidence and persisted corroborated evidence may use separate validation levels if needed:

```text
validateRawExecutionEvidence
validateCorroboratedEvidence
```

## Resumed evidence

Refactor the orchestration flow so all evidence, fresh or resumed, ends at the same mechanical verification decision.

Do not keep:

```text
if (!isResumed && !corroboration.ok)
```

The only resume optimization should be avoiding executor re-execution when persisted observations and evidence can be revalidated successfully.

## State validators

`validateRunState()` must recursively validate the fields required to safely resume.

`validateStageRuntimeState()` must validate every workflow-relevant optional field when present.

`loadStage()` behavior:

```text
file missing -> documented pending default
file present + valid -> typed state
file present + invalid/corrupt -> RunStateError
```

## Recovery

Recovery must:

1. load validated state;
2. load/rebuild validated observations;
3. load validated evidence;
4. calculate authoritative current Git checks/fingerprint;
5. run the same corroborator used in normal execution;
6. route to REVIEW only if every invariant passes;
7. otherwise route to QUALITY;
8. preserve dry-run non-mutation behavior.

## Regression tests

Add explicit tests for:

1. wrong quality epoch rejected;
2. missing quality epoch rejected in scoped verification;
3. wrong session rejected;
4. missing session rejected when context requires one;
5. wrong run id rejected;
6. old-attempt observation rejected even if command/exit match;
7. corrupt reusable evidence rejected;
8. reusable FAIL evidence rejected;
9. reusable evidence with non-zero exit rejected;
10. reusable evidence with unresolved items rejected;
11. resumed evidence with failed corroboration routes to QUALITY;
12. recovery with missing patch fingerprint routes to QUALITY;
13. recovery with wrong epoch routes to QUALITY;
14. raw replay reconstructs epoch boundaries;
15. corrupt stage-state file throws `RunStateError`;
16. nested invalid `RunState.stages[]` is rejected;
17. missing stage-state file still returns intentional pending default.
