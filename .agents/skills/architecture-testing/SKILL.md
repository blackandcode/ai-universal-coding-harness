---
name: architecture-testing
description: Verify enterprise Node.js 24 + TypeScript 7 architecture through unit, integration, contract, end-to-end, resilience, and architecture-boundary tests. Use when defining test strategy for ports/adapters, module dependencies, APIs/events, persistence, distributed workflows, idempotency, retries, migrations, and architectural fitness functions.
compatibility: Node.js 24+, TypeScript 7.x; works with node:test, Vitest, Jest, Playwright, Testcontainers, or equivalent tooling.
metadata:
  role: architecture-verification
---

# Architecture Testing

Tests should prove behavior and boundaries, not mirror implementation details.

Read `references/test-strategy.md`, `references/contract-and-integration.md`, and `references/fitness-functions.md`.

## Layers

- Domain: fast deterministic unit/property tests around invariants.
- Application/use cases: test with in-memory/fake ports when behavior is independent of infrastructure.
- Adapters: integration tests against real protocol/database behavior where mocks would hide mapping errors.
- Contracts: provider/consumer/schema compatibility tests.
- Critical flows: a small number of E2E tests.
- Distributed behavior: duplicate, retry, ordering, timeout, compensation, replay, and recovery tests.

## Rule

Mock at architectural boundaries, not every internal function. Excessive mocking produces tests that certify your implementation assumptions instead of system behavior.
