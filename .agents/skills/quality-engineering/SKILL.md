---
name: quality-engineering
description: Apply when configuring or reviewing linting, formatting, CI quality gates, package-manager discipline, dependencies and Node/TypeScript project supply-chain hygiene.
---

# Quality Engineering

## Quality gate order

A typical project gate is:

1. install from lockfile;
2. format/check formatting;
3. lint;
4. TypeScript typecheck;
5. unit/integration tests;
6. build/package validation when applicable.

CI must fail when a required gate fails.

## Package manager

Use the repository's existing lockfile/package manager. Do not regenerate a project with a different package manager casually.

Use deterministic CI installation (`npm ci`, frozen-lockfile equivalents).

## Linting and formatting

Prefer one coherent setup. Biome or ESLint flat config + a formatter are both valid; follow repository standards. Do not create duplicate/contradictory formatting systems.

Treat React Hooks linting and unsafe TypeScript escape hatches as meaningful signals rather than noise to disable globally.

## Dependencies

- Add a dependency only when its value exceeds maintenance and supply-chain cost.
- Prefer actively maintained packages with clear ownership and compatible licenses.
- Review transitive impact for security-sensitive/runtime-critical additions.
- Keep lockfiles committed.
- Avoid unreviewed install scripts in high-security environments.

## CI

Pin runtime versions deliberately. Cache package-manager data rather than mutable build artifacts unless the build system has safe cache semantics.

For reusable/open-source packages, test supported Node versions derived from the compatibility policy.

## Secrets

Never print secrets in CI logs. Use short-lived/OIDC credentials when platform support exists instead of long-lived static tokens.

## Script

Use `scripts/run-quality-gates.mjs` for a conservative local check that invokes only scripts already defined by the project.
