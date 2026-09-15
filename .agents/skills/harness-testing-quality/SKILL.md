---
name: harness-testing-quality
description: Design and implement AI Harness tests and quality gates using Node's built-in test runner, temporary Git repositories, adapter contract tests, CLI smoke tests, regression tests, and cross-platform CI. Use when adding tests, fixing a production/reliability bug, changing state transitions, permissions, adapters, evidence verification, Git behavior, packaging, or deciding what must be verified before a stage/release is trusted.
compatibility: AI Universal Coding Harness; Node.js 24.18+; TypeScript 7.x.
metadata:
  role: verification
---

# Harness Testing and Quality

Tests should prove behavior, invariants, and seams. Avoid mirroring implementation details.

Read:

- `references/test-strategy.md`
- `references/adapter-contract-tests.md`
- `references/integration-cli-cross-platform.md`
- `references/property-fuzz-regression.md`
- `references/quality-gates.md`

## Test pyramid for this project

1. many deterministic unit/table tests for pure policy/state/normalization logic;
2. adapter contract tests with scripted provider/event fixtures;
3. integration tests with temporary Git repositories/filesystems/processes;
4. CLI/package smoke tests;
5. targeted cross-platform CI scenarios.

## Rules

- Every reliability/security incident gets the smallest regression test that reproduces the failure mechanism.
- Prefer dependency injection/fakes at real architecture boundaries; do not mock every internal function.
- Avoid sleep-based tests when fake timers, explicit events, or controllable processes can make them deterministic.
- Assertions should test externally meaningful state/evidence, not exact incidental log wording unless wording is the contract.
- A green reviewer opinion never replaces deterministic project tests.
