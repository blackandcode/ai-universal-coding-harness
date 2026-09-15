# Git lifecycle

Git lifecycle is orchestrator-owned and implemented through the Git module.

## Invariants

- no AI branch before selected-stage validation and preflight succeed;
- executor/reviewer do not create stage commits;
- no commit before corroborated quality plus reviewer approval;
- exactly one stage-named commit per completed stage;
- no automatic push/merge by default;
- hard-dangerous history rewrites remain outside autonomous agent permission;
- resume verifies branch/repository assumptions before continuing.

## Mechanical truth

Git-specific checks such as diff hygiene belong in `GitRepository`/Git abstractions. They may feed quality verification because Git lifecycle is already an orchestrator authority. Do not duplicate raw Git shell commands in quality/orchestrator/UI code.

## Idempotent commit continuation

After interruption around commit time, determine whether the expected stage commit already exists before attempting another commit. Persist commit outcome/identity so resume cannot accidentally produce a duplicate stage commit.
