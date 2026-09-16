# Technical Specification — Stage 03

## Primary files

```text
package.json
scripts/run-tests.mjs
scripts/package-check.mjs
scripts/check-doc-links.mjs (new if chosen)
.github/workflows/ci.yml
DECISIONS.md
IMPLEMENTATION-STATUS.md
CHANGELOG.md
docs/testing.md
docs/development.md
docs/publishing.md
docs/Functional-specification.md
README.md
tests/scripts/**
```

## Critical coverage enforcement

Use Node 24 native coverage where practical; do not add Istanbul/c8 only for this requirement unless Node's native tooling proves insufficient.

Preferred design:

```text
Global suite
  lines >= 85
  functions >= 85
  branches >= 80

Critical permissions gate
  explicit include set
  explicit thresholds >= global, branch > 80

Critical evidence gate
  explicit include set
  explicit thresholds >= global, branch > 80

Critical recovery gate
  explicit include set
  explicit thresholds >= global, branch > 80
```

Critical include sets:

```text
src/permissions/CommandClassifier.ts
src/permissions/PermissionEngine.ts

src/quality/EvidenceVerifier.ts
src/quality/EvidenceService.ts

src/orchestrator/RecoveryManager.ts
```

Keep thresholds in one obvious configuration location so documentation and scripts cannot drift.

## Full verify chain

Recommended logical order:

```text
format:check
lint
typecheck
test:coverage (global)
test:critical-coverage
test:scripts
test:cli
package-check
doc-link-check
```

The exact npm script names may differ.

## CI matrix

Use an explicit include list to avoid matrix ambiguity:

```yaml
strategy:
  matrix:
    include:
      - os: ubuntu-latest
        node: 24.18.0
      - os: windows-latest
        node: 24.18.0
      - os: macos-latest
        node: 24.18.0
      - os: ubuntu-latest
        node: 24
```

Every job runs `npm run verify`.

At least the package/release job should additionally run `npm pack --dry-run` if `verify` does not already provide equivalent inventory checking.

## Script tests

The `.mjs` tests under `tests/scripts` are not compiled by `tsconfig.test.json`; execute them explicitly with `node --test`.

They must be part of `verify`.

## Documentation link checker

Scope the checker to maintained Markdown, for example:

```text
README.md
DECISIONS.md
IMPLEMENTATION-STATUS.md
CONTRIBUTING.md
SECURITY.md
docs/**/*.md
AGENTS.md
```

Optionally include project-owned `.agents/rules/**/*.md` and `SKILL.md` files, but ignore obvious template placeholder targets.

Rules:

- ignore `http://`, `https://`, `mailto:` and pure `#anchor` targets;
- remove anchor fragment before filesystem check;
- resolve links relative to the current Markdown file;
- fail with source file + broken target.

## Governance artifacts

### DECISIONS.md

Root file becomes authoritative. Do not point to a file not present in the repository.

### IMPLEMENTATION-STATUS.md

Suggested sections:

```text
Current release
Architecture status
Modernization plan status
Compatibility/deprecations
Testing/quality status
Known deferred work
Stage closure history
```

## Documentation accuracy tests

Where useful, add lightweight invariant tests for claims that can be mechanically checked, for example:

- exact Node engine/min matrix;
- required verify subcommands;
- local decision-log target exists;
- implementation status exists.
