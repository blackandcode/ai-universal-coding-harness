# Contract and integration tests

## Database adapters

Test migrations and queries against the actual database engine/version used in production where practical. ORM mocks cannot prove SQL, constraints, transaction behavior, or driver mapping.

## HTTP APIs

Test validation, auth boundaries, status/error mapping, idempotency behavior, and schema compatibility at the adapter.

## Messaging

Test:

- valid/invalid schema;
- duplicate delivery;
- handler crash/retry;
- poison message path;
- ordering assumption;
- outbox publication and recovery;
- consumer idempotency transaction.

## External providers

Combine local protocol fakes/stubs for deterministic error scenarios with a smaller provider sandbox/contract suite where available.
