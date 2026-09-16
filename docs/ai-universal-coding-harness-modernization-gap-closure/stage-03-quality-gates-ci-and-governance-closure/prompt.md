# Coding Agent Prompt — Stage 03

Implement **Stage 03: Quality Gates, CI and Governance Closure**.

## Rules

1. Do not redesign runtime product behavior in this stage.
2. Make existing documented guarantees mechanically true.
3. Keep Node native coverage tooling unless it cannot implement the required per-subsystem gate.
4. Include all repository script tests in `npm run verify`.
5. Test exact Node 24.18.0 on Ubuntu, Windows and macOS; use one extra Ubuntu Node 24 latest job for forward compatibility.
6. Repair the broken decision-log provenance and create/update `IMPLEMENTATION-STATUS.md`.
7. Add local Markdown-link checking so broken internal documentation links fail quality gates.
8. Reconcile docs with actual code and CI; do not leave aspirational claims presented as already implemented facts. Do not fix `config.example.jsonc` or `reviewer.primary` runtime precedence here — defer to **Stage 04**.
9. Retain npm Trusted Publishing/OIDC.
10. Update `CHANGELOG.md`, `DECISIONS.md`, and `IMPLEMENTATION-STATUS.md`.

## Verification

Run during implementation:

```bash
npm run check:changed
```

Before completion:

```bash
npm run verify
npm pack --dry-run
```

Also inspect the final GitHub Actions matrix to confirm the exact minimum runtime appears on all three operating systems.
