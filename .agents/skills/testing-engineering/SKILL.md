---
name: testing-engineering
description: Apply when adding, reviewing or repairing tests for TypeScript, Node.js 24+ or React 19+ applications, including regression, unit, integration and component testing.
---

# Testing Engineering

Tests exist to protect behavior and contracts, not implementation trivia.

## Strategy

Use the lowest-cost test level that can reliably prove the behavior:

- pure unit tests for deterministic domain logic;
- integration tests for database/network/module boundaries;
- React component tests for user-visible behavior;
- end-to-end tests for a small set of critical workflows.

Do not replace integration behavior with deep mocking just to make a test easy.

## Bug fixes

When a bug has a cheap, stable reproduction, add a regression test that fails before the fix and passes after it. Do not force a brittle test when reproduction requires large unrelated infrastructure.

## Node

Prefer `node:test` or Vitest according to repository standards. Ensure async tests return/await their work. Close servers, pools, timers and listeners so the process can terminate naturally.

## React

Prefer Testing Library semantics. Query by role/name/label where practical. Test what the user observes rather than internal component state.

## Time and randomness

Control clocks and random sources at explicit boundaries when deterministic behavior matters. Avoid global fake-timer usage when it obscures integration behavior.

## Mocking

Mock unstable/external boundaries, not the implementation under test. A test suite where every dependency is mocked can pass while the application is broken.

## Coverage

Coverage is a signal, not a goal by itself. Enforce meaningful project thresholds if the repository uses them, but prioritize risky branches and contracts over line-count gaming.

## Completion

Run the narrowest affected tests first, then the repository's normal broader test gate.
