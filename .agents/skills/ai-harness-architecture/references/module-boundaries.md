# Module ownership and dependency boundaries

Current conceptual modules:

```text
src/
  core/          configuration, paths, filesystem, processes
  git/           branch/repository lifecycle and Git mechanical truth
  harness/       executor/reviewer adapters and registry
  orchestrator/  stage/run coordination and phase state machine
  permissions/   deterministic permission policy
  project/       init and local project/history lifecycle
  quality/       evidence corroboration and quality truth model
  stages/        stage-source resolution, validation, frozen inputs, planning coordination
  state/         durable run state, locks, hashes/fingerprints
  ui/            semantic event rendering with Ink
```

## Ownership rules

### `orchestrator/`

May coordinate other modules. Must not absorb provider stream parsing, generic shell execution, Git command implementation, or Ink rendering.

### `harness/`

Owns product-specific protocols, sessions, streaming normalization, provider capability differences, and adapter preflight. Emits harness-owned normalized results/events.

### `quality/`

Owns distinction between claims, observed execution, exit/result state, patch fingerprint, and independent mechanical checks. Must remain provider-neutral.

### `git/`

Owns Git command mechanics and repository-specific deterministic checks such as diff hygiene. Do not duplicate Git subprocess logic across orchestrator/stages/quality.

### `state/`

Owns durable storage primitives, lock mechanics, serialization/versioning, and safe read/write. Business decisions about which phase comes next belong to orchestration.

### `permissions/`

Owns operation classification and policy. Adapters do not invent their own safety model.

### `ui/`

Renders semantic events/state. UI code may derive presentation state but must not become required for core correctness.

## Dependency guidance

- Prefer imports through a module's public surface rather than deep internal paths.
- Avoid cycles between top-level conceptual modules.
- Types are dependencies too: provider SDK/ACP types should not become core/orchestrator types.
- A module may expose a narrow capability interface rather than a grab-bag utility object.
- Shared helpers belong in `core/` only when they are genuinely infrastructure-neutral and reused; do not make `core/` a miscellaneous dumping ground.
