# Execution Flow

## Run lifecycle

```mermaid
flowchart TD
    Start[Start run] --> Freeze[Freeze selected stage specs + hashes]
    Freeze --> Preserve{Working tree dirty?}
    Preserve -->|Yes| Stash[Create named pre-run stash]
    Preserve -->|No| Branch
    Stash --> Branch[Create/switch dedicated AI branch]
    Branch --> Stage[Execute selected stage]
    Stage --> More{More explicit stages?}
    More -->|Yes| Stage
    More -->|No| Done[Run completed; stay on AI branch]
    Done --> Human[Human tests/reviews/merges]
```

The branch is created only when stage planning begins. No worktree is created.

## Stage lifecycle

```mermaid
flowchart TD
    S[Stage start] --> Reuse{Reusable approved plan?}
    Reuse -->|Yes| Implement
    Reuse -->|No| Plan[Executor creates complete plan]
    Plan --> Review[Reviewer compares full plan to ALL frozen inputs]
    Review --> Verdict{Plan verdict}
    Verdict -->|APPROVE| Implement[Executor implementation]
    Verdict -->|REPLAN and regular reviews remain| Plan
    Verdict -->|Review budget exhausted| FinalReview[One final consolidation review]
    FinalReview --> Carry[Accept plan + carry all unresolved findings]
    Carry --> Implement
    Implement --> Quality[Executor runs focused tests + full quality + git diff --check]
    Quality --> Evidence[Write evidence.json]
    Evidence --> Corroborate[Orchestrator cross-checks ACP/tool exit results]
    Corroborate -->|Mismatch/fail| Implement
    Corroborate -->|Green| HumanReview[Reviewer final patch/evidence review]
    HumanReview -->|REWORK| Implement
    HumanReview -->|APPROVE| Commit[Commit exact stage folder name]
```

## Plan-review rule

The reviewer gets up to `MAX_PLAN_REVIEWS` normal opportunities to identify **all** material gaps in one response.

After that, one final consolidation review is allowed. This pass is advisory and **cannot block execution**. Remaining findings become mandatory implementation carry-over.

If the executor submits the same unchanged plan repeatedly, the coordinator detects convergence and avoids repeatedly paying for the same review.

## Permission rule

Permission decisions have no stage-ending quota. A denied operation means only:

> that exact operation is not approved; choose another safe implementation path.

It never means “block the whole stage.”

## Quality evidence corroboration and recovery

```mermaid
flowchart TD
  subgraph ExecutorRun [1. Executor Quality Phase]
    ExecCmd[Executor executes quality command] --> Out[Capture exit code, stdout, stderr]
    Out --> WriteEvidence[Executor writes evidence.json]
  end

  subgraph MechanicalVerification [2. Mechanical Corroboration]
    WriteEvidence --> ReadEv[EvidenceVerifier reads evidence.json]
    ObsJournal[ObservationJournal captures tool calls & exits] --> MatchObs{Exit code 0 & command observed?}
    ReadEv --> MatchObs
    GitRepo[GitRepository diffCheck & patchFingerprint] --> MatchDiff{Diff clean & valid?}
    MatchObs -->|PASS| MatchDiff
    MatchObs -->|FAIL / missing observation| RejectEv[Mark evidence uncorroborated]
    MatchDiff -->|PASS| Corroborated[Save corroborated evidence JSON + MD]
    MatchDiff -->|FAIL| RejectEv
  end

  subgraph ReviewerEvaluation [3. Reviewer Final Evaluation]
    Corroborated --> RevPrompt[Reviewer receives corroborated evidence + git diff]
    RevPrompt --> Verdict{Reviewer verdict}
    Verdict -->|APPROVE| CommitStage[Commit stage to dedicated AI branch]
    Verdict -->|REWORK| NextAttempt[Increment attempt & rerun executor with feedback]
    RejectEv --> NextAttempt
  end
```

The orchestrator mechanically cross-checks executor `evidence.json` against observed commands recorded by the executor harness session (including tool calls, command exits, and background broker executions). Neither executor assertions nor reviewer declarations can bypass mechanical corroboration:

1. **Command Observation**: The exact quality command and subcommands must be recorded in the `ObservationJournal` with exit code `0`.
2. **Patch Fingerprint**: The repository working tree must produce a valid patch fingerprint matching the observed test run.
3. **Artifact Integrity**: Corroborated evidence is persisted in both machine-readable `evidence-corroborated.json` and human-auditable `EVIDENCE_CORROBORATED.md`.

If a stage run was interrupted or failed due to missing observations in an earlier session, the automated recovery command can reconstruct observations from historical logs and transition the stage safely:

```bash
# Preview what will be recovered (safe dry-run, no state modified)
ai-harness recover [--run <id>] [--stage <name>]

# Apply recovery, create timestamped backups, and write corroborated evidence
ai-harness recover [--run <id>] [--stage <name>] --apply

# Resume the run to proceed to reviewer evaluation and commit
ai-harness resume [--run <id>]
```
