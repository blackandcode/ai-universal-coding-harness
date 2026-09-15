# TypeScript 7 on Node 24+

## Built-in TypeScript support

Node can execute `.ts` files by stripping erasable type syntax. In Node 24.x this capability became stable in 24.12.0.

This runtime behavior is intentionally lightweight:

- no type checking;
- no arbitrary `tsconfig` transforms;
- no automatic `paths` rewriting;
- no downlevel compilation;
- only runtime-supported JavaScript semantics plus erasable TS syntax.

## Direct execution config

For direct `.ts` execution, align the checker with Node's model:

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
    "verbatimModuleSyntax": true
  }
}
```

## Syntax to avoid in direct-strip projects

Avoid features that require transformation into JavaScript, notably runtime enums, value namespaces, parameter properties, and TypeScript import aliases.

Prefer JavaScript-native constructs:

- object literals + literal unions instead of runtime enums when appropriate;
- modules instead of runtime namespaces;
- explicit property declarations/assignments instead of parameter properties.

This restriction applies to direct Node execution. It is not a universal TypeScript 7 ban for compiled projects.

## Imports

Use explicit type imports:

```ts
import type { User } from './user.ts';
import { loadUser, type LoadOptions } from './loader.ts';
```

If emitted JS is the runtime artifact instead, follow the emit strategy (`.js` specifiers in source or an intentionally configured extension-rewrite workflow).

## Aliases

Prefer Node package `imports` for runtime aliases. TypeScript `paths` does not make Node understand an alias.
