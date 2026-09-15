# Idempotency, retry, timeout, and replay

These are local workflow reliability concepts here, not a distributed-systems architecture.

## Retry

Retry only when:

- the operation is known safe/idempotent or protected by an idempotency check;
- the error is plausibly transient;
- attempts are bounded;
- backoff/cancellation is respected;
- diagnostics preserve prior failures.

Do not nest hidden retries across adapter, orchestrator, and utility layers.

## Timeout

A timeout means the harness stopped waiting. For provider/session operations, outcome may be unknown. Resume logic must inspect durable provider/session/repository state instead of assuming the action did not occur.

## Replay

Replaying persisted raw adapter events is allowed to rebuild derived observations. Replay must be deterministic and must not trigger the original external side effect again.

## Idempotency checkpoints

For branch creation, commit, frozen-input creation, and other named artifacts, check existing durable/Git state before repeating after interruption.
