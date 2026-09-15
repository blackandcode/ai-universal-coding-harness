# Testing Strategy

## Principles

The rewrite is only successful if behavior stays trustworthy while structure
changes.

Use a layered test model.

```text
Unit tests
    ↓
Adapter/fixture tests
    ↓
Service integration tests
    ↓
CLI smoke tests
    ↓
Package-consumer test
    ↓
Cross-platform CI
```

## Unit-test requirements

Every new or materially changed module must have tests for:

- success path;
- invalid input;
- boundary/empty values;
- failure propagation;
- state transitions;
- idempotency where applicable.

Do not test private implementation details when public behavior can be tested.

## Preferred framework

Keep Node's built-in test runner unless a concrete need justifies another test
framework.

Advantages:

- no unnecessary runtime/test dependency;
- works naturally with Node 24;
- adequate for service and CLI unit tests.

Use `ink-testing-library` only for Ink component/render tests.

## Test doubles

Never invoke paid Cursor/Codex calls from normal unit tests.

Create deterministic fake implementations of:

```text
ExecutorHarness
ExecutorSession
ReviewerHarness
GitRepository boundary where necessary
Clock/time where necessary
ProcessRunner where necessary
```

Prefer constructor dependency injection over global monkey-patching.

## Fixtures

Add sanitized fixtures for:

- Cursor ACP multi-chunk terminal events;
- permission requests;
- questions;
- plan events;
- session load/replay;
- Codex reviewer JSONL;
- invalid/malformed protocol events.

Fixtures must contain no credentials or private paths.

## Native coverage

Use Node 24 native test coverage if practical.

Recommended release gate:

- lines: >= 85%
- functions: >= 85%
- branches: >= 80%

For security/recovery/evidence modules, target materially higher branch coverage
than the repository average.

Coverage should not encourage meaningless tests. Critical invariants matter more
than chasing a number.

## Cross-platform CI

CI should test at least:

- Ubuntu
- Windows
- macOS

using the minimum supported Node 24 version.

At least one CI job should also run the latest Node 24 patch release to detect
forward regressions.

## Package-consumer test

Create a temporary fixture project that:

1. installs/packs the package;
2. imports the public library exports;
3. invokes `ai-harness --version`;
4. invokes `ai-harness --help`;
5. initializes a temporary project;
6. verifies declaration resolution.

This catches problems that source-level tests cannot.

## Stage gates

### Stage 01

Tooling/config tests and existing suite.

### Stage 02

Core, config, CLI, Git, project and state unit tests.

### Stage 03

Harness/ACP/evidence/permission/recovery regression suite.

### Stage 04

Reducer/component/layout/interaction Ink tests.

### Stage 05

Full suite, coverage, CLI smoke, package consumer, npm pack, cross-platform CI.

## Regression rule

Every bug fixed during the rewrite must first receive a regression test that
fails for the old behavior and passes for the corrected behavior whenever
practical.
