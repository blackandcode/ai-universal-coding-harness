# Technical Specification — Stage 05

## Full verification command

The final `npm run verify` should include, directly or via subcommands:

```text
format check
lint
typecheck
unit tests
coverage gate
CLI smoke
package consistency checks
```

Keep `npm pack --dry-run` as an explicit release/package validation step if it
would be problematic inside every local verify.

## Orchestrator integration tests

Add deterministic fakes and run at least these flows:

### Successful stage

```text
valid stage
plan approved
executor evidence PASS
review approved
commit produced
```

### Rework

```text
review asks for rework
executor reruns
new evidence
review approves
```

### Resume

```text
interruption after plan
resume uses approved plan
```

### Recovery

```text
valid current evidence -> REVIEW
stale evidence -> QUALITY
```

### Permission volume

Many unique permission decisions do not block the stage.

### Plan budget

Three normal plan reviews + final consolidation always produce an executable
plan state.

## Consumer fixture

Build/package then test from a temporary directory:

```text
npm install <packed-tgz>
node import-test.mjs
ai-harness --version
ai-harness init
ai-harness config show
ai-harness validate ...
```

## Documentation diagrams

At minimum:

1. package architecture;
2. harness adapter boundary;
3. run/stage lifecycle;
4. permission decision flow;
5. evidence/quality flow;
6. state/resume/recovery;
7. UI semantic event flow.

## Code documentation and docblock audit

Perform a repository-wide code documentation audit:

### Top-of-file headers

Verify and enforce that every source, test, script, and configuration/utility file has a descriptive header docblock:

```ts
/**
 * @fileoverview <Module purpose, key responsibilities, and architectural boundaries>
 */
```

Whenever any file is touched to add functionality, update tests, or adjust configuration, the top-of-file docblock must be updated to reflect the new functionality.

### Comprehensive docblocks

- All classes, constructors, methods, and getters/setters must have JSDoc detailing responsibilities, lifecycle, and parameters.
- All standalone and exported functions must document `@param`, `@returns`, and `@throws`.
- All interfaces, type aliases, and enums must document each property and type parameter.
- Internal logic and non-obvious algorithms (e.g. coverage thresholds, package boundary checks, test runners, process spawning) must have docblocks or explanatory comments clarifying the implementation logic.

## Release checklist

- package version `2.0.0`;
- lockfile committed;
- changelog complete;
- no dirty generated files;
- `dist/` regenerated exactly once from clean source;
- source maps/declarations present;
- CI green;
- npm Trusted Publisher config documented;
- Git tag `v2.0.0`;
- GitHub Release generated;
- npm provenance/trusted publishing confirmed.

## Deprecation review

Decide explicitly whether to keep or deprecate:

- legacy `AI_STAGE_*` env variables;
- `.ai-stage-orchestrator.jsonc`;
- uppercase internal compatibility config aliases.

Public backward compatibility and internal cleanup are separate decisions.

Document the result.
