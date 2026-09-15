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
6. review all exported code for JSDoc;
7. review non-obvious code for useful inline comments;
8. remove stale comments and migration artifacts;
9. update agent rules/skills;
10. set version `2.0.0`;
11. update changelog;
12. validate CI and Trusted Publishing workflows;
13. run full release verification.

Do not change architecture merely to satisfy coverage.

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
