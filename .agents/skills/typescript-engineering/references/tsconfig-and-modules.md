# TS7 tsconfig and module profiles

Use one profile per execution model. Do not merge every option below into one universal config.

## Profile A — Node 24+ app compiled by `tsc`

```json
{
  "compilerOptions": {
    "target": "ES2025",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "./src",
    "outDir": "./dist",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "noUncheckedSideEffectImports": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

If a deployment environment requires a different JS target, change `target` deliberately rather than copying legacy settings.

In Node ESM, runtime specifiers matter. Prefer imports that resolve under Node itself. Do not depend on TS-only aliases.

## Profile B — Node 24.12+ executes TypeScript directly

Node's built-in support strips erasable TypeScript and ignores `tsconfig` transforms. Use a config that keeps source compatible with direct runtime execution:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "noEmit": true,
    "rewriteRelativeImportExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "strict": true
  }
}
```

With direct type stripping:

- type imports must use `import type`/`type` modifiers;
- do not use runtime `enum`, runtime `namespace`, parameter properties, or TypeScript import aliases;
- do not expect `paths` to change runtime resolution;
- `tsc --noEmit` remains mandatory because Node does not typecheck.

## Profile C — React/Vite or similar bundler-owned app

```json
{
  "compilerOptions": {
    "target": "ES2025",
    "module": "Preserve",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "types": ["vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src"]
}
```

If the framework owns JSX emission and requires `jsx: preserve`, use the framework requirement. React 19 still requires the modern JSX transform in the actual build pipeline.

Add test globals to a test-specific config when possible rather than polluting the application config.

## Profile D — publishable TypeScript library

```json
{
  "compilerOptions": {
    "target": "ES2025",
    "module": "Preserve",
    "moduleResolution": "Bundler",
    "declaration": true,
    "declarationMap": true,
    "isolatedDeclarations": true,
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "noUncheckedSideEffectImports": true
  }
}
```

A library may use a bundler for JS and `tsc` only for declaration emit. If `isolatedDeclarations` is too invasive for the existing API surface, do not enable it blindly; treat it as a planned public-typing improvement.

Always validate the packed package from a consumer fixture.

## Alias policy

### Node

Prefer package subpath imports:

```json
{
  "imports": {
    "#/*": "./dist/*"
  }
}
```

Align source/runtime paths with the actual deployment model. If direct TypeScript execution is used, point package imports appropriately for source execution or use a build layout that preserves the contract.

### Bundlers

Bundler aliases are acceptable when both the bundler and TypeScript understand them. TypeScript `paths` alone is not runtime configuration.

### Monorepos

Prefer real workspace packages/project references over a giant global alias map when code has package-level ownership.

## JSON imports

Use modern import attributes when the runtime/bundler requires them:

```ts
import data from './data.json' with { type: 'json' };
```

Do not use legacy import assertions with `assert`/`asserts` syntax.
