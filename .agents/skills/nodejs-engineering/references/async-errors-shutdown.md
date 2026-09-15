# Async, errors and shutdown

## Detached work

Detached promises are acceptable only when ownership is explicit. Attach rejection handling and ensure shutdown behavior is understood.

## Retry

Retry only operations that are safe to retry. Use bounded attempts with backoff/jitter. Idempotency keys or idempotent command design may be necessary for external side effects.

## Error taxonomy

Distinguish expected operational failures from programmer defects. Expected failures should become stable API/job outcomes; unexpected failures should retain diagnostic context and reach centralized error reporting.

## Shutdown

Use a bounded drain period. A service that waits forever for broken in-flight work is not graceful.
