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
