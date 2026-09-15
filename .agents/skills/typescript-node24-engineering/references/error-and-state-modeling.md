# Error and state modeling

Separate expected control outcomes from exceptional failures.

## Expected outcomes

Examples: reviewer requests rework, permission denied, stage selection ambiguous, quality evidence insufficient. Represent these with explicit result/state variants when callers are expected to handle them.

## Exceptional failures

Examples: corrupt persisted state, unexpected provider protocol shape after validation logic, failed filesystem write, impossible state transition. Throw/return typed failures with diagnostic context and preserve the original cause where useful.

## Translation boundaries

Translate low-level errors at the module boundary that has enough semantic context:

- OS process error -> process execution failure;
- provider/ACP parse error -> adapter protocol failure;
- Git exit -> typed repository operation failure;
- JSON parse/schema error -> persisted-state/config validation failure.

Do not discard the raw cause needed for audit/debugging.

## State machines

Use one discriminant as the authoritative phase. Keep transition functions small and test illegal transitions. If persisted state needs a schema version, version it explicitly rather than guessing old shapes.
