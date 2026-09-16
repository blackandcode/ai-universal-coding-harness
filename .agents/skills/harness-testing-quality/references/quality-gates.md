# Quality gates

Current project scripts include clean/build/typecheck/unit/full tests/CLI verification and an aggregate `verify` flow. Preserve one canonical release-readiness command rather than creating competing check sequences across docs/skills/CI.

A typical change should run the smallest relevant fast checks during iteration and the repository canonical verification before release/merge readiness.

## Two-tier quality gate structure

### Tier 1: Fast Day-to-Day Iterative Gate (`npm run check:changed`)

- **Scope**: Touched files (modified, staged, untracked).
- **Execution**:
  1. Oxfmt format check (`--check`) on touched files.
  2. Oxlint linting on touched JS/TS files.
  3. TypeScript typechecking (`tsconfig.json` and `tsconfig.test.json`).
  4. Targeted unit test execution for touched source or test files.
- **Agent Policy**: Default command for AI agents during routine iterations. Agents must NOT run the full test suite unless explicitly requested.

### Tier 2: Canonical Release & Pre-Push Gate (`npm run verify`)

- **Scope**: Entire repository.
- **Execution**: Full Oxfmt formatting, full Oxlint linting, full TypeScript typechecking, full coverage test suite (85% line, 85% function, 80% branch coverage), CLI smoke tests, and package tarball integrity check (`scripts/package-check.mjs`).
- **Enforcement**: Automated via Git pre-push hook (`.githooks/pre-push` -> `scripts/pre-push.mjs`). Any failure halts `git push` immediately.

## Gate categories

- TypeScript compiler/typecheck;
- unit/regression tests;
- integration/CLI tests when affected;
- build/package verification;
- Git diff hygiene;
- cross-platform CI for platform-sensitive changes.

## Evidence vs test execution

The executor runs project quality commands; the harness corroborates that evidence. Tests of the harness itself should separately prove the corroborator cannot be fooled by claims without observations.

Coverage percentage is not a substitute for scenario coverage. Prioritize state/security/recovery branches that would be expensive in production.
