---
name: project-workspace
description: Use when changing project initialization, .ai-orchestrator local state, run history cleanup, stage input/runtime layout, configuration precedence, or repository locking.
---

# Project Workspace

- `ai-harness init` must remain safe and idempotent.
- Keep all local runtime files under `.ai-orchestrator/`.
- Add `.ai-orchestrator/` through `.git/info/exclude`; do not force tracked `.gitignore` changes in target projects.
- Preserve local config and permission files when resetting run history.
- Never delete history while a live run lock is owned by another process.
- Keep frozen stage input separate from mutable runtime evidence.
- Cross-platform paths must use Node `path` APIs.
