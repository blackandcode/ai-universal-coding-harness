# Coding Agent Prompt — Stage 04

Implement **Stage 04: Configuration Contract Fidelity** using the accompanying functional and technical specifications.

## Rules

1. Read `AGENTS.md`, `docs/configuration.md`, and the architecture, adapter-protocol, workflow-state, and testing skills.
2. Close **F-12**, **F-13**, and **F-14** only; do not re-audit already-implemented Stage 06 reviewer routing unless a test proves a regression.
3. Enforce `maxUniqueQuestionsPerStage` in `Orchestrator.questionDecision` (or adjacent stage-scoped helper), not in harness adapters.
4. Apply **reviewer.\<role\> overrides `harnesses.\<adapter\>`** for tunable fields; wire Codex reviewer through `HarnessContext`, not only global `harnessString('codex', ...)`.
5. Add config contract tests under `tests/config/` and extend `ReviewerRouter` / orchestrator tests as specified in the technical spec.
6. Align `config.example.jsonc`, `src/config/templates.ts`, and `docs/configuration.md` with runtime precedence.
7. Do not change evidence epoch, recovery, or CI coverage gates (Stages 02–03).
8. Stage 01 typing work is complementary: add context fields only as needed for F-13; do not expand Stage 01 scope into question budgets.
9. Update `CHANGELOG.md`, gap-closure `IMPLEMENTATION-STATUS.md`, and `DECISIONS.md` if precedence becomes a documented architectural contract.

## Key code paths

```text
Orchestrator.questionDecision
ReviewerRouter.resolveHarness
CodexReviewerHarness / CodexProcessRunner
CursorReviewerHarness
src/config/validation.ts
tests/config/
```

## Verification

During development:

```bash
npm run check:changed
```

Before completing the stage:

```bash
npm run verify
npm pack --dry-run
```

Completion requires demonstrated tests for question budget enforcement, role override precedence, and config contract regressions—not code inspection alone.
