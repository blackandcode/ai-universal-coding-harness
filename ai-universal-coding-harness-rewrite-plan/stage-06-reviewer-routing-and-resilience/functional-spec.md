# Functional Specification — Stage 06: Reviewer Routing, Fallback and Orchestrator Resilience

## Objective

Make reviewer execution resilient against quota exhaustion, provider outages, process crashes, and large diff truncation.

Introduce a multi-tier, role-based reviewer routing architecture with automatic fallback capabilities, large-diff context routing, and cost-optimized permission evaluation.

## Incident Retrospective (Run 20260915T193118Z-76e14b)

During `stage-01-modern-toolchain-and-quality-foundation`, attempt 3 achieved corroborated passing quality evidence (`npm run check` -> 0, `git diff --check` -> 0). However, the run terminated abruptly during review 006:

```json
{"type":"error","message":"You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 11:00 PM."}
{"type":"turn.failed","error":{"message":"You've hit your usage limit..."}}
```

The run suffered from four distinct architectural deficiencies:

1. **Subprocess Crash Without Result:** Codex exited with code 1 before producing `result.json`. The reviewer harness treated non-zero exit as fatal.
2. **Absence of Fallback Routing:** The orchestrator possessed only a single hard-wired reviewer adapter with no failover mechanism when the primary reviewer became unavailable.
3. **Rigid Error Classification:** The error was classified as generic `'failed'` rather than `external_dependency` or `retryable_error`, permanently stalling the stage.
4. **Diff Truncation:** In review attempt 2, repository formatting produced 534,000 characters of diff, which exceeded the default 500,000 `maxDiffChars` limit. The reviewer was blinded to new test suites and documentation, triggering a REWORK verdict.

This stage resolves all four failure modes.

## Scope

Refactor and extend:

- `src/harness/types.ts`
- `src/harness/registry.ts`
- `src/harness/codex/CodexReviewerHarness.ts`
- `src/harness/cursor/CursorReviewerHarness.ts` (new schema-constrained reviewer adapter)
- `src/orchestrator/services/ReviewerRouter.ts` (new)
- `src/orchestrator/services/ReviewPayloadBuilder.ts` (new)
- `src/harness/ReviewerErrorClassifier.ts` (new)
- `src/orchestrator/Orchestrator.ts`
- `src/config/**`
- `src/permissions/**`

## Required Outcomes

### 1. Multi-Tier Reviewer Routing Architecture

The orchestration engine must interact with a unified `ReviewerRouter` rather than a single fixed reviewer adapter.

The router dispatches reviewer requests across four specialized roles:

```text
ReviewerRouter
  ├── primaryReviewer     (default: Codex / gpt-6-astra)
  ├── fallbackReviewer    (default: Cursor / gemini-3.8-flash high)
  ├── largeDiffReviewer   (default: Cursor / gemini-3.8-flash high)
  └── permissionReviewer  (default: Cursor / composer-2.5-fast low)
```

Each role is independently configurable by harness ID, model name, reasoning effort / thinking level, timeout, and execution parameters.

### 2. Automatic Reviewer Fallback

When any reviewer invocation (plan review, implementation review, question answering, or permission evaluation) fails due to an infrastructure or provider failure:

- The orchestrator intercepts the failure before marking the stage as blocked or failed.
- The failure is classified using `ReviewerErrorClassifier`.
- Recognized fallback trigger conditions:
  - Usage limit or quota exhaustion (matching `usage limit`, `rate limit`, `quota`, `429`);
  - Process exit non-zero without writing `result.json`;
  - Protocol turn failure (`turn.failed`);
  - Subprocess timeout or network disconnection.
- When `reviewer.fallback.enabled` is `true` (default), the router immediately dispatches the exact same review payload and schema to the configured `fallbackReviewer`.
- **Default Fallback Model:** **Gemini High** executed via the **Cursor harness** (`cursor` adapter with `model: "gemini-3.8-flash"` and `thinking: "high"`).
- Emits semantic event:
  ```jsonc
  {
    "type": "reviewer.fallback",
    "payload": {
      "stage": "stage-01-modern-toolchain-and-quality-foundation",
      "attempt": 3,
      "decision_type": "final-review",
      "failed_harness": "codex",
      "failed_model": "gpt-6-astra",
      "trigger": "usage_limit",
      "fallback_harness": "cursor",
      "fallback_model": "gemini-3.8-flash",
    },
  }
  ```
