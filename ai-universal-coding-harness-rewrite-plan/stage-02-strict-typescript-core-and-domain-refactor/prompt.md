# Coding Agent Prompt — Stage 02

Implement only Stage 02.

Read:

- `AGENTS.md`
- Stage 02 specs
- `.agents/skills/typescript-engineering/SKILL.md`
- `.agents/skills/typescript-advanced/SKILL.md`
- `.agents/skills/nodejs-engineering/SKILL.md`
- `.agents/skills/testing-engineering/SKILL.md`

Start by running the Stage 01 quality gate.

Then refactor core modules incrementally:

1. types/domain contracts;
2. configuration;
3. filesystem/process helpers;
4. Git/project/state;
5. stages/planning;
6. CLI parsing/dispatch;
7. public exports.

Rules:

- do not touch Cursor/Codex internals unless a changed shared interface requires a
  minimal adaptation;
- do not redesign the Ink UI;
- use `unknown` only at untrusted boundaries and narrow immediately;
- do not replace `any` with assertions such as `as unknown as X`;
- add unit tests before/with each service refactor;
- keep compatibility behavior unless this stage explicitly documents a
  deprecation;
- add JSDoc to exported/public contracts;
- add inline comments for non-obvious invariants only.

At the end, enable and pass strict TypeScript.

Update `IMPLEMENTATION-STATUS.md` and record material architecture choices in
`DECISIONS.md`.

Do not start Stage 03.
