# Coding Agent Prompt — Stage 04

Implement only Stage 04.

Read:

- `AGENTS.md`
- Stage 04 specs
- `.agents/skills/react-engineering/SKILL.md`
- `.agents/skills/typescript-engineering/SKILL.md`
- `.agents/skills/testing-engineering/SKILL.md`

Before editing, run the full Stage 03 verification.

Refactor the UI into typed TSX in small steps:

1. extract state/event types;
2. extract pure reducer/selectors;
3. extract event-file handling;
4. create typed components;
5. migrate the app/keyboard handling;
6. add render/interaction tests;
7. remove the old `createElement` implementation.

Rules:

- preserve the semantic event protocol;
- preserve fixed-height dashboard behavior;
- UI must not mutate run business state;
- avoid broad `any`;
- no unnecessary React optimization hooks;
- do not introduce state-management libraries;
- comments explain layout invariants and tricky terminal behavior only.

Finish with:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:cli
npm run verify
```

Update status/decisions. Do not start Stage 05.
