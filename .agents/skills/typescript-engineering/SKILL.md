---
name: typescript-engineering
description: Apply to normal TypeScript and TSX implementation, refactoring, API modeling, tsconfig work, code review, and type-safety improvements in TypeScript 6.x or 7.x projects.
---

# TypeScript Engineering

Use TypeScript as a design tool, not merely a syntax layer over JavaScript.

## Supported baseline

- TypeScript latest 6.x or 7.x.
- Always verify against the repository's installed compiler.
- Do not introduce TS7-only assumptions when the project intentionally remains on TS6.
- Run `tsc --noEmit` (or the repository equivalent) before considering type-related work complete.

## Workflow

1. Inspect `package.json`, `tsconfig*.json`, package manager lockfile, module type, and existing scripts.
2. Preserve the repository's module/build model unless the task explicitly changes it.
3. Model the domain before implementing control flow.
4. Treat data crossing an external boundary as `unknown` until validated.
5. Implement the smallest coherent change.
6. Run typecheck, relevant tests, and lint.
7. Remove temporary compatibility code and stale types introduced by the change.

## Core rules

### Make invalid states hard to represent

Prefer discriminated unions and explicit variants over objects containing many unrelated optional fields.

```ts
// Prefer

type PaymentState =
  | { kind: 'idle' }
  | { kind: 'processing'; requestId: string }
  | { kind: 'succeeded'; transactionId: string }
  | { kind: 'failed'; reason: string };
```

Use exhaustive switches with a `never` assertion when all variants should be handled.

### Semantic identifiers

Do not pass every identifier as interchangeable `string` when mixing them would be a real defect. Use branded/opaque types or small domain wrappers when the benefit is meaningful.

### Boundary validation

Network payloads, environment variables, JSON files, user input, message queues and untrusted database shapes are not trusted merely because a TypeScript interface exists.

- Parse/validate once at the boundary.
- Convert into trusted domain types.
- Keep internal functions free of repeated defensive parsing.
- Prefer deriving static types from runtime schemas or authoritative generated contracts when possible.

### Avoid compiler lies

- Prefer `unknown` to `any`.
- Avoid broad type assertions.
- Prefer `satisfies` when checking object conformance without losing inference.
- Use non-null assertions only when an invariant is truly established and cannot be expressed better.
- Never silence a compiler error just to get a build through.

### APIs and functions

- Prefer narrow parameters over large context bags unless the bag is a deliberate domain object.
- Keep side effects at boundaries; prefer pure transformations for business rules.
- Return meaningful domain results instead of sentinel values.
- Avoid `boolean` parameters that create unrelated behavior modes; prefer named options or separate functions when clearer.
- Do not add generic abstractions before at least two concrete use cases demonstrate the shared shape.

### Async code

- Start independent work concurrently and await as late as practical.
- Do not use `async` when no asynchronous boundary exists.
- Avoid forgotten promises; intentionally `await`, return, aggregate, or explicitly detach with an error strategy.
- Propagate cancellation with `AbortSignal` for operations that can be cancelled.

### Collections and indexing

With `noUncheckedIndexedAccess`, account for missing array/indexed values rather than asserting them away. Prefer maps/records keyed by constrained identifiers where lookup semantics matter.

## Recommended compiler posture

Prefer a strict configuration. Evaluate these according to repository compatibility:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

Do not copy settings blindly. `module`, `moduleResolution`, JSX options, declaration emit and build output must match how the code is consumed.

## TypeScript 6/7 compatibility

TypeScript 7 changed compiler implementation and performance substantially while aiming for high semantic compatibility. Therefore:

- Treat the checked-in TypeScript version as authoritative.
- Do not rewrite code merely because TS7 is faster.
- Verify config options and tooling integrations before migrating.
- For libraries, test generated declarations and consumer resolution as part of migration.

## Completion gate

At minimum run the repository equivalents of:

```bash
npm run typecheck
npm test
npm run lint
```

If those scripts do not exist, inspect project tooling before inventing replacements.

## References

- `references/type-system-discipline.md`
- `references/tsconfig-and-modules.md`
- `references/boundaries.md`
- `scripts/check-typescript-project.mjs`
