# Error modeling

Use different mechanisms for different failure classes.

## Expected business/application outcomes

Represent expected alternatives explicitly when callers are expected to branch:

```ts
type ReserveInventoryResult =
  | { ok: true; reservation: Reservation }
  | { ok: false; reason: 'insufficient-stock' | 'sku-not-found' };
```

## Exceptional infrastructure/programming failures

Throw/reject when normal execution cannot continue and the current layer cannot meaningfully recover: database unavailable, invariant bug, corrupted configuration, unexpected vendor response.

Catch at a boundary that can add policy/context: retry, translate to HTTP/problem details, nack/dead-letter a message, or terminate startup.

## Do not

- catch and silently return `undefined` for failures that matter;
- use strings as unstructured error taxonomies across boundaries;
- retry validation/business-rule errors;
- expose raw vendor/ORM exceptions as public API contracts.

## Error translation

Adapters translate low-level errors into stable application categories while preserving the original cause for logging/tracing.
