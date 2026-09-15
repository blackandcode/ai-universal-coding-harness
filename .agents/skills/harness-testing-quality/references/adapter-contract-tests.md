# Adapter contract tests

Every executor/reviewer adapter should run against a common behavior suite plus provider-specific regression fixtures.

## Executor contract scenarios

- preflight pass/fail;
- session create/resume;
- normal streamed tool lifecycle;
- multi-chunk sparse updates;
- permission request transport;
- blocking question transport;
- cancellation/timeout;
- malformed provider output;
- persisted raw-event replay;
- command executed through permission-mediated path.

## Reviewer scenarios

- valid `APPROVE`;
- valid `REWORK` with actionable feedback;
- malformed/ambiguous decision fails closed;
- question answering;
- uncertain permission decision;
- provider timeout/cancellation.

## Provider fixtures

Keep representative raw protocol fixtures for bugs that depend on exact chunk order/field omission. Normalize them through the same parser used in production instead of hand-constructing already-normalized results.
