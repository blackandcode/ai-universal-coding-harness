# External harness plugin registry

External harness modules are a replaceability extension point, not arbitrary access to orchestrator internals.

## Rules

- resolve package modules from the target project and relative modules from the documented repository root;
- validate registration shape and unique adapter IDs;
- factories receive only the capabilities/configuration they need;
- plugin failure during load/preflight must be reported before mutable orchestration where possible;
- do not let plugins replace permission policy, Git ownership, evidence truth rules, or run-state invariants merely by registering an adapter;
- record adapter/plugin identity/version metadata in run diagnostics where useful for resume/debugging.

## Security

A plugin is executable code. Treat configured external modules as a trust decision, not as untrusted data that can be sandboxed by TypeScript types. See `harness-security-permissions` for trust and configuration rules.
