# HTTP API patterns

## Resources and actions

Prefer resource-oriented URLs for CRUD-like capabilities. Use explicit action endpoints/commands when the operation is genuinely a business action rather than forcing awkward pseudo-CRUD.

## Errors

Use a stable machine-readable error shape. Problem Details (RFC 9457) is a strong default for HTTP APIs when it fits the ecosystem. Domain/application error codes should be stable even when human text changes.

## Pagination

- Offset pagination is simple and useful for bounded/admin datasets.
- Cursor/keyset pagination is preferable for large/changing datasets and stable traversal.
- Always define stable sort/order semantics.

## Idempotency

For retryable create/payment/external-side-effect operations, accept or derive an idempotency key and persist enough result state to return a consistent response to duplicates.

## Timeouts

An API timeout does not automatically cancel downstream work. Propagate cancellation when possible or model long-running work asynchronously with job/workflow status.
