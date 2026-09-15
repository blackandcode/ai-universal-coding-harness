---
name: nodejs-engineering
description: Apply to Node.js 24+ applications, services, workers, CLIs and runtime code, including async behavior, errors, streams, shutdown, observability, environment handling and performance.
---

# Node.js Engineering

Target Node.js 24 or later. Prefer runtime-native platform APIs when they are stable and meet the need; add dependencies when they materially improve correctness or maintainability.

## Workflow

1. Inspect `engines.node`, package manager, module type and runtime scripts.
2. Identify lifecycle boundaries: startup, requests/jobs, background tasks, shutdown.
3. Make ownership of resources explicit.
4. Implement cancellation, timeout and error behavior intentionally.
5. Add observability at system boundaries.
6. Verify shutdown and failure paths as well as happy paths.

## Runtime rules

### Async ownership

Every promise should have an owner. Await it, return it, aggregate it, or explicitly detach it with a defined error path.

Use `Promise.all` for truly independent work. Do not serialize independent I/O by default.

### Cancellation and timeouts

Use `AbortSignal` where supported. Propagate cancellation from incoming requests/jobs to downstream I/O when appropriate. Network calls must not wait forever.

### Error handling

- Throw/return domain-specific errors with useful context.
- Preserve causes (`new Error(message, { cause })`) when wrapping errors.
- Do not catch only to log and rethrow unless the added log context is meaningful and will not duplicate higher-level reporting.
- Never expose secrets, tokens or full sensitive payloads in logs.

### Streams

Prefer streams for large/unbounded data. Respect backpressure. Use pipeline utilities that correctly propagate failures and cleanup.

### Graceful shutdown

Services must handle termination signals and stop accepting new work before closing dependent resources.

Shutdown order commonly resembles:

1. mark unhealthy/not-ready;
2. stop accepting new requests/jobs;
3. wait for bounded in-flight work;
4. close queues, database pools and clients;
5. flush telemetry if supported;
6. exit naturally.

Do not call `process.exit()` as routine control flow.

### Environment/config

Read, validate and normalize environment configuration during startup. Fail early on invalid required values. Pass typed config to application code instead of reading `process.env` throughout the codebase.

### Logging/observability

Use structured logs. Include request/job correlation identifiers where available. Log events, not prose dumps. Emit metrics/traces for behavior that operators need to reason about.

### Performance

Measure before optimizing. Investigate event-loop delay, allocation/GC, I/O concurrency, payload size, database/query behavior and serialization before applying micro-optimizations.

Avoid CPU-heavy synchronous work in request paths. Move expensive CPU-bound work to worker threads/processes when justified.

## TypeScript on Node 24+

Node's native TypeScript support can execute supported erasable TypeScript. Treat this as a runtime execution option, not a type checker.

- Keep `tsc --noEmit` as a quality gate.
- Use native type stripping only when project syntax/configuration is compatible.
- Use the normal compiler/bundler pipeline when the project relies on TypeScript transforms, build output, declaration generation or toolchain behavior Node does not provide.

## Module policy

Prefer ESM for new Node 24+ projects unless ecosystem compatibility requires CommonJS. Respect the existing repository model; do not mix module systems casually.

## Security baseline

- Validate untrusted input.
- Use parameterized queries.
- Avoid shell interpolation with untrusted data.
- Apply least-privilege credentials.
- Keep secrets out of source, logs and client bundles.
- Treat deserialization as a boundary.

## Completion gate

Run project typecheck, tests and lint; for services also verify startup and shutdown behavior when practical.

## References

- `references/async-errors-shutdown.md`
- `references/performance-observability.md`
- `scripts/check-node-project.mjs`
