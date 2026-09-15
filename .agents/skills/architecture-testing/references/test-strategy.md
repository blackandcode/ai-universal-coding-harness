# Test strategy

## Domain/application

Use table-driven and property-based tests for invariants, edge cases, and state transitions where valuable.

## Node test runner

Node 24 has a stable built-in `node:test` runner and can execute TypeScript test files under Node's supported TypeScript execution mode. Vitest/Jest remain valid when their ecosystem features are needed. Choose one primary runner per project unless there is a concrete reason to mix.

## Determinism

Inject clock/random/ID generation behind small capabilities when deterministic tests need control. Avoid global monkey-patching when explicit dependencies are clearer.

## Flakiness

Treat flaky tests as defects. Do not normalize repeated reruns as the test strategy.
