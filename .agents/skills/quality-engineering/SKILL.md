---
name: quality-engineering
description: Apply when configuring/reviewing linting, formatting, CI, package-manager discipline, dependencies and supply-chain hygiene for TypeScript 7, Node 24+, and React 19+ projects.
---

# Quality Engineering for TS7 / Node 24 / React 19

## Quality gate model

A modern gate normally contains:

1. deterministic install from lockfile;
2. formatting check;
3. lint (including React Hooks rules where applicable);
4. TypeScript 7 typecheck;
5. unit/integration/component tests;
6. production build/package validation;
7. package-consumer/declaration checks for published libraries.

A successful Vite/esbuild/SWC/Babel build is not a substitute for TypeScript typechecking.

## TypeScript 7 tooling compatibility

Before upgrading tools that parse TypeScript or use type information, determine whether they invoke `tsc`, parse syntax independently, or import the compiler API.

TypeScript 7.0 does not expose the previous compiler API. Use current tool versions with explicit TS7 support. When a concrete tool still needs TS6 APIs, use the official TS6 side-by-side compatibility package temporarily instead of downgrading application source conventions.

### typescript-eslint

Use the latest compatible `typescript-eslint` release and verify TS7 support. Do not silence compatibility warnings or disable typed lint rules globally just to complete an upgrade.

Prefer flat ESLint config when the repository already uses modern ESLint. Do not introduce a second lint/format stack without reason.

## React linting

Treat Rules of Hooks and React Compiler-related diagnostics as correctness signals. Fix component/effect design before suppressing rules.

React 19 projects should not retain `react-test-renderer` as the default test strategy for new tests; use Testing Library/integration/E2E approaches as appropriate.

## Package manager

Use the existing lockfile/package manager. In CI use deterministic/frozen installation.

## Dependencies

- Add packages only when value exceeds maintenance and supply-chain cost.
- Prefer maintained libraries with clear compatibility and ownership.
- Verify Node 24, React 19, and TS7 declaration/tooling support for core dependencies.
- For React libraries, avoid dependencies that rely on private React internals.
- Keep lockfiles committed.

## CI runtime

Pin an intentional Node version/range. If using native TS stripping, require Node >=24.12 rather than a vague 24.x runner that may predate stable behavior.

For TS7's parallel checker/builders, start with defaults. Tune checker/builder concurrency only from measured CI CPU/memory behavior.

## Secrets and supply chain

Never print secrets in CI. Prefer short-lived/OIDC credentials when supported. Review install scripts for sensitive environments. Pin/verify third-party CI actions according to repository security policy.

## Script

`scripts/run-quality-gates.mjs` invokes only quality scripts already declared by the project.
