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
- avoid line-by-line trivial JSX comments, but provide thorough docblocks for all components, hooks, functions, classes, interfaces, and types;
- every file added or edited must have a top-of-file docblock describing what the file is about, its UI/CLI role, and rendering responsibilities;
- if editing an existing file across stages, update the top-of-file docblock so it reflects the changes and added functionality;
- document internal logic (such as reducer transitions, terminal layout calculations, viewport slicing, ANSI/stream parsing, and keyboard focus routing) with clear docblocks and inline comments where possible.

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
