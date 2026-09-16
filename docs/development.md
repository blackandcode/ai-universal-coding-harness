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

### npm install scripts (`allowScripts`)

Local development uses the root `prepare` script (`npm run build` and Git hooks setup). npm 11.16+ tracks which packages may run install-related lifecycle scripts via the committed `allowScripts` field in `package.json`. After `npm install` in a clone, that policy covers this project’s `prepare` hook.

When you add or upgrade dependencies that run `preinstall`, `install`, `postinstall`, or native builds, re-check with:

```bash
npm approve-scripts --allow-scripts-pending
```

Approve only packages you trust, then commit the updated `allowScripts` entries. npm 12 blocks unlisted dependency scripts by default. See [npm approve-scripts](https://docs.npmjs.com/cli/v12/commands/npm-approve-scripts/).

**Global CLI from this repository** (`npm i -g` with no project root) does not read this repo’s `package.json`. Use one of:

- `npm link` after `npm run build` in a clone
- `npm i -g --allow-scripts=ai-universal-coding-harness`
- `npm config set allow-scripts=ai-universal-coding-harness --location=user` for repeated global installs

## Commands

```bash
npm run format         # Format codebase with Oxfmt
npm run format:check   # Verify formatting with Oxfmt
npm run lint           # Run Oxlint
npm run typecheck      # TypeScript compilation check (--noEmit)
npm run check:changed  # Fast incremental quality check on touched files (default for day-to-day work)
npm run build          # Clean, compile production code to dist/, and postbuild
npm run build:tests    # Compile tests and src to .test-dist/
npm run test:unit      # Build and run unit tests from .test-dist/tests/
npm run test:coverage  # Build and run tests with coverage
npm run test:cli       # Run CLI smoke test
npm test               # Run all unit tests
npm run pre-push       # Run pre-push gate (npm run verify; halts git push on failure)
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
