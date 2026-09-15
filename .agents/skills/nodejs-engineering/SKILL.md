---
name: nodejs-engineering
description: Apply to Node.js 24+ services, workers, CLIs and runtime code. Covers TypeScript 7 integration, native TypeScript type stripping, ESM/module resolution, lifecycle, async ownership, cancellation, errors, streams, shutdown, observability, security and performance.
---

# Node.js 24+ + TypeScript 7 Engineering

Node runtime decisions and TypeScript module decisions must agree. Do not configure TypeScript as if Node were a bundler.

## Baseline

- Node.js 24+.
- Built-in TypeScript type stripping is stable from Node 24.12.0 onward.
- TypeScript 7 is the primary checker.
- Prefer ESM for new projects unless package/runtime compatibility requires CommonJS.

## First choose execution mode

### Mode A — emit JavaScript then run Node

Use `module: NodeNext` / `moduleResolution: NodeNext`. TypeScript/bundler produces deployable JavaScript. This is the default for services that need emit, source maps, transforms, declaration output, packaging, or predictable artifact deployment.

### Mode B — Node executes `.ts` directly

Use only when the project is deliberately written as erasable TypeScript. Node strips types but does **not** typecheck and does not honor arbitrary `tsconfig` transforms.

Recommended checker config includes:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "noEmit": true,
    "rewriteRelativeImportExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "strict": true
  }
}
```

Direct Node TypeScript must avoid syntax requiring JS generation, including runtime enums, runtime namespaces, parameter properties, and TypeScript import aliases. Decorator support follows Node/JavaScript runtime support, not TypeScript transpilation assumptions.

Always run TS7 type checking separately.

## Module rules

- Use Node-resolvable ESM specifiers.
- Do not use legacy `moduleResolution: node`/`node10`.
- Do not use `baseUrl`.
- Prefer package subpath `imports` (`#/*`) for internal aliases.
- `paths` can help the checker but does not rewrite Node runtime resolution.
- Under native type stripping, type-only imports must be explicitly marked `type`.

## Async ownership

Every promise has an owner. Await it, return it, aggregate it, or intentionally detach it with a defined error/observability strategy.

Start independent I/O concurrently. Do not serialize independent operations by default.

## Cancellation and deadlines

Use `AbortSignal` where supported. Propagate request/job cancellation downstream. External I/O should have bounded time behavior; do not leave network/database calls waiting indefinitely without a deliberate policy.

## Errors

- Preserve causes when wrapping: `new Error(message, { cause })`.
- Use domain-specific errors/results where callers need to branch on failure type.
- Do not catch merely to log and rethrow duplicate noise.
- Never log secrets/tokens/full sensitive payloads.

## Resource lifetime

Make ownership explicit for servers, sockets, database pools, queues, workers, file handles, timers, and subscriptions.

Where Node/library resources implement modern disposal protocols, `using` / `await using` can be considered when runtime/tooling compatibility is verified. Do not wrap every resource merely to use the syntax.

## Streams

Use streams for large or unbounded data. Respect backpressure. Prefer pipeline utilities that propagate errors and cleanup correctly.

## Graceful shutdown

Typical service order:

1. become unready/unhealthy for new traffic;
2. stop accepting requests/jobs;
3. wait for bounded in-flight work;
4. close queues/pools/clients/workers;
5. flush telemetry where supported;
6. allow natural process exit.

Do not use `process.exit()` as routine flow control.

## Environment/config

Read, validate, and normalize environment/config once at startup. Pass typed config inward. Do not read `process.env` throughout business logic.

Under TS7, add `types: ["node"]` to the relevant Node tsconfig rather than relying on ambient `@types` discovery.

## Observability

Use structured logs, correlation IDs where available, metrics for operational behavior, and traces for distributed dependencies. Log events/fields rather than giant object dumps.

## Performance

Measure before optimizing. Investigate event-loop delay, CPU profiles, allocations/GC, I/O concurrency, database/query behavior, serialization, and payload sizes before micro-tuning TypeScript/JavaScript syntax.

Move genuinely CPU-heavy request work to worker threads/processes when justified.

## Security

Validate untrusted inputs, parameterize database operations, avoid shell interpolation with untrusted values, apply least privilege, and keep secrets out of source/logs/client bundles.

## TS7 tooling caveat

If a Node tool imports TypeScript's compiler API (custom loaders, AST tooling, codegen, typed linting), verify TS7 support. TypeScript 7.0's compiler API transition may require the official TS6 side-by-side compatibility package for that tool even while the application is typechecked with TS7.

## References

- `references/typescript-7-node24.md`
- `references/async-errors-shutdown.md`
- `references/performance-observability.md`
- `../typescript-engineering/references/tooling-compatibility.md`
- `scripts/check-node-project.mjs`
