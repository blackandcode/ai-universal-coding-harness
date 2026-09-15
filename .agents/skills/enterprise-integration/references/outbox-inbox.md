# Transactional outbox, inbox, and idempotency

## Outbox

Problem: application state is committed to a database but publishing the corresponding message can fail (or vice versa).

Pattern:

1. update business state;
2. insert outbox message in the same DB transaction;
3. commit;
4. a publisher relays outbox records to the broker;
5. mark/track publication with retry-safe semantics.

Publication can still be duplicated. Consumers must tolerate duplicates.

## Inbox / processed-message record

For side-effectful consumers, store the message ID (or idempotency key) and state change in one local transaction where practical. Duplicate delivery then becomes a no-op or returns the prior result.

## Natural idempotency

Prefer operations whose semantics are naturally idempotent where possible, e.g. “set status to X” with version checks rather than “increment blindly”.

## Idempotency scope

Define:

- key generation/ownership;
- retention window;
- whether a duplicate returns previous output;
- treatment of same key with different payload;
- transaction boundary with side effects.
