# Functional Specification — Stage 04: Configuration Contract Fidelity

## Objective

Close findings **F-12**, **F-13**, and **F-14** so that documented configuration options, example templates, and runtime behavior stay aligned.

Users and coding agents should be able to trust `config.example.jsonc`, `docs/configuration.md`, and `ai-harness init` placeholders without re-auditing the tree.

## Already implemented (do not re-open)

Most keys surfaced in `config.example.jsonc` after Stage 06 documentation work are **already wired**. Stage 04 must not duplicate that audit. Treat the following as **in scope only for contract tests / doc examples**, not new feature work:

- `reviewer` multi-tier routing (`primary`, `fallback`, `largeDiff`, `permission`) via `ReviewerRouter`;
- fallback triggers and `ReviewerErrorClassifier` failover;
- `reviewer.fallbackTriggers`, large-diff thresholds, and context bounding (`maxDiffChars`, `maxContextFileChars`);
- UI and log budgets (`uiEventCoalesceMs`, `uiDashboardMaxRows`, `runLogMaxBytes`, `focusLogMaxBytes`);
- harness namespaces (`harnesses.cursor`, `harnesses.codex`, custom `harnessModules`);
- permission mode, plan-review limits, executor/reviewer harness selection at the top level.

Stage 04 focuses on **gaps** where config is loaded or documented but behavior does not match.

## Findings addressed

| ID   | Gap                                                                                                                                                                                                                                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-12 | `maxUniqueQuestionsPerStage` is validated and exposed on `CONFIG` but is **not enforced** in the orchestrator question flow (`Orchestrator.questionDecision`).                                                                                                                                                               |
| F-13 | `reviewer.<role>` Codex-tunable fields are merged into `HarnessContext` by `ReviewerRouter`, but **Codex** (and partially **Cursor**) adapters still read `harnesses.<adapter>` via `harnessString` / `harnessNumber` instead of role context; precedence between `reviewer.*` and `harnesses.*` is undocumented at runtime. |
| F-14 | No **config contract** tests; examples and product docs can drift (for example dual Codex `verbosity` / `reasoningEffort` under `harnesses.codex` vs `reviewer.primary`).                                                                                                                                                    |

## Required outcomes

### 1. Enforce distinct question budget per stage (F-12)

When the executor presents blocking questions, the orchestrator must cap **distinct question fingerprints** per stage using `maxUniqueQuestionsPerStage`.

- Fingerprinting should match the existing cache key strategy (stable hash of title + question payload) used in `questionDecision`.
- When the cap is exceeded, the stage must **not** block on additional unique questions: apply an autonomous fallback (for example first option per question, consistent with current fallback copy) and continue.
- Exceeding the budget must **not** fail the stage solely because of question volume (same non-blocking semantics as permission-review volume limits).
- Emit a semantic UI/event (for example `executor.question.budget` or equivalent on `EventBus`) so operators can see budget exhaustion.

### 2. Apply reviewer role configuration at runtime (F-13)

**Normative precedence (implementers):** for `ReviewerRouter` roles, `reviewer.<role>` overrides `harnesses.<adapter>` for adapter-tunable fields:

- `model`, `binary`
- `reasoningEffort`, `verbosity`, `contextMode` (Codex)
- `thinking` (Cursor)
- `timeoutMinutes`, `timeoutSeconds`

Role-specific values must reach subprocess/spawn options for the adapter instance created for that role. Global `harnesses.codex` / `harnesses.cursor` remain defaults when a role omits a field.

Document this precedence in `docs/configuration.md` when implementing Stage 04 (not required for gap-doc-only pass).

### 3. Config contract tests and example alignment (F-14)

Add focused tests under `tests/config/` (and harness/router tests where needed) that assert:

- validated config keys used in templates appear in the schema/validation path;
- representative `reviewer.primary` overrides change effective harness options (mock or spy on runner inputs);
- `maxUniqueQuestionsPerStage` enforcement behavior (orchestrator-level test);
- example files do not contradict precedence rules (lint or snapshot of documented default keys).

Reconcile `config.example.jsonc`, `src/config/templates.ts`, and `docs/configuration.md` so examples do not imply dual authoritative Codex verbosity sources.

## Dependencies and related stages

- **Stage 01** may add typed fields on `HarnessContext` for role context; it must **not** implement F-12/F-13 behavior or config contract tests.
- **Stage 02** owns evidence epoch and recovery trust; question budgets and reviewer config are **Stage 04**.
- **Stage 03** owns CI/coverage/governance doc accuracy (**F-11**); user-facing **configuration contract** accuracy is **F-14 / Stage 04**.

Run Stage 04 after or alongside Stage 01 if `HarnessContext` typing is in flight. Stages 01–03 remain prerequisites for typing, trust, and CI hardening but Stage 04 does not depend on Stage 02 evidence work.

## Non-goals

- No redesign of `ReviewerRouter` failover policy or fallback trigger sets.
- No change to permission-engine quotas or plan-review cost limits (separate knobs).
- No new third-party config schema library unless justified.
- No ADR required until execution changes the public configuration contract (precedence rule may warrant an ADR at implementation time).

## Stage 04 completion gate (future coding run)

- `maxUniqueQuestionsPerStage` is enforced with regression tests; budget exhaustion is visible via semantic events.
- Codex and Cursor reviewer adapters honor `reviewer.<role>` overrides with the precedence rule above; `ReviewerRouter` tests cover at least primary and permission roles.
- Config contract tests fail when documented keys stop being applied; `config.example.jsonc` and templates match precedence documentation.
- `npm run check:changed` green during iteration; `npm run verify` green at stage completion.
- `CHANGELOG.md` and gap `IMPLEMENTATION-STATUS.md` updated when code ships.
