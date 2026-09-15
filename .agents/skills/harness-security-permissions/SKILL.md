---
name: harness-security-permissions
description: Design or review AI Harness security boundaries, command permissions, subprocess execution, stage ZIP/path/symlink handling, provider/plugin trust, secret-safe logging, and hard-dangerous operation denial. Use when changing permission modes/allowlists, executing commands, reading/extracting stage sources, loading external modules, handling environment variables/secrets, or accepting agent/provider-controlled strings. Treat security-sensitive ambiguity as fail-closed.
compatibility: AI Universal Coding Harness; Node.js 24.18+; TypeScript 7.x.
metadata:
  role: security-safety
---

# Harness Security and Permissions

The harness coordinates agents capable of executing powerful commands. Defense in depth is a product requirement, not an optional hardening pass.

Read:

- `references/permission-policy.md`
- `references/command-execution.md`
- `references/path-zip-symlink-safety.md`
- `references/secrets-and-logs.md`
- `references/plugin-trust.md`

## Trust boundaries

Treat as untrusted until validated/classified:

- stage ZIP/directory contents;
- target-repository paths/files;
- agent/provider text and structured output;
- command/tool requests;
- external plugin configuration/metadata;
- environment-derived data;
- persisted state that may be old/corrupt.

## Safety invariants

- hard-dangerous operations remain denied regardless of reviewer willingness;
- permission decisions are operation-scoped;
- default allowlists stay narrow;
- broad executors (`git`, `npm`, `node`, `python`, `docker`, `curl`, `gh`, shells) are not blanket-safe merely because the binary name is familiar;
- Git branch/commit lifecycle remains orchestrator-owned;
- telemetry bugs never become permission bypasses.
