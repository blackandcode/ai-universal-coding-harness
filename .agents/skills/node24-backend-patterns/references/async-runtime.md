# Async runtime patterns

## Deadlines and cancellation

Remote work must not run forever. Establish a timeout/deadline at the appropriate boundary and propagate cancellation where libraries support `AbortSignal`.

Avoid stacking unrelated timeouts at every layer; maintain an overall request/workflow budget.

## Concurrency limit / bulkhead

Do not run unbounded `Promise.all()` over user-controlled or very large collections. Limit concurrency so one workload cannot exhaust sockets, DB connections, memory, or downstream quotas.

## Retry

Retries are for transient failures. Use bounded attempts, exponential backoff and jitter, and respect overall deadlines. Never retry non-idempotent side effects unless an idempotency mechanism makes it safe.

## Streams/backpressure

For large files, HTTP bodies, compression, or transformations, use streams/pipelines rather than buffering the full payload. Backpressure is part of correctness under load.

## Worker threads

Use a worker pool for CPU-intensive JavaScript tasks that would otherwise block the event loop. Do not spawn a new worker per small task. Node's asynchronous I/O is usually better for I/O-bound workloads.

## Event-loop blocking

Measure before optimizing, but investigate:

- large synchronous JSON/serialization work;
- regex/pathological parsing;
- sync filesystem APIs;
- CPU-heavy crypto/compression;
- huge object transformations;
- accidental long loops.
