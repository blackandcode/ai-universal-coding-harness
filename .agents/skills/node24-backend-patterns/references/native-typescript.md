# Native TypeScript in Node 24

Node can execute erasable TypeScript directly by stripping types. This is an execution feature, not a type checker.

## Appropriate uses

- small internal scripts;
- build/config scripts;
- applications intentionally constrained to erasable syntax;
- environments where direct source execution simplifies the toolchain.

## Requirements / constraints

- still run TypeScript 7 type checking separately;
- Node ignores `tsconfig.json` for runtime transformations;
- path aliases or compiler transforms do not magically become runtime behavior;
- use module/import specifiers that Node can resolve;
- when targeting type stripping, enable `erasableSyntaxOnly` and `verbatimModuleSyntax` and use Node-appropriate module settings.

Node 24.12+ marks type stripping stable. Earlier Node 24 releases exist, but for an enterprise baseline using native TS execution, require at least 24.12.

For production packages/libraries or builds requiring transforms/declaration output, use a proper build/compiler/bundler pipeline rather than treating native stripping as a universal replacement.
