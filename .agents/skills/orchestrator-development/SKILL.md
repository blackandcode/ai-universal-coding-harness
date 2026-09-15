---
name: orchestrator-development
description: Use when changing AI Universal Coding Harness core flow, state, permissions, Git lifecycle, configuration, project initialization, or terminal UI. Ensures harness-neutral architecture and autonomy invariants.
---

# Orchestrator Development

1. Read `AGENTS.md` and the relevant `/docs` architecture page before editing.
2. Keep orchestration logic independent from Cursor/Codex-specific flags and protocol quirks.
3. Do not add a numeric permission/review limit that directly blocks an otherwise recoverable stage.
4. Preserve one-run/one-branch and one-stage/one-commit invariants.
5. Preserve `.ai-orchestrator/` as the single local runtime workspace in target repositories.
6. Validate stage packages before branch creation or implementation.
7. Prefer Node APIs and npm libraries over OS-specific shell dependencies.
8. Add/update tests for state transitions and failure paths.
9. Run `npm run verify` before completion.
