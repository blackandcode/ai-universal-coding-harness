---
name: typescript-node24-engineering
description: Implement or refactor AI Universal Coding Harness code using TypeScript 7 and Node.js 24.18+ idioms. Use when writing TypeScript, modeling states/errors, working with ESM, child processes, filesystem paths/files, cancellation/timeouts, streams, async concurrency, configuration, or cross-platform Node behavior. Do not use for provider protocol semantics, permission policy, or orchestration-state ownership when their dedicated skills apply.
compatibility: Node.js 24.18+; TypeScript 7.x; ESM.
metadata:
  role: language-runtime
---

# TypeScript 7 + Node 24 Engineering

Read the narrow reference that matches the task:

- `references/typescript7.md`
- `references/node24-runtime.md`
- `references/processes-and-cancellation.md`
- `references/filesystem-cross-platform.md`
- `references/error-and-state-modeling.md`

## TypeScript posture

- Model finite states with discriminated unions and exhaustive handling.
- External/provider/config/file data is `unknown` until validated.
- Prefer `satisfies` when checking object conformance while preserving inference.
- Avoid broad `any`; isolate unavoidable dynamic interop at the adapter edge.
- Prefer semantic types for identifiers/fingerprints when accidental mixing is costly.
- Prefer function/module composition over Java-style class pattern implementations.
- Do not create an interface merely to mirror every class.

## Node posture

- Use asynchronous APIs on operational paths unless a synchronous startup-only operation is deliberately simpler and bounded.
- Propagate cancellation/deadlines through long-running adapter/process/file operations.
- Bound concurrency; autonomous agents can otherwise create accidental process or I/O storms.
- Prefer `spawn`/`execFile` with argument arrays over shell command construction when shell semantics are unnecessary.
- Capture stdout/stderr/exit/signal state explicitly; a timeout/cancellation is not the same as a successful command that produced no output.
- Keep platform differences explicit and tested on Windows, Linux, and macOS.

## Implementation gate

Before finishing a non-trivial change, verify at least the repository's typecheck plus the smallest relevant test layer. Do not claim success from compilation alone.
