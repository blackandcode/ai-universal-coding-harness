# Coding Agent Prompt — Stage 01

Implement only Stage 01.

Before coding:

1. Read repository `AGENTS.md`.
2. Read these skills:
   - `.agents/skills/typescript-engineering/SKILL.md`
   - `.agents/skills/nodejs-engineering/SKILL.md`
   - `.agents/skills/quality-engineering/SKILL.md`
   - `.agents/skills/testing-engineering/SKILL.md`
3. Read this stage's `functional-spec.md` and `technical-spec.md`.
4. Inspect the actual current `package.json`, lockfile and CI before changing
   anything.

Important:

- Do not refactor product modules yet except where formatting/config requires it.
- Preserve runtime behavior.
- Prefer one formatter and one linting stack.
- Keep Node's built-in test runner.
- Do not introduce `any` suppression comments merely to make lint green.
- Do not hide dependency/type errors with broad `skipLibCheck` unless a verified
  third-party incompatibility requires a narrow documented exception.
- Format the repository after tooling is configured.
- Add tests for tooling/package invariants where practical.

Finish by running:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:cli
npm run verify
npm pack --dry-run
```

Update `IMPLEMENTATION-STATUS.md` and `DECISIONS.md`.
Do not start Stage 02.
