# Functional Specification — Stage 01: Modern Toolchain and Quality Foundation

## Objective

Create the automated quality foundation required for the rewrite without
changing orchestration behavior.

The repository already declares Node 24.18+, TypeScript 7, React 19 and Ink 7.
This stage makes those declarations enforceable and introduces consistent
formatting/linting/testing commands.

## Required outcomes

### Toolchain

- Keep Node minimum at `>=24.18.0`.
- Keep TypeScript 7.0.2, React 19.2.8, Ink 7.1.1 and matching Node/React types.
- Add a repository Node version hint (`.nvmrc` or equivalent) using the minimum
  supported runtime.
- Validate the lockfile matches `package.json`.

### Formatting

Introduce one deterministic formatter for:

- TypeScript;
- TSX;
- JSON/JSONC where supported;
- Markdown where supported.

Preferred direction: Oxfmt if compatible with the current repository and Node
24 baseline.

Formatting must be runnable through npm scripts.

### Linting

Introduce modern TypeScript-aware linting.

Preferred direction:

- Oxlint for fast general linting;
- type-aware rules only when the selected version is verified compatible with
  TypeScript 7.

Do not add overlapping lint tools unless there is a concrete gap.

### Build configuration

Prepare the TypeScript configuration for the rewrite:

- modern Node/ES target suitable for Node 24;
- `NodeNext` module semantics;
- explicit Node types;
- source maps and declarations retained;
- TSX included in compilation;
- `verbatimModuleSyntax`;
- `isolatedModules`;
- `noUncheckedSideEffectImports`.

Do **not** turn on every strictness option before the source is migrated if that
would make Stage 01 permanently red. Stage 02 owns the strictness conversion.

### Scripts

Provide clear commands such as:

```text
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test
npm run verify
```

`verify` must be the authoritative local quality gate.

### Testing infrastructure

- Keep Node's test runner.
- Add reusable test helpers under a dedicated test-support module if useful.
- Ensure tests can use `.tsx` files after Stage 04.
- Prepare native coverage command, but Stage 05 owns final thresholds.

## User-visible behavior

No intentional CLI/orchestration behavior change.

## Acceptance criteria

- Clean checkout installs under Node 24.18+.
- `npm run format:check` passes.
- `npm run lint` passes or has only explicitly documented temporary migration
  exceptions.
- current unit tests pass.
- current CLI smoke tests pass.
- build and declaration emission pass.
- npm package dry-run does not include development-only rewrite artifacts.
