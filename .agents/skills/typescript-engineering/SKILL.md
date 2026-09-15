---
name: typescript-engineering
description: Primary TypeScript 7 engineering skill. Apply to TypeScript/TSX implementation, refactoring, tsconfig/module work, migrations, package/library design, code review, and any Node or React work whose correctness depends on TypeScript configuration or types.
---

# TypeScript 7 Engineering

TypeScript 7 is the primary baseline. TypeScript 6.0 is a transition/compatibility compiler, not the design target for new work.

## Non-negotiable workflow

1. Inspect `package.json`, package manager/lockfile, installed TypeScript version, all `tsconfig*.json`, package `type`, `exports`/`imports`, and build/test/lint scripts.
2. Determine the execution model before changing TypeScript configuration:
   - Node executes emitted JavaScript;
   - Node executes erasable TypeScript directly;
   - a bundler owns module resolution/emission;
   - a package/library emits declarations and/or JavaScript.
3. Determine whether any tool imports the TypeScript compiler API. TypeScript 7.0 does not expose the legacy compiler API.
4. Model domain and boundary types before implementing control flow.
5. Make the smallest coherent change.
6. Run the repository's TS7 typecheck plus relevant lint/tests/build.
7. Never “fix” a TS7 error by restoring removed TS6/legacy flags.

## TS7 defaults are architecture, not trivia

TypeScript 7 adopts modern defaults. Agents must understand their effects even when the options are omitted:

- `strict: true`
- `module: esnext`
- modern current-year `target` (ES2025 for TS7.0)
- `noUncheckedSideEffectImports: true`
- `libReplacement: false`
- stable type ordering is always on
- `rootDir` defaults to the directory containing `tsconfig.json`
- `types` defaults to `[]`

For long-lived projects, prefer explicitly documenting options whose value is part of the project's runtime/build contract (`module`, `moduleResolution`, `target`, `jsx`, `rootDir`, `types`, `noEmit`, declaration options), rather than relying on a floating default.

## Removed/legacy configuration must not be reintroduced

In TS7 do not use or recommend:

- `target: es5`
- `downlevelIteration`
- `moduleResolution: node` / `node10` / `classic`
- `module: amd`, `umd`, `system`, `systemjs`, or `none`
- `baseUrl`
- `outFile`
- `esModuleInterop: false`
- `allowSyntheticDefaultImports: false`
- `alwaysStrict: false`
- legacy `module Foo {}` namespace syntax
- import assertions using `asserts`; use import attributes with `with`
- `/// <reference no-default-lib="true"/>`
- `ignoreDeprecations` as a TS7 migration strategy

Do not use a removed flag to preserve old behavior. Change the architecture to the modern equivalent.

## Module-resolution decision

Choose by runtime, not habit.

### Direct Node.js runtime

Use Node-aware semantics:

```json
{
  "compilerOptions": {
    "target": "ES2025",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "verbatimModuleSyntax": true
  }
}
```

Prefer `package.json#imports` subpath imports such as `#/*` when aliases are needed. Do not assume TypeScript `paths` rewrites runtime imports; it does not.

### Bundler-owned application (React/Vite/etc.)

Prefer the bundler model:

```json
{
  "compilerOptions": {
    "target": "ES2025",
    "module": "Preserve",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "verbatimModuleSyntax": true
  }
}
```

For React, combine this with `jsx: react-jsx` unless the framework explicitly requires `preserve`.

### Libraries/packages

The public contract is the emitted package, not source compilation alone. Verify:

- `exports` conditions and `types` resolution;
- `.d.ts` output from a clean build;
- ESM/CJS contract if both are intentionally supported;
- consumer typechecking in a fixture project;
- `isolatedDeclarations` when it fits the library and improves parallel declaration work;
- no source-only aliases that consumers cannot resolve.

## Explicit global types

Because TS7 defaults `types` to `[]`, add only the global-affecting packages each project actually needs. Typical examples:

```json
{
  "compilerOptions": {
    "types": ["node"]
  }
}
```

For a Vite React app that uses Vite globals:

```json
{
  "compilerOptions": {
    "types": ["vite/client"]
  }
}
```

