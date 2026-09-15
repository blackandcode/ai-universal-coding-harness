# Integration resilience

## Retry with backoff and jitter

Retry transient failures only. Bound attempts and total time. Honor `Retry-After` / rate-limit semantics where available.

## Circuit breaker

Useful when a dependency is persistently failing and repeated calls would amplify load. A circuit breaker is not a substitute for timeout, retry classification, or capacity planning.

## Concurrency bulkhead

Limit concurrent calls/consumer work per dependency so one failing/slow dependency cannot exhaust the process.

## Dead-letter handling

A DLQ is not a garbage can. Record reason, attempts, message metadata, and provide a controlled inspection/replay/remediation path.

## Poison vs transient

Validation/schema/business rejection usually needs quarantine/manual policy, not endless retry. Network/temporary dependency failure may be retryable.
