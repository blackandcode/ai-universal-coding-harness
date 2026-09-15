# AI Universal Coding Harness — Modernization Rewrite Plan

This package is a five-stage implementation plan for modernizing the current
`ai-universal-coding-harness` source tree.

## Baseline analyzed

The plan is based on the uploaded repository snapshot:

- package version: `1.0.2`
- Node engine: `>=24.18.0`
- TypeScript: `7.0.2`
- React: `19.2.8`
- Ink: `7.1.1`
- `@types/node`: `24.13.4`
- `@types/react`: `19.2.18`
- current source: ~1,620 physical lines under `src/`
- current tests: 28 test cases across 9 test files
- approximately 158 `any` occurrences in `src/`
- `tsconfig.json` still uses `target: ES2022`, `strict: false`,
  `noImplicitAny: false`, and `skipLibCheck: true`
- several important modules are compressed into very long single lines,
  especially `src/ui/InkUi.ts`, `src/cli-main.ts`, configuration helpers,
  and harness adapters

The dependency upgrade has therefore happened **before** the corresponding code
quality/type-safety modernization. These stages close that gap.

## Release target

Treat this modernization as **v2.0.0**.

The Node 24.18+ runtime floor is a breaking runtime requirement relative to the
original package line, and the rewrite intentionally strengthens public and
internal contracts.

## Goals

1. Make the codebase idiomatic for Node 24 + TypeScript 7.
2. Make `strict` TypeScript the real build contract.
3. Remove broad `any` usage from internal code and isolate untrusted values at
   protocol/config/JSON boundaries.
4. Improve module cohesion and readability.
5. Preserve harness-neutral orchestration.
6. Strengthen Cursor ACP/evidence/recovery correctness.
7. Modernize React 19 + Ink 7 UI code.
8. Introduce consistent linting/formatting.
9. Give every major module meaningful unit/regression tests.
10. Improve JSDoc and inline architectural comments without filling the source
    with comments that merely repeat obvious code.
11. Update documentation, agent rules/skills, CI, package checks, and release
    metadata to match the new implementation.

## Non-goals

- Do not redesign the product workflow unnecessarily.
- Do not change one-run/one-branch or one-approved-stage/one-commit semantics.
- Do not let harness adapters own Git lifecycle.
- Do not let the reviewer execute repository implementation work.
- Do not add Unix-only runtime dependencies.
- Do not replace working behavior only for stylistic preference.
- Do not remove backwards-compatible configuration aliases until Stage 5
  explicitly decides and documents their deprecation/migration policy.

## Required stage format

Each folder contains:

```text
stage-NN-name/
├── functional-spec.md
├── technical-spec.md
└── prompt.md
```

Run stages in order. Do not start the next stage until the current stage passes
its acceptance criteria and test gates.

## Stage order

| Stage | Purpose                                                             |
| ----- | ------------------------------------------------------------------- |
| 01    | Modern toolchain, formatting, linting, test infrastructure          |
| 02    | Strict TypeScript core/domain/config/CLI refactor                   |
| 03    | Harness, ACP, permissions, evidence and recovery hardening          |
| 06    | Reviewer routing, fallback, large diffs and orchestrator resilience |
| 04    | React 19 + Ink 7 UI and CLI presentation modernization              |
| 05    | Documentation, complete test matrix, CI/package/release v2.0.0      |

### Stage 06 Architectural Note

`Stage 06` was introduced based on the incident analysis of run `20260915T193118Z-76e14b`. It addresses reviewer provider failures (usage limits, quota exhaustion, process crashes without `result.json`) through automatic fallback to Cursor Gemini High, routes large diffs (>300k chars) to high-context models, and isolates permission checks to lightweight, cost-optimized reviewers. It executes immediately after Stage 03 establishes modular harness adapters and before Stage 04 modernizes the presentation layer.

## Quality rule for every stage

Every stage must:

1. read `AGENTS.md`;
2. apply relevant `.agents/skills/**/SKILL.md`;
3. keep the package buildable;
4. add/update tests for changed behavior;
5. run the narrowest relevant unit tests during implementation;
6. finish with the stage's required full verification commands;
7. update `IMPLEMENTATION-STATUS.md`;
8. record material architecture choices in `DECISIONS.md`;
9. avoid mixing unrelated changes from later stages.

## Commenting and documentation policy

"Fully commented" means **fully understandable**, not one comment per line.

Required across all stages:

- **Top-of-file descriptions**: Every file added or modified must include a descriptive top-level docblock explaining what the file is about and its architectural purpose. When editing an existing file and adding or modifying functionality, update the top-of-file docblock so it reflects the changes and new capabilities.
- **Docblocks for all code constructs**: Comprehensive docblocks (JSDoc/TSDoc) for all functions, methods, classes, interfaces, and types (both internal and exported).
- **Internal logic documentation**: Clear docblocks and explanatory comments for internal logic, state machines, protocol accumulation, and complex algorithms where possible.
- Inline comments explaining **why**, not restating **what** obvious syntax does.
- No stale comments, commented-out code, or decorative prose.

## Testing strategy

See [`TESTING-STRATEGY.md`](TESTING-STRATEGY.md). Unit testing is part of every
stage and is never deferred until Stage 5.
