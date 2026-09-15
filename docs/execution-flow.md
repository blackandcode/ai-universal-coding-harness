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
