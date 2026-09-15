# Transactions and consistency

## Local transaction

Use a single local ACID transaction when data that must be immediately consistent lives in the same database/transactional resource. This is simpler and stronger than introducing a distributed workflow.

## Remote calls

Avoid:

```text
BEGIN DB TRANSACTION
  write
  call remote payment service and wait
  write
COMMIT
```

This couples database locks/lifetime to network uncertainty. Prefer staged state, idempotent remote operations, outbox/workflow patterns, or another explicit design.

## Optimistic concurrency

A version column/ETag/revision can detect lost updates. When conflict occurs, fail/reload/recompute according to business semantics; do not blindly overwrite.

## Unit of work

Use when several repository operations must commit atomically. Do not create a UoW abstraction if your ORM/transaction callback already provides a clear, testable transaction boundary and wrapping it adds no value.
