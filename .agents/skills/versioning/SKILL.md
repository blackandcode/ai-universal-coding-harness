---
name: versioning
description: 'Automatically calculate and synchronize package version increments across project files, package metadata, TypeScript constants, documentation, and changelog using scripts/versioning/increase-version.mjs.'
compatibility: 'Requires Node.js 24.18.0+ and npm 11+.'
---

# Versioning Skill

## When to Use

Trigger this skill whenever:

- The user's initial prompt explicitly requests a version bump or release (e.g. "bump version", "release v2.1.0", "finish stage with patch bump").
- A developer manually triggers an atomic package version increment.
- Synchronizing version numbers across `package.json`, `package-lock.json`, `src/version.ts`, documentation (`README.md`, `docs/Functional-specification.md`, `docs/publishing.md`), and `CHANGELOG.md`.

_Note:_ If the user did **not** explicitly request a version bump, do NOT run version increments automatically; instead, stage changes in `CHANGELOG.md` under `## [Unreleased]` using the `changelog` skill.

---

## Execution Procedures

### 1. Determine Target Version or Bump Type

Inspect the current version in `package.json` and select the appropriate bump:

- **Patch bump (`patch`)** (e.g. `2.0.0` → `2.0.1`): Maintenance fixes, refactoring, bug fixes, or minor iteration.
- **Minor bump (`minor`)** (e.g. `2.0.0` → `2.1.0`): Completed implementation stage, major feature addition, or new adapter capabilities.
- **Major bump (`major`)** (e.g. `2.x.x` → `3.0.0`): Breaking architectural change, engine requirement update, or foundational protocol overhaul.

### 2. Run Dry Run Verification

Inspect planned file modifications without writing:

```bash
# Preview a patch bump
npm run update-version -- patch --dry-run

# Or preview an explicit target version
npm run update-version -- 2.1.0 --dry-run
```

### 3. Execute Version Synchronization

Execute the synchronization script via CLI arguments directly (no `.env` file modification required):

```bash
# Convenience bump scripts
npm run update-version:patch
npm run update-version:minor
npm run update-version:major

# Or explicit version with optional custom changelog prefix and decision rationale
npm run update-version -- 2.1.0 -m "Custom release notes" -d "Approved Stage release"
```

_Note on Automated Changelog Packaging:_ If `-m` / `--changelog` is omitted, the synchronization engine automatically scoops up all staged bullets under `## [Unreleased]` in `CHANGELOG.md` and converts them into the new release body!

### 4. Automated Verification

Run the versioning test suite:

```bash
npm run test:versioning
```

---

## Safety Constraints & Invariants

- **No `.env` Requirement:** Parameters are passed directly via CLI flags or positional arguments (`patch`, `minor`, `major`, `X.Y.Z`).
- **SemVer Strictness:** Target version must be valid Semantic Versioning (`X.Y.Z`) and higher than or equal to current version in `package.json`. Downgrades are rejected unless `--allow-downgrade` is explicitly passed.
- **Authoritative Constants:** Ensures `src/version.ts` matches `package.json` exactly as required by `scripts/package-check.mjs`.
- **Dependency Preservation:** Never replace third-party dependency version numbers, even if they match the package version.
- **Changelog Promotion:** The script moves `Unreleased` content in `CHANGELOG.md` to `## [VERSION] - YYYY-MM-DD` and creates a fresh empty `## [Unreleased]` block.
- **Architectural Memory:** Architectural choices and invariants remain governed exclusively by `docs/adr/`.
- **Atomic Operations:** Uses temporary file writes and rollback on failure.

---

## Verification Checklist

- [ ] Target version calculated or bump type chosen.
- [ ] `package.json` top-level `version` matches target.
- [ ] `package-lock.json` root package version matches target.
- [ ] `src/version.ts` `VERSION` constant matches target.
- [ ] `CHANGELOG.md` contains release header `## [VERSION] - YYYY-MM-DD` with promoted unreleased notes.
- [ ] `npm run test:versioning` passes without errors.
