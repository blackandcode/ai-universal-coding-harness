# Development

## Requirements

- Node.js 22.14+
- Git

Harness integration development additionally requires the corresponding CLIs.

## Setup

```bash
npm install
npm run build
npm test
npm run verify
```

## Commands

```bash
npm run typecheck
npm run build
npm run test:unit
npm test
npm run verify
npm pack --dry-run
```

## Principles

- Keep the orchestration engine harness-neutral.
- Put model/binary/context quirks inside harness adapters.
- Do not introduce shell-script runtime dependencies.
- Prefer Node APIs over platform commands for archive/filesystem/process plumbing.
- Keep machine state in JSON and retrospective artifacts in Markdown.
- A permission denial applies to the operation, not automatically to the entire stage.
- Review quotas may control cost but must not become accidental implementation blockers.
