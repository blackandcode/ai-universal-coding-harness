# Adapter contracts

## Executor capabilities

An executor adapter may support:

- preflight;
- session creation/resume;
- planning;
- implementation interaction;
- streamed tool/command observations;
- permission requests;
- blocking questions;
- evidence/result emission.

## Reviewer capabilities

A reviewer adapter may support:

- preflight;
- plan review;
- implementation review;
- answering executor questions when policy permits;
- uncertain permission decisions.

Reviewer adapters do not mutate project files or own Git lifecycle.

## Capability design

Prefer a stable required core plus explicit optional capabilities rather than one oversized interface full of methods that throw “unsupported”. Capability absence should be detectable during preflight before mutable run work where possible.

## Contract evolution

- add fields/capabilities compatibly where possible;
- version persisted adapter/session metadata if shape changes;
- keep provider-version quirks inside the provider adapter;
- add adapter contract tests before relying on a new capability from orchestration.
