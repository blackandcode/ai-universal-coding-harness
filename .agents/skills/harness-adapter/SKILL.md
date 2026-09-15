---
name: harness-adapter
description: Use when adding or modifying executor/reviewer harness adapters, model settings, ACP/CLI protocol handling, working-directory behavior, or harness registration.
---

# Harness Adapter Development

- Implement the interfaces in `src/harness/types.ts`.
- Keep adapter defaults inside the adapter and expose overrides under `harnesses.<id>` config.
- Run the harness in the target project directory when native project context is part of the configured behavior.
- Keep repository mutation policy in the orchestrator/permission layers, not in reviewer adapters.
- Emit generic `executor.*` / `reviewer.*` semantic events rather than product-specific event names.
- Add preflight diagnostics and adapter-specific tests.
