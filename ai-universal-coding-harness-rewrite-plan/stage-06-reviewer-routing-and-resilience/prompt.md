# Coding Agent Prompt — Stage 06

Implement only Stage 06: Reviewer Routing, Fallback and Orchestrator Resilience.

Read:

- `AGENTS.md`
- Stage 06 specs (`functional-spec.md` and `technical-spec.md`)
- `.agents/skills/harness-adapter/SKILL.md`
- `.agents/skills/orchestrator-development/SKILL.md`
- `.agents/skills/testing-engineering/SKILL.md`
- `.agents/skills/typescript-engineering/SKILL.md`

Start by verifying the repository passes all quality checks:

```bash
npm run check
```

Then implement reviewer routing and resilience incrementally:

1. **Contracts and Configuration:**
   - Define `ReviewerRole`, `ReviewerFallbackTrigger`, `ReviewerModelConfig`, and `ReviewerRouterConfig` in `src/harness/types.ts`.
   - Add schema validation and defaults in `src/config/`.
2. **Error Classification:**
   - Create `ReviewerErrorClassifier` in `src/harness/ReviewerErrorClassifier.ts`.
   - Add unit tests validating classification of usage limits, 429 rate limits, process crashes, and turn failures against real fixtures from run `20260915T193118Z-76e14b`.
3. **Cursor Reviewer Adapter:**
   - Implement `CursorReviewerHarness` in `src/harness/cursor/CursorReviewerHarness.ts` supporting schema-constrained review decisions via Cursor CLI in a read-only sandbox.
   - Register `cursor` in `src/harness/registry.ts` as a valid reviewer harness.
4. **Reviewer Router:**
   - Implement `ReviewerRouter` in `src/orchestrator/services/ReviewerRouter.ts` implementing `ReviewerHarness`.
   - Implement role-based routing:
     - `permissionReviewer` for command permissions (`composer-2.5-fast` / low reasoning);
     - `largeDiffReviewer` for diffs exceeding `thresholdChars` (default `gemini-3.8-flash` high);
     - `primaryReviewer` for standard reviews (`gpt-6-astra` medium);
     - Automatic failover to `fallbackReviewer` (`gemini-3.8-flash` high) upon trigger errors.
5. **Review Payload Builder:**
   - Implement `ReviewPayloadBuilder` in `src/orchestrator/services/ReviewPayloadBuilder.ts` to compute diff metrics, embed `diff_stat`, attach `changed_files`, and manage bounded diff limits without obscuring context.
6. **Orchestrator Integration:**
   - Connect `ReviewerRouter` into `Orchestrator.ts`.
   - Update `classifyError` to map unrecoverable reviewer provider errors to `external_dependency` or `retryable_error` while preserving `phase: "review"` for resumption.
7. **Offline Unit & Integration Tests:**
   - Test fallback failover upon mock primary crash/quota limit.
   - Test threshold-based routing for diffs > 300,000 characters.
   - Test fast-path permission routing.

Rules:

- No paid Cursor or Codex calls in unit tests; all tests must be 100% offline using deterministic mocks and sanitized JSONL fixtures.
- Preserve harness neutrality: `Orchestrator` interacts only with the generic `ReviewerHarness` contract.
- Reviewer must strictly remain decision-only; it must never execute project commands or mutate Git branches.
- Update `IMPLEMENTATION-STATUS.md` and record architectural choices in `DECISIONS.md`.

Finish with:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:cli
npm run verify
```

Do not start Stage 04.
