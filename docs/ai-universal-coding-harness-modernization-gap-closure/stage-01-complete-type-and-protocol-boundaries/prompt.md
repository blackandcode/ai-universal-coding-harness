# Coding Agent Prompt — Stage 01

Implement **Stage 01: Complete Type and Protocol Boundaries** using the accompanying functional and technical specifications.

## Rules

1. Read `AGENTS.md`, `.agents/rules/**`, and the relevant skills for TypeScript, adapter protocols, architecture, refactoring, and testing.
2. Preserve current CLI/orchestration behavior.
3. Work from tests first for protocol regressions.
4. Do not replace `any` mechanically with `unknown`; add proper narrowing at boundaries.
5. Make live ACP parsing and replay share one protocol interpretation path.
6. Keep provider-specific wire types inside provider adapters.
7. Do not let ACP/Codex wire objects leak into Orchestrator domain logic.
8. Make `typescript/no-explicit-any` a hard production rule only after the migration is complete.
9. Update `CHANGELOG.md`, `DECISIONS.md` when architecture changes materially, and `IMPLEMENTATION-STATUS.md`.

## Verification

During development use:

```bash
npm run check:changed
```

Before completing the stage run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run test:cli
npm run verify
```

Completion requires all Stage 01 acceptance criteria to be demonstrated by tests, not only code inspection.
