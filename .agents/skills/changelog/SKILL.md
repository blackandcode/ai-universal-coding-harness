---
name: changelog
description: 'Record concise, descriptive change entries under ## [Unreleased] in CHANGELOG.md following Keep a Changelog standards.'
compatibility: 'Node.js 24.18.0+, npm 11+, any standard markdown editor.'
---

# Changelog Skill — Unreleased Change Logging

## Overview

The changelog is the developer- and user-facing chronological source of truth for **WHAT** changed in the package. Staging changes under `## [Unreleased]` ensures that when a new version is released, `npm run update-version` can automatically package those entries into the release notes (the automated packaging workflow).

---

## When to Use

**Mandatory Invariant:**
Trigger this skill on **100% of agent runs and engineering sessions** that modify project code, tests, documentation, or configuration. This is the **final step** executed after tests and linting pass, immediately prior to concluding the task.

---

## Keep a Changelog Categories

Entries must be organized under `## [Unreleased]` beneath the appropriate category heading:

| Heading          | Description                                                                                 | Examples                                                      |
| ---------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `### Added`      | New user-facing features, CLI subcommands, flags, adapter capabilities, or test suites.     | CLI flag `--quiet`, reviewer role `large_diff`.               |
| `### Changed`    | Changes in existing functionality, architectural refactorings, or performance improvements. | Refactored ReviewerRouter, modernized Ink UI components.      |
| `### Deprecated` | Features planned for removal in future releases.                                            | Legacy `AI_STAGE_*` env vars, legacy config format.           |
| `### Removed`    | Features, options, or endpoints removed in this release.                                    | Deprecated monolithic UI class, obsolete scripts.             |
| `### Fixed`      | Bug fixes, typo corrections, edge case handling, or lint/type error fixes.                  | Resolved lock conflict recovery, fixed diff truncation check. |
| `### Security`   | Security hardening, vulnerability remediation, or capability validation improvements.       | Hardened command classifier, denied path boundary escapes.    |

---

## Writing Guidelines

1. **Concise & Descriptive:** Write 1–2 clear bullet points per logical change.
2. **Outcome-Oriented:** Focus on what is now possible or what bug was fixed, not internal train of thought.
3. **Reference Symbols & Paths:** Use backticks for code symbols, CLI commands, and file paths (e.g. `scripts/versioning/increase-version.mjs`, `src/version.ts`).
4. **Preserve Prior Entries:** Never overwrite or erase existing unreleased bullet points; append to the relevant category section.

---

## Execution Methods

### Method 1: Deterministic CLI Helper (Recommended)

Run the bundled CLI helper to append entries safely without manual markdown formatting errors:

```bash
# Add a new feature
npm run changelog:add -- -t Added "Added CLI parameters to scripts/versioning/increase-version.mjs"

# Add a bug fix
npm run changelog:add -- -t Fixed "Fixed recovery state transition when run is interrupted"

# Add a change/refactor
npm run changelog:add -- -t Changed "Refactored ReviewerRouter to support dynamic fallback"
```

### Method 2: Direct Markdown Edit

Edit `CHANGELOG.md` directly under `## [Unreleased]`:

```markdown
## [Unreleased]

### Added

- Added CLI parameter flags (`--target-version`, `--bump`, `--changelog`, `--decision`) to `scripts/versioning/increase-version.mjs`.

### Fixed

- Resolved unhandled promise rejection in `RecoveryManager.ts` when session log is empty.
```

---

## Release Coordination

When a release is triggered (via `npm run update-version`):

1. The versioning engine automatically scoops up all items under `## [Unreleased]`.
2. Converts them into `## [X.Y.Z] - YYYY-MM-DD`.
3. Inserts a fresh, clean `## [Unreleased]` section at the top.
