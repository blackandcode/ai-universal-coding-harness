# Consistency and remote-call semantics

For every cross-boundary workflow, document:

- source of truth;
- required consistency (immediate, read-your-writes, eventual, monotonic, etc.);
- expected propagation delay;
- behavior during lag/outage;
- duplicate handling;
- ordering requirements;
- timeout semantics;
- reconciliation strategy.

## Timeout ambiguity

When a remote write times out, the operation may have succeeded remotely. Prefer idempotency keys and a query/reconciliation path instead of blindly repeating irreversible work.

## Reconciliation

For money, inventory, provisioning, and other critical integrations, design periodic or on-demand reconciliation. Messaging retries alone do not prove end-to-end correctness.
