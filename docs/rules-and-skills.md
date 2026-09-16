# Rules and Skills

This repository includes agent guidance for developing **AI Universal Coding Harness itself**.

## Shared baseline

`AGENTS.md` is the durable repository-level instruction file shared across harnesses.

Reusable development skills live under:

```text
.agents/skills/
├── ai-harness-architecture/
├── ai-harness-review/
├── harness-adapter-protocols/
├── harness-security-permissions/
├── harness-testing-quality/
├── harness-workflow-state/
├── react19-ink-tui/
└── typescript-node24-engineering/
```

Keep reusable instructions here rather than duplicating the same guidance per provider.

## Cursor-specific rules

Cursor-specific scoped guidance lives under:

```text
.cursor/rules/
```

Current rule areas cover:

- harness-neutral architecture;
- TypeScript boundaries;
- testing;
- project workspace lifecycle;
- npm/GitHub publishing.

Use Cursor rules for scoped/glob metadata that does not have a direct cross-harness equivalent. Keep architectural truth in `AGENTS.md` and `/docs`.

## Target repositories

AI Universal Coding Harness does **not** copy its own development rules into target repositories.

When an executor/reviewer adapter runs with project context, its subprocess working directory is the target repository. This allows the harness to discover that repository's native context when supported:

```text
AGENTS.md
.agents/skills/
.cursor/rules/
.cursor/skills/
MCP/tool configuration
project files and tests
```

Each target repository remains responsible for its own rules, skills, tools, and agent instructions.
