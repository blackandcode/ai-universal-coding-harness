# Project invariants

Treat these as architectural constraints. A change that intentionally breaks one requires explicit product/architecture approval and migration design.

1. All selected stage specifications are validated before an AI branch is created.
2. Frozen, hashed stage specifications are the source of truth for a run.
3. The executor performs implementation and project quality commands.
4. The reviewer reviews/decides and does not mutate the target repository.
5. The orchestrator owns lifecycle coordination, durable phase transitions, and Git branch/commit orchestration.
6. Mechanical quality evidence is corroborated before semantic implementation review.
7. Agent-authored evidence or prose is not sufficient proof by itself.
8. Reviewer `APPROVE` is required before the orchestrator creates the stage commit.
9. `REWORK` returns to implementation without losing audit history.
10. Exactly one orchestrator-owned commit is produced per approved stage.
11. Push/merge remain human-controlled by default.
12. Approved-plan reuse requires valid spec/plan hashes; evidence reuse requires the current patch fingerprint.
13. Permission decisions are operation-scoped; hard-dangerous actions remain denied.
14. Provider adapters are replaceable and provider-specific shapes must not leak into generic orchestration policy.
15. Streamed provider tool state is accumulated/replayed; missing fields in later chunks must not erase earlier facts.
16. Failures remain diagnosable through durable semantic state and raw audit artifacts.
17. Target-repository development policy belongs to the target repository; the global harness does not copy project-specific implementation rules into arbitrary target projects.

When implementation convenience conflicts with an invariant, change the implementation, not the invariant silently.
