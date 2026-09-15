---
name: testing-engineering
description: Apply when adding, reviewing or repairing tests for TypeScript 7, Node.js 24+ or React 19+ applications, including regression, unit, integration, component and end-to-end testing.
---

# Testing Engineering — TS7 / Node 24 / React 19

Tests protect behavior and contracts, not implementation trivia. Test execution and TypeScript typechecking are separate gates unless the chosen runner explicitly invokes the TS7 checker.

## TypeScript 7 test environment

TS7 defaults `compilerOptions.types` to `[]`. If a test suite uses framework globals, declare them explicitly in a test-specific tsconfig when possible:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

Use the actual framework entry (`jest`, `mocha`, etc.) instead of copying this example. Prefer explicit imports when global APIs are not needed.

Do not restore `types: ["*"]` just to make tests compile.

## Strategy

Use the lowest-cost level that reliably proves behavior:

- pure unit tests for deterministic domain logic;
- integration tests for database/network/module boundaries;
- React component tests for user-visible behavior;
- end-to-end tests for a small set of critical workflows.

Do not replace integration behavior with deep mocking merely to make tests easy.

## Bug fixes

When a bug has a cheap, stable reproduction, add a regression test that fails before the fix and passes after it.

## Node

Prefer `node:test` or Vitest according to repository standards. Await asynchronous work. Close servers, pools, timers, workers, and listeners so the process terminates naturally. Exercise cancellation/timeouts when they are part of the contract.

If Node executes `.ts` directly, remember that runtime type stripping does not typecheck tests; run TS7 separately.

## React 19

Prefer Testing Library semantics and accessible queries. Test what the user can observe, not component internals.

`react-test-renderer` is deprecated in React 19; do not add new tests based on it.

React Strict Mode can intentionally exercise lifecycle/ref behavior more than once in development. Tests should not encode assumptions that only hold because effects/ref callbacks happen once.

## React Compiler

If React Compiler is enabled, tests should validate behavior, not whether a component rendered an exact number of times unless render count itself is the performance contract being tested intentionally.

## Time and randomness

Control clocks/random sources at explicit boundaries when determinism matters. Avoid global fake timers when they obscure integration behavior.

## Mocking

Mock unstable/external boundaries, not the implementation under test. Keep typed mocks aligned with real contracts; do not use `as any` to create mocks that cannot exist at runtime.

## Coverage

Coverage is a signal. Prioritize risky branches and public contracts over line-count gaming.

## Completion

Run the narrowest affected tests first, then the repository's standard typecheck/lint/test/build gates.
