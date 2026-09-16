# Functional Specification — Stage 03: Quality Gates, CI and Governance Closure

## Objective

Make the repository's documented quality/release guarantees true in automation and clean up modernization governance artifacts.

This stage should contain little or no product behavior change.

## Required outcomes

### 1. Enforce critical subsystem coverage independently

The repository already documents dedicated coverage expectations for:

- permissions/security;
- evidence/quality;
- recovery.

Implement actual machine-enforced per-subsystem coverage gates.

At minimum, critical subsystem thresholds must not be lower than the global gate, and branch coverage must be set above the global 80% threshold as originally intended.

The enforcement must fail CI/`npm run verify` when a critical subsystem falls below its threshold even if global repository coverage still passes.

### 2. Make `verify` run the complete test suite

`tests/scripts/versioning.test.mjs`, `changelog.test.mjs`, and `adr.test.mjs` must be included in the authoritative verification path.

Rename `test:versioning` to a clearer `test:scripts` if helpful, while keeping a compatibility alias if desired.

`npm run verify` must mean what the documentation says: all required repository tests and gates.

### 3. Correct CI minimum-runtime coverage

Test the exact minimum runtime `24.18.0` on:

- Ubuntu;
- Windows;
- macOS.

Add one separate Ubuntu job for floating/latest Node 24 to detect forward regressions.

Avoid accidental duplicate matrix combinations.

### 4. Repair governance documentation

Make the root `DECISIONS.md` authoritative.

Remove the broken reference to the absent rewrite-plan directory or restore/migrate the referenced decisions into a real tracked location.

Add `IMPLEMENTATION-STATUS.md` because the modernization process explicitly required it and because it provides useful handoff context for future coding agents.

The file should summarize:

- current released version;
- implemented modernization capabilities;
- deprecated compatibility surfaces still supported;
- known intentionally deferred items;
- completed corrective stages.

### 5. Add relative documentation link validation

Add a lightweight deterministic check for repository-relative Markdown links in the primary maintained documentation set.

It should catch missing local targets such as the current broken decision-log link while ignoring code examples/placeholders that are not links.

Include this in `verify` or package/documentation verification.

### 6. Reconcile docs with actual automation

Update documentation that currently overstates or misstates:

- independent critical coverage enforcement;
- exact CI runtime matrix;
- moved test paths;
- modernization baseline provenance (`1.0.2` vs intended `v1.0.3`);
- current source version versus historical baseline.

**Out of scope for F-11:** user-facing **configuration contract** accuracy (`config.example.jsonc`, `docs/configuration.md` precedence, config key → behavior tests) is **F-14 / Stage 04**. Stage 03 F-11 remains CI, coverage, matrix, governance, and product/architecture doc accuracy only.

## Non-goals

- No new product workflow features.
- No UI redesign.
- No adapter redesign.
- No new publishing mechanism; retain npm Trusted Publishing/OIDC.
- Do not rewrite historical changelog entries unnecessarily; add corrective notes/current docs where appropriate.

## Acceptance criteria

- A synthetic critical-module coverage regression fails the critical coverage gate.
- Script governance tests execute as part of `npm run verify`.
- CI contains exact Node 24.18.0 jobs for Ubuntu, Windows and macOS plus a latest-24 forward job.
- Root decision log contains no broken authoritative reference.
- `IMPLEMENTATION-STATUS.md` exists and is current.
- local relative Markdown-link validation passes.
- `npm run verify` and `npm pack --dry-run` pass.
