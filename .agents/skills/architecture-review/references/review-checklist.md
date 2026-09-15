# Architecture review checklist

## Boundaries

- Can each business module be named and explained?
- Does it expose an intentional public API?
- Are private internals imported cross-module?
- Are module boundaries based on business capability or only technical layers?

## Domain/application

- Where do invariants live?
- Are use cases visible or hidden in controllers/jobs?
- Are external SDK/ORM types leaking inward?

## Persistence

- Who owns each authoritative write?
- Are transaction boundaries explicit?
- Are remote calls performed inside DB transactions?
- Are read queries forced through write-domain objects unnecessarily?

## Integration

- Are messages commands/events/documents with clear semantics?
- Is duplicate delivery safe?
- Is the DB+message dual-write problem handled?
- Are retries bounded and classified?
- Is dead-letter/replay operationally defined?

## Runtime

- Any synchronous blocking on hot paths?
- Unbounded concurrency?
- Missing timeouts/cancellation?
- Graceful shutdown and readiness correct?
- Request/job correlation context available?

## Contracts

- Runtime validation present?
- Stable error contracts?
- Compatibility/versioning policy?
- Deterministic pagination?

## Tests

- Domain invariants tested?
- Real adapter integration tests?
- Contract tests?
- Duplicate/retry/outage tests for messaging?
- Architecture rules enforced automatically?
