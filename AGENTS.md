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
- Node runtime minimum is `>=24.18.0`, specified in `.nvmrc` and enforced by `package.json`.
- Code formatting is managed by Oxfmt; linting is managed by Oxlint.

## Quality

### Fast Day-to-Day Quality Gate (Default for Agents)

For day-to-day iterative code changes, agents must run the fast incremental quality gate:

```bash
npm run check:changed
```

This performs Oxfmt formatting check, Oxlint linting, full TypeScript typechecking, and targeted test execution with coverage verification only on modified/touched parts of the codebase.

**Mandatory Post-Run Agent Gate**: Upon completing modifications, agents must execute `npm run check:changed` and ensure that all targeted tests pass and coverage metrics meet or exceed the mandatory thresholds:

- Line coverage: `>= 95%`
- Branch coverage: `>= 85%`
- Function coverage: `>= 95%`

**Agent Directive**: Agents must NOT run the full test suite (`npm test`, `npm run test:coverage`, `npm run verify`, `npm pack --dry-run`) during routine iterations unless explicitly requested by the user.

### Release & Pre-Push Quality Gate

Full repository verification is enforced before git push via the pre-push gate (`scripts/pre-push.mjs`), which halts git push if any check fails:

```bash
npm run verify
npm pack --dry-run
```

Update documentation and `CHANGELOG.md` for user-visible changes. Maintain and improve TSDoc comments across `src/` following `.cursor/rules/tsdoc.mdc` and the `tsdoc-documentation` skill (`.agents/skills/tsdoc-documentation/SKILL.md`). Preserve semantic versioning.
