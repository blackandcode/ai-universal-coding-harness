# ADR: Configuration contract fidelity and reviewer role precedence

- Status: Accepted
- Date: 2026-09-16

## Context

In AI Universal Coding Harness 2.1.2–2.2.1, several configuration fidelity and runtime contract gaps were identified across question flow, reviewer routing, and documentation templates (Modernization Audit Findings F-12, F-13, and F-14):

1. **Unenforced Distinct Question Budget (Finding F-12)**: `maxUniqueQuestionsPerStage` was loaded, exposed in `DEFAULT_CONFIG`, and clamped in `validateAndNormalizeConfig()`, but `Orchestrator.questionDecision()` never tracked distinct question count or read `CONFIG.maxUniqueQuestionsPerStage`. An interactive executor presenting an unbounded loop of blocking multiple-choice questions could stall or drain API budgets indefinitely.
2. **Reviewer Role Precedence Disconnect (Finding F-13)**: `ReviewerRouter.resolveHarness()` constructed `mergedContext` with basic model/binary fields but omitted tunables like `verbosity` and `contextMode`. More importantly, `CodexReviewerHarness` read its settings strictly from `harnesses.codex` via `harnessString()` and `harnessNumber()` in field initializers, ignoring role-specific tunables passed in `HarnessContext`. The precedence hierarchy between role configurations (`reviewer.<role>`) and global adapter settings (`harnesses.<adapter>`) was neither normative nor enforced at runtime.
3. **Configuration Contract Drift (Finding F-14)**: The repository lacked automated configuration contract tests. As a result, documentation (`docs/configuration.md`), example templates (`config.example.jsonc`), and scaffolding templates (`src/config/templates.ts`) drifted, presenting conflicting values (such as dual conflicting Codex `verbosity` values under `harnesses.codex` versus `reviewer.primary`).

## Decision

We establish an authoritative configuration contract governing question budgets, reviewer role overrides, and template consistency:

1. **Non-Blocking Distinct Question Budget Enforcement (F-12)**:
   - In `Orchestrator.runStage()`, track distinct question payloads for the active stage using a set of payload hashes (`sha256Text(JSON.stringify({ title, questions }))`).
   - Identical question payloads hit the stage cache without consuming additional budget.
   - When the count of unique questions reaches `CONFIG.maxUniqueQuestionsPerStage`, the orchestrator ceases calling the reviewer harness.
   - In accordance with the core architectural invariant that budgets are cost controls and must never become accidental stage blockers, budget exhaustion does not fail the stage. Instead:
     - An autonomous fallback is applied, selecting the first available option for each question.
     - A semantic event `executor.question.budget` is emitted via `EventBus`.
     - An explanatory note is appended to the stage `DECISIONS.md`.
     - The autonomous verdict is cached so subsequent identical questions return immediately without duplicate notifications.

2. **Normative Reviewer Role Precedence Hierarchy (F-13)**:
   - For all reviewer roles (`primary`, `fallback`, `large_diff`, `permission`), settings resolve according to the strict precedence:
     ```text
     role context value (reviewer.<role>.*)
       ?? global harness config (harnesses.<adapter>.*)
       ?? adapter static defaults
     ```
   - For adapter-tunable fields: `model`, `binary`, `reasoningEffort`, `verbosity`, `contextMode`, `thinking`, `timeoutMinutes`, and `timeoutSeconds`.
   - `HarnessContext` is extended to include optional `verbosity`, `contextMode`, and timeout fields.
   - `ReviewerRouter.resolveHarness()` forwards all configured role tunables into `HarnessContext`.
   - `CodexReviewerHarness` and `CursorReviewerHarness` constructors apply context overrides with explicit precedence over `harnesses.<adapter>` before delegating to process runners.
   - `CodexProcessRunner` receives resolved options directly from the adapter instance, with zero parallel configuration reads.

3. **Automated Configuration Contract Tests and Template Synchronization (F-14)**:
   - Add `tests/config/contract.test.ts` asserting:
     - Clamping and exposure of `maxUniqueQuestionsPerStage` in normalized config.
     - Role override precedence over `harnesses.<adapter>` in effective runner options.
     - Clean inheritance of `harnesses.<adapter>` and static defaults when role fields are omitted.
     - Validity of all configuration templates (`configTemplate()`, `projectPlaceholderConfigTemplate()`, and `config.example.jsonc`) against schema rules.
   - Reconcile `config.example.jsonc`, `src/config/templates.ts`, and `docs/configuration.md` to eliminate conflicting duplicate keys.

## Alternatives considered

- **Alternative 1: Terminate the stage with failure when question budget is exceeded**:
  - _Cost_: Violates core architectural invariant: permission-review, plan-review, and question-review limits are cost controls and safety bounds, not blockers.
  - _Why rejected_: Stalling or failing a multi-hour stage execution due to question volume harms autonomy; autonomous fallback to first options safely allows execution to continue.

- **Alternative 2: Perform config inheritance inside ReviewerRouter instead of passing context to adapters**:
  - _Cost_: Couples the router to adapter-specific defaults and configuration namespaces.
  - _Why rejected_: The engine must remain harness-neutral. Adapters own their own default fallbacks and model-specific parameter translations. Passing role context preserves adapter decoupling.

- **Alternative 3: Read configuration directly in CodexProcessRunner**:
  - _Cost_: Introduces redundant configuration reads and potential divergence between harness metadata and runner flags.
  - _Why rejected_: Single direction of data flow: `ReviewerRouter` -> `HarnessContext` -> `ReviewerHarness` -> `ProcessRunner`.

## Consequences

- **Positive**:
  - Stage execution cannot be trapped in unbounded question loops.
  - Operators can fine-tune individual reviewer roles (e.g., lightweight model and low timeout for permissions; high reasoning for primary review) without affecting global adapter defaults.
  - CI prevents configuration options and documentation examples from silently drifting out of sync with runtime execution.
- **Negative / Trade-offs**:
  - Once question budget is reached, subsequent distinct questions receive deterministic first-option answers rather than human or reviewer deliberation.
- **Compatibility / Migration**:
  - Fully backward compatible: setups specifying only top-level `reviewerHarness` or `harnesses.*` continue functioning with existing defaults.

## Verification

- `tests/orchestrator/orchestrator-decisions.test.ts`: Question budget enforcement, event emission, first-option fallback, and caching.
- `tests/orchestrator/services/ReviewerRouter.test.ts`: Role context merging across primary, fallback, large-diff, and permission roles.
- `tests/harness/codex/CodexReviewerHarness.test.ts`: Precedence of context over `harnesses.codex` and static defaults for all tunables.
- `tests/config/contract.test.ts`: End-to-end config contract and template validation.
- `npm run verify`: 9-step quality verification chain passing.

## Revisit triggers

- Changes to configuration schema format or introduction of new reviewer roles.
- Introduction of streaming or interactive question protocols requiring partial answer accumulation.
