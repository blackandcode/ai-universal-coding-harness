# Coding Agent Prompt — Stage 03

Implement only Stage 03.

Read:

- `AGENTS.md`
- Stage 03 specs
- `.agents/skills/harness-adapter/SKILL.md`
- `.agents/skills/orchestrator-development/SKILL.md`
- `.agents/skills/testing-engineering/SKILL.md`
- `.agents/skills/typescript-engineering/SKILL.md`

Treat protocol payloads as hostile/untrusted boundaries.

First add regression tests for the known ACP partial-update/evidence problems.
Then refactor.

Rules:

- no paid Cursor/Codex calls in unit tests;
- use sanitized fixture JSONL for protocol replay tests;
- never fabricate exit 0 from a completed status;
- never let old-attempt observations prove the current patch;
- never add a permission decision quota that can block implementation;
- reviewer remains decision-only;
- executor remains implementation/test owner;
- keep Git lifecycle in Git modules;
- recovery must not require manual JSON state edits.

Refactor in small commits/steps so failing behavior is easy to isolate.

Finish with:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:cli
npm run verify
```

Update status and decisions. Do not start Stage 04.
