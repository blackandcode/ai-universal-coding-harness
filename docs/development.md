# Development

## Requirements

- Node.js 24.18+ (see `.nvmrc`)
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
npm run format         # Format codebase with Oxfmt
npm run format:check   # Verify formatting with Oxfmt
npm run lint           # Run Oxlint
npm run typecheck      # TypeScript compilation check (--noEmit)
npm run build          # Clean, compile, and postbuild
npm run test:unit      # Build and run unit tests
npm run test:coverage  # Build and run tests with coverage
npm run test:cli       # Run CLI smoke test
npm test               # Run all unit tests
npm run verify         # Complete quality gate and package check
npm run check          # Alias for verify
npm pack --dry-run     # Test npm package tarball creation
```

## Toolchain

- **Runtime**: Node.js 24.18+
- **Compiler**: TypeScript 7.0.2 with `target: "ES2024"`, `module: "NodeNext"`, and `verbatimModuleSyntax: true`
- **Formatter**: Oxfmt 0.68.0
- **Linter**: Oxlint 1.83.0 with AST-based Promise, Node correctness, and React rules
- **Test Runner**: Built-in `node:test` with `--experimental-test-coverage`

## Principles

- Keep the orchestration engine harness-neutral.
- Put model/binary/context quirks inside harness adapters.
- Do not introduce shell-script runtime dependencies.
- Prefer Node APIs over platform commands for archive/filesystem/process plumbing.
- Keep machine state in JSON and retrospective artifacts in Markdown.
- A permission denial applies to the operation, not automatically to the entire stage.
- Review quotas may control cost but must not become accidental implementation blockers.
