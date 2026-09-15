# Functional Specification — Stage 05: Documentation, Testing and v2 Release

## Objective

Finish the modernization as a coherent public v2.0.0 release.

This stage does not perform a new architecture rewrite. It closes gaps,
strengthens tests, completes documentation/comments, validates package
consumption and releases the finished contract.

## Required outcomes

### Test completion

Add missing tests discovered during Stages 01–04.

The final suite must cover:

- configuration;
- CLI parsing/handlers;
- filesystem/process utilities;
- Git lifecycle;
- workspace init/reset;
- run state/locks;
- stage validation;
- plan coordination;
- harness registry/plugins;
- Cursor ACP;
- Codex reviewer;
- permissions;
- evidence;
- recovery;
- orchestration state flow;
- UI reducer/components;
- package consumer.

### Coverage

Adopt a documented native Node coverage gate if stable with Node 24.

Suggested minimums:

- lines >= 85%
- functions >= 85%
- branches >= 80%

Security/recovery/evidence modules should exceed the global branch threshold.

### Cross-platform validation

GitHub CI:

```text
Ubuntu
Windows
macOS
```

Test minimum supported Node 24 version.

### Package validation

Verify:

- `npm pack --dry-run`;
- packed package contains only intended files;
- CLI executable works from packed package;
- library import works;
- declaration files resolve in a consumer fixture;
- no source-only paths leak into declarations;
- no Unix-only assumptions.

### Documentation

Update:

- root marketing README;
- getting started;
- configuration;
- architecture;
- execution flow;
- stage contract;
- harnesses;
- permissions;
- state/resume/recovery;
- UI;
- testing;
- development;
- publishing;
- troubleshooting;
- rules/skills docs.

Mermaid diagrams must reflect actual v2 module boundaries.

### Code documentation and docblock standards

Final comprehensive documentation pass:

- **Top-of-file descriptions**: Verify that every source, test, script, and utility file across the entire repository has a clear top-of-file docblock description explaining what the file is about, its architectural scope, and key responsibilities.
- **Cross-stage header maintenance**: For any file edited or extended during Stage 05 (or prior stages), update the top-of-file description to reflect the changes, new capabilities, and evolved responsibilities.
- **Docblock coverage for all code**: Comprehensive, high-quality JSDoc/TSDoc docblocks for all functions, methods, classes, interfaces, and types (covering internal modules as well as exported public contracts).
- **Internal logic documentation**: Clear docblocks and explanatory comments for internal logic, algorithms, recovery flows, state transitions, and edge-case handling across the entire codebase.
- **Hygiene**: Remove stale/redundant comments, commented-out code, and temporary migration notes.

### Skills/rules

Update existing skills/rules to match actual v2 behavior.

Do not duplicate generic TypeScript/Node/React guidance across many project
rules; project rules should focus on repository-specific invariants.

### Versioning

Set package version to `2.0.0`.

Add a `2.0.0` changelog entry explaining:

- Node 24.18+ runtime requirement;
- TypeScript 7 strict modernization;
- React 19/Ink 7 UI rewrite;
- harness/evidence reliability improvements;
- tooling/formatting/linting changes;
- any compatibility/deprecation decisions.

### Release

Keep npm Trusted Publishing/OIDC.

No long-lived npm token.

## Acceptance criteria

The repository is release-ready from a clean clone with documented commands and
green cross-platform CI.

Additionally:

- every file in the codebase has a clear top-of-file docblock description, accurately updated to reflect any functionality added across stages;
- all functions, classes, interfaces, types, and complex internal logic have thorough docblock and explanatory documentation;
- all unit, integration, CLI smoke, and package-consumer tests pass with required coverage gates.
