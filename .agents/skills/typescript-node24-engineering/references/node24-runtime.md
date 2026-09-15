# Node.js 24 runtime patterns

## Event-loop discipline

The harness mostly coordinates I/O: provider processes, Git, filesystem, terminal rendering, and project commands. Keep CPU-heavy parsing/fingerprinting bounded and avoid synchronous work in hot/live paths when it can stall streaming UI or protocol handling.

## Concurrency

Do not fan out unbounded promises/processes. Use a small explicit concurrency limit when running multiple independent checks or inspections. Concurrency policy belongs near the coordinator that understands load and cancellation.

## Streams

For large/continuous stdout, stderr, protocol events, or logs:

- consume incrementally;
- respect backpressure where streams are used;
- do not buffer unbounded provider output in memory;
- persist raw audit output separately from concise semantic UI state.

## Async context

Use `AsyncLocalStorage` only when request/run correlation truly benefits many lower-level log calls. Prefer explicit IDs in core data structures when they are already naturally available.

## Native TypeScript execution

Node 24 supports stable lightweight type stripping, but the project compiler/build remains the authority for TS correctness. Native execution does not read/implement all `tsconfig` transform behavior and is not a substitute for `tsc`/project typecheck.

## Startup/shutdown

Long-running CLI processes should have explicit teardown paths for:

- child processes/sessions;
- locks;
- open streams/log files;
- terminal modes/cursor state;
- pending state persistence.

Cleanup must not silently mark an incomplete stage as successful.
