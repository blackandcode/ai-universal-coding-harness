# Quality gates

Current project scripts include clean/build/typecheck/unit/full tests/CLI verification and an aggregate `verify` flow. Preserve one canonical release-readiness command rather than creating competing check sequences across docs/skills/CI.

A typical change should run the smallest relevant fast checks during iteration and the repository canonical verification before release/merge readiness.

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