For test globals, add the test framework's global types only if the project actually uses global APIs. Prefer explicit imports when practical.

Do not restore old ambient enumeration with `types: ["*"]` unless compatibility absolutely requires it.

## Type-system design

### Make invalid states difficult to represent

Use discriminated unions and explicit variants instead of bags of unrelated optional properties.

```ts
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading'; requestId: string }
  | { status: 'success'; value: T }
  | { status: 'error'; error: AppError };
```

Use exhaustive checks where all variants must be handled.

### Preserve inference instead of defeating it

- Prefer `satisfies` when validating an object's shape while preserving inference.
- Prefer `as const` for literal data when immutability/literal inference is intended.
- Use `const` type parameters when API callers need literal information preserved and the abstraction genuinely benefits.
- Do not add explicit annotations that merely duplicate obvious inference; add them at public boundaries or when they improve stability/readability.

### No compiler lies

- `unknown` at untrusted boundaries, then validate/narrow.
- Avoid broad `any` and assertions.
- Never use `as unknown as X` as routine plumbing.
- Non-null assertions require a real invariant; prefer making the invariant explicit in types/control flow.
- `@ts-ignore` is prohibited for normal fixes. Prefer a narrow `@ts-expect-error` with a reason only when intentionally testing/bridging a known type issue.

### Semantic types

Use branded/opaque identifiers where confusing values would be a real domain defect. Do not brand every string mechanically.

## Boundary-first typing

HTTP, JSON, environment variables, message queues, storage blobs, browser storage, user input, third-party SDK responses, and loosely constrained database results are untrusted.

- Validate once at the boundary.
- Convert to trusted domain types.
- Derive static types from the runtime schema/authoritative contract when practical.
- Do not define a TypeScript interface and call that validation.

## Side effects and imports

Keep `noUncheckedSideEffectImports` enabled. A side-effect import is part of program behavior and must resolve correctly.

Use explicit type imports under `verbatimModuleSyntax`:

```ts
import { createUser, type User } from './users.js';
```

Do not depend on the compiler silently rewriting value imports into type-only imports.

## TS7 performance and parallelism

TS7 parallelizes parsing, checking, emit, and project builds. Do not cargo-cult worker counts.

- Start with defaults.
- Use `--checkers` only after measuring CPU/memory tradeoffs.
- Use `--builders` for project-reference build parallelism only after considering multiplicative concurrency with `--checkers`.
- Use `--singleThreaded` for debugging/reproducibility/resource-constrained environments, not as the default.
- In constrained CI, lowering checker/build concurrency can reduce memory pressure.

## TypeScript 6 bridge policy

TypeScript 6.0.x may remain temporarily when:

- a tool needs the legacy programmatic compiler API;
- migration is being staged;
- a package ecosystem blocker has been verified.

When comparing TS6 and TS7 during migration, TS6's `stableTypeOrdering` can help expose differences, but it is a migration diagnostic only, not a permanent project feature.

Do not design new source code around TS6-only compatibility.

## Compiler API and tooling compatibility

TypeScript 7.0 ships the `tsc` compiler and LSP but does not expose the previous compiler API. Before upgrading lint rules, code generators, AST transforms, API extractors, or custom tools that import `typescript`:

1. verify explicit TS7 support;
2. use the newest compatible tool release;
3. if a legacy API is still required, follow the official TS7 side-by-side compatibility approach using `@typescript/typescript6` rather than downgrading the main typecheck blindly;
4. keep TS7 `tsc` as the project correctness gate.

See `references/tooling-compatibility.md`.

## Quality options beyond `strict`

Evaluate these as intentional project rules:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "noUncheckedSideEffectImports": true
  }
}
```

`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are strong recommendations for new code, but do not enable them across a mature codebase without planning the migration.

## Completion gate

A change is not complete because the transpiler built it. Run the repository equivalents of:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Only run scripts that exist or are intentionally introduced as part of the task. For library work, also verify packed/consumer declarations.

## References

- `references/typescript-7.md`
- `references/tsconfig-and-modules.md`
- `references/tooling-compatibility.md`
- `references/type-system-discipline.md`
- `references/boundaries.md`
- `scripts/check-typescript-project.mjs`
