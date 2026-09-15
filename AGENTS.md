# AI Universal Coding Harness — Agent Guide

## Mission

Maintain a cross-platform TypeScript CLI that orchestrates staged AI software development. The engine must remain harness-neutral; Cursor and Codex are default adapters, not architectural assumptions.

## Architectural boundaries

- `src/orchestrator/` owns stage flow only.
- `src/harness/` owns agent-specific binaries, models, protocols, and context behavior.
- `src/permissions/` owns autonomous permission classification/policy.
- `src/git/` owns branch/commit lifecycle. Harnesses must never own push/merge/rebase/reset behavior.
- `src/project/` owns target-project initialization and local workspace/history lifecycle.
- `src/stages/` owns stage source resolution, validation, and planning coordination.
- `src/state/` owns persisted run state and locking.
- `src/ui/` consumes semantic events; UI must never become the source of orchestration truth.
- Keep machine state JSON and retrospective/audit artifacts Markdown.

## Non-negotiable behavior

- `ai-harness init` creates a single `.ai-orchestrator/` local workspace and does not create tracked project changes.
- Selected stages are validated before implementation or AI branch creation.
- One run uses one dedicated AI branch.
- One approved stage produces one commit named after the stage folder.
- Never push or merge automatically.
- Permission-review volume must never terminate a stage by itself.
- Plan-review limits are cost controls, not blockers; final consolidation proceeds with carry-over findings.
- Executor runs code/tests; reviewer reasons about evidence and decisions.
- Preserve cross-platform behavior: no Bash/unzip/Unix-only runtime assumptions.
- Target project harness subprocesses must use the intended repository working directory when project-native rules/skills/tools are expected.
- npm release automation uses Trusted Publishing/OIDC and must not introduce long-lived npm publish tokens.

## Quality

Before completing code changes:

```bash
npm run typecheck
npm test
npm run verify
npm pack --dry-run
```

Update documentation and `CHANGELOG.md` for user-visible changes. Preserve semantic versioning.