- Persists fallback execution metadata in `reviewer-decisions/<stage>/<seq>-<kind>/result.json`:
  ```jsonc
  {
    "verdict": "APPROVE",
    "summary": "...",
    "_orchestrator_meta": {
      "executed_by": "cursor:gemini-3.8-flash",
      "fallback_from": "codex:gpt-6-astra",
      "trigger": "usage_limit",
    },
  }
  ```
- If both primary and fallback fail, the run status is set to `external_dependency` (if quota/auth) or `retryable_error` (if timeout/disconnect), preserving `stage-state.json` at `phase: "review"` for resumption.

### 3. Model Routing for Large Diffs

Monolithic diffs from repository-wide formatting, AST transforms, or large feature additions must not blind the reviewer.

- The orchestrator measures the unified diff character and estimated token size prior to invoking implementation review.
- If the diff size exceeds `reviewer.largeDiff.thresholdChars` (default: **300,000 characters**):
  - The review is routed directly to the designated `largeDiffReviewer`.
  - **Default Large-Diff Model:** **Gemini High** executed via the **Cursor harness** (`gemini-3.8-flash`, leveraging its 1M+ token context window and structured schema enforcement).
  - Configurable to any harness-supported model (e.g. `composer-2.5`, `gemini-3.8-flash`, `gpt-6-astra`).
- `ReviewPayloadBuilder` structures the payload:
  - Full unified diff when within the model's context envelope;
  - `diff_stat` overview and `changed_files` list always included;
  - If truncation is strictly unavoidable, auto-include full content for `requested_paths` from prior `NEEDS_CONTEXT` reviews.

### 4. Cost-Optimized Reviewer for Command Approvals (Permissions)

Evaluating routine command execution requests (`git diff --check`, `npm test`, directory probes) does not require expensive flagship reasoning models.

- Permission requests during executor runs route to `permissionReviewer`.
- **Default Permission Model:** Configured to use a fast, lightweight model (such as `composer-2.5-fast` via `cursor` harness or `gpt-5-mini` via `codex`) with low reasoning mode (`reasoningEffort: "low"`, `thinking: "low"`).
- Bounded fast timeout (default: 30 seconds).
- Strict non-blocking invariant: permission decision volume must never terminate or block a stage.

### 5. Unified Configuration Contract

Configuration in `.ai-orchestrator/config.jsonc`:

```jsonc
{
  "executorHarness": "cursor",
  "reviewerHarness": "codex",
  "reviewer": {
    "primary": {
      "harness": "codex",
      "model": "gpt-6-astra",
      "reasoningEffort": "medium",
      "timeoutMinutes": 8,
    },
    "fallback": {
      "enabled": true,
      "harness": "cursor",
      "model": "gemini-3.8-flash",
      "thinking": "high",
      "triggers": ["usage_limit", "rate_limit", "no_result", "process_crash", "timeout"],
    },
    "largeDiff": {
      "thresholdChars": 300000,
      "harness": "cursor",
      "model": "gemini-3.8-flash",
      "thinking": "high",
    },
    "permission": {
      "harness": "cursor",
      "model": "composer-2.5-fast",
      "thinking": "low",
      "reasoningEffort": "low",
      "timeoutSeconds": 30,
    },
  },
}
```

Backward compatibility: if `reviewer` block is omitted, existing top-level `reviewerHarness` and `harnesses.codex` settings apply to `primary`, with sensible defaults for `fallback`, `largeDiff`, and `permission`.

## Non-Goals

- The reviewer must never execute implementation commands, tests, or Git mutations.
- The fallback mechanism must never lower review quality standards or bypass schema validation.
- Fallback invocation must not consume stage `MAX_EXECUTION_ATTEMPTS`.
- No live external API calls in unit or integration test suites.

## Acceptance Criteria

1. **Simulated Quota Failover:** Injecting a simulated Codex exit 1 with usage limit error in tests automatically triggers the Cursor Gemini fallback reviewer and succeeds.
2. **Large Diff Routing:** A review payload with diff exceeding 300,000 characters automatically selects the `largeDiff` reviewer.
3. **Permission Routing:** Permission checks route to the lightweight model with short timeout.
4. **Metadata Preservation:** Review decisions record whether fallback occurred and the triggering condition.
5. **Resume Continuity:** Runs interrupted during review preserve `phase: "review"` and resume without re-running executor quality checks when the patch fingerprint is unchanged.
