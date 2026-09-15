# Permission policy

Conceptual modes:

- `auto_safe`: deterministically safe operations auto-allow; uncertain operations route to reviewer;
- `allow_all`: allow except hard-dangerous operations;
- `allowlist`: configured safe prefixes/patterns auto-allow; others route to reviewer;
- `ask_reviewer`: non-hard-dangerous operations route to reviewer.

## Classification

Classify the concrete operation, not merely the executable name. Arguments, cwd, redirections/shell operators, target path, environment, and operation type can change risk.

## Hard-dangerous examples

Keep destructive host/Git-history/system operations outside normal autonomous approval. The exact deny set should be centralized and regression-tested.

## Denial behavior

A denial is a valid workflow outcome. Return enough reason/context for the executor to choose a safer alternative. Do not let an executor bypass denial by restating the same operation through another request channel.

## Audit

Persist the requested operation, deterministic classification, mode, reviewer decision when used, and final execution outcome without leaking secrets.
