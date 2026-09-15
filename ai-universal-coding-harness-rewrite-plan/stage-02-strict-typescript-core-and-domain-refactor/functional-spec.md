# Functional Specification — Stage 02: Strict TypeScript Core and Domain Refactor

## Objective

Make the non-harness core genuinely TypeScript-7-safe, modular, readable and
strictly typed while preserving public behavior.

## Scope

Refactor:

- `src/types.ts`
- `src/core/**`
- `src/git/**`
- `src/project/**`
- `src/state/**`
- `src/stages/StageSource.ts`
- `src/stages/context.ts`
- `src/stages/PlanCoordinator.ts`
- CLI parsing/dispatch modules
- public exports

Do not deeply refactor Cursor/Codex adapters or Ink UI yet; those belong to
Stages 03 and 04.

## Required outcomes

### Strict typing

At the end of this stage:

- `strict: true`
- `noImplicitAny: true`
- internal domain code contains no broad `any`
- untrusted JSON/config/process inputs use `unknown` plus validators/narrowing
- public library exports have intentional types
- optional/null states are explicit

Consider enabling:

- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `useUnknownInCatchVariables`
- `noImplicitOverride`

Only enable an option if the migrated source and dependency surface can support
it cleanly.

### Domain types

Introduce clear semantic types for:

- run identifiers;
- stage identifiers;
- run status;
- stage phase;
- harness IDs;
- quality/evidence status;
- semantic UI events where shared.

Use discriminated unions where state variants differ materially.

### Configuration

Make camelCase `OrchestratorConfig` authoritative.

Legacy uppercase aliases and `AI_STAGE_*` compatibility must live in one narrow
compatibility adapter, not be consumed throughout the codebase.

Validate config values before constructing the effective config.

### Errors

Introduce typed/domain errors where callers need to distinguish:

- invalid configuration;
- invalid stage source;
- Git lifecycle failure;
- lock conflict;
- invalid run state;
- subprocess timeout/exit.

Do not convert every error into a custom class; only distinguish actionable
categories.

### CLI

Split parsing from command execution.

CLI parser should produce a typed command union such as:

```text
init
run
resume
recover
validate
config
runs
tail
preflight
```

Handlers should receive typed input rather than reading arbitrary argv fields.

### Readability and comments

- one statement per line;
- descriptive names;
- functions kept focused;
- JSDoc on exported APIs and non-obvious extension points;
- comments on invariants/recovery logic, not trivial syntax.

## Acceptance criteria

- strict TypeScript passes;
- core code no longer depends on uppercase config compatibility fields;
- no accidental `any` in core/domain modules;
- existing behavior preserved;
- tests added for every refactored service;
- public declaration output remains valid.
