---
name: node24-backend-patterns
description: Implement production Node.js 24+ backend runtime patterns with TypeScript 7. Use for async I/O, cancellation/deadlines, concurrency limits, worker threads, streams/backpressure, process lifecycle, graceful shutdown, request context, observability, configuration, error boundaries, health checks, and native TypeScript execution decisions.
compatibility: Node.js 24+; TypeScript 7.x. Native type stripping guidance assumes Node 24.12+ for stable status.
metadata:
  role: node-runtime
  stack: node24-typescript7
---

# Node.js 24 Backend Patterns

Node is optimized for asynchronous I/O. Design around the event loop rather than importing thread-per-request assumptions from other runtimes.

Read:

- `references/async-runtime.md` for async I/O, cancellation, concurrency, streams, workers;
- `references/lifecycle.md` for startup/shutdown/readiness;
- `references/observability.md` for AsyncLocalStorage, tracing/logging/metrics;
- `references/native-typescript.md` for Node's TS execution model.

## Runtime defaults

- Use async APIs on request paths; avoid synchronous filesystem/crypto/compression work that blocks the event loop.
- Bound concurrency for fan-out and background work.
- Use deadlines/timeouts for remote calls and propagate cancellation with `AbortSignal` when supported.
- Use worker threads for CPU-bound JavaScript, not for ordinary I/O.
- Respect stream backpressure.
- Centralize configuration parsing/validation at startup.
- Treat startup failure as fatal when required dependencies/configuration are invalid.
- Gracefully stop accepting work before closing dependencies.
- Use structured logging with correlation/trace context.

## Framework neutrality

These rules apply whether HTTP is implemented with Fastify, Express, Hono, Nest, native Node, or another framework. Framework adapters should not own domain policy.
