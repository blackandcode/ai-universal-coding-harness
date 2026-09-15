# Technical Specification — Stage 01

## Primary files

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `.editorconfig`
- formatter/linter configuration files
- `scripts/run-tests.mjs`
- `scripts/package-check.mjs`
- CI workflows
- `AGENTS.md`
- `.agents/rules/typescript.mdc`
- `.agents/rules/tests.mdc`

## TypeScript configuration direction

Target Node 24 directly.

Recommended end-of-stage baseline:

```jsonc
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noUncheckedSideEffectImports": true,
    "forceConsistentCasingInFileNames": true,
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
}
```

Stage 02 will finalize `strict` and additional strictness settings.

Do not enable flags simply because they are fashionable. Every compiler option
must have a documented reason.

## Formatting

Formatting should eliminate the current compressed style.

No production `.ts`/`.tsx` file should intentionally contain multiple unrelated
statements on one line.

Formatter output is authoritative.

## Linting categories

Enable rules for:

- unused imports/variables;
- unreachable code;
- accidental promise misuse where supported;
- suspicious equality/boolean logic;
- Node-specific correctness;
- React correctness for `.tsx`;
- no explicit `any` as a warning initially, then Stage 02 reduces/eliminates it.

Do not make migration impossible by enabling hundreds of style-only errors at
once.

## Test script modernization

Keep tests deterministic.

Recommended separation:

```text
test:unit
test:cli
test:coverage
test
verify
```

`test` should not require real Cursor/Codex authentication.

## CI

CI must use Node 24 only after this stage.

Matrix:

```text
ubuntu-latest
windows-latest
macos-latest
```

Use the declared minimum Node version in at least one job.

## Documentation

Document:

- runtime prerequisites;
- quality commands;
- formatter;
- linter;
- Node 24 support;
- TS7 expectations.

## Tests to add/update

- package metadata consistency;
- Node runtime minimum validation;
- formatter/linter config smoke;
- build emits expected CLI/library artifacts.
