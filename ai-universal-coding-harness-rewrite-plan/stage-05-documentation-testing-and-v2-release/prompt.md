# Coding Agent Prompt — Stage 05

Implement only Stage 05.

Read:

- `AGENTS.md`
- Stage 05 specs
- `.agents/skills/testing-engineering/SKILL.md`
- `.agents/skills/release-readiness/SKILL.md`
- `.agents/skills/trusted-publishing/SKILL.md`
- `.agents/skills/typescript-engineering/SKILL.md`
- `.agents/skills/nodejs-engineering/SKILL.md`
- `.agents/skills/react-engineering/SKILL.md`

Start from a fully green Stage 04.

Tasks:

1. identify remaining test gaps;
2. add deterministic orchestration/integration tests;
3. add package-consumer tests;
4. establish native Node coverage gates;
5. update all docs and Mermaid diagrams;
6. verify and enforce top-of-file docblock descriptions on every file in the codebase;
7. update top-level docblocks for any files edited or expanded across stages to reflect added functionality;
8. review all functions, classes, interfaces, and types for comprehensive JSDoc/TSDoc docblocks;
9. document complex internal logic, algorithms, and non-obvious invariants across all modules with clear docblocks and inline comments;
10. remove stale comments and migration artifacts;
11. update agent rules/skills;
12. set version `2.0.0`;
13. update changelog;
14. validate CI and Trusted Publishing workflows;
15. run full release verification.

Rules:

- every file added or edited must have a top-of-file docblock describing its purpose, scope, and architectural responsibility;
- if editing an existing file and adding functionality, update the top-level docblock so it reflects the new functionality;
- all functions, classes, interfaces, and internal logic must have thorough docblock documentation;
- do not change architecture merely to satisfy coverage.

Final required checks:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:coverage
npm run test:cli
npm run verify
npm pack --dry-run
```

Also verify the packed tarball using a temporary consumer project.

Update `IMPLEMENTATION-STATUS.md` to complete and finalize `DECISIONS.md`.

Do not publish automatically unless the human explicitly requests publication.
