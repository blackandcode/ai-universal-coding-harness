# Process lifecycle and graceful shutdown

## Startup

A service should not advertise readiness until required configuration and dependencies needed for serving are usable.

Fail fast on invalid configuration. Do not start with silently missing secrets or malformed environment variables.

## Liveness vs readiness

- Liveness: is the process/event loop alive enough that restarting might help?
- Readiness: should this instance receive new work?

Avoid deep liveness checks that turn a downstream outage into a restart storm.

## Graceful shutdown

On SIGTERM/platform stop:

1. mark not-ready / stop accepting new work;
2. stop intake from HTTP/message consumers/schedulers;
3. allow in-flight work to finish within a bounded grace period;
4. flush critical telemetry if the stack requires it;
5. close DB/broker/client pools;
6. terminate remaining work after the deadline and exit non-zero if shutdown failed materially.

Handlers should tolerate cancellation and duplicate delivery after crashes.

## Background jobs

Do not leave untracked promises. Jobs need ownership, failure handling, observability, shutdown semantics, and retry/idempotency policy.
