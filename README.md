# AI Universal Coding Harness

![CI](https://github.com/blackandcode/ai-universal-coding-harness/actions/workflows/ci.yml/badge.svg)
![npm](https://img.shields.io/npm/v/ai-universal-coding-harness.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

**One CLI for autonomous, staged software delivery across coding-agent harnesses.**

AI Universal Coding Harness connects an **executor** that plans/codes/tests with a **reviewer** that makes human-like decisions from evidence. It ships with **Cursor + Gemini 3.8 Flash High** as the default executor and **Codex + GPT-6 Astra** as the primary reviewer, with automatic **ReviewerRouter** failover, large-diff routing, and fast permission review—while keeping the harness layer pluggable for future agents.

```text
Stage specs → plan → implement → quality gate → review → one Git commit per stage
```

## Install

```bash
npm install --global ai-universal-coding-harness
```

Or directly from GitHub:

```bash
npm install --global git+https://github.com/blackandcode/ai-universal-coding-harness.git
```

Requires **Node.js 24.18+**, Git, and the configured harness CLIs.

## Quick start

```bash
cd /path/to/your/repository

ai-harness init

ai-harness validate \
  --stage-source docs/specifications/my-feature \
  --stage 06

ai-harness preflight \
  --stage-source docs/specifications/my-feature \
  --stage 06

ai-harness run \
  --stage-source docs/specifications/my-feature \
  --stage 06 \
  --stage 07
```

Resume or inspect:

```bash
ai-harness status
ai-harness tail
ai-harness resume
```

Clear local run history while keeping project configuration:

```bash
ai-harness runs reset --force
```

## Stage contract

```text
stage-NN-kebab-name/
├── functional-spec.md
├── technical-spec.md
└── prompt.md
```

The CLI validates the selected stages **before** creating the AI branch or starting implementation.

## Project workspace

`ai-harness init` creates a local, Git-excluded workspace:

```text
.ai-orchestrator/
├── config.jsonc
├── permissions.jsonc
├── runs/
├── stage-input/
└── stage-runtime/
```

Global defaults, tracked project overrides, and local overrides are supported.

## Development and Quality

The repository requires Node.js 24.18+ (specified in `.nvmrc`) and TypeScript 7. Formatting is managed by Oxfmt, and linting is managed by Oxlint.

```bash
npm run format:check   # Oxfmt formatting check
npm run lint           # Oxlint code analysis
npm run typecheck      # TypeScript compilation check
npm test               # Run all unit tests
npm run test:coverage  # Run tests with experimental coverage
npm run test:cli       # CLI smoke verification
npm run verify         # Comprehensive verification gate
npm run check          # Alias for verify
```

## Why

- Harness-neutral TypeScript architecture.
- Autonomous permissions and question routing, including a dedicated fast permission reviewer role.
- Multi-tier reviewer routing with configurable fallback triggers and diff context bounding.
- Stable Ink terminal UI plus raw audit logs.
- Human-readable plans, decisions, execution evidence, and reviews.
- One dedicated AI branch per run.
- One stage-named Git commit per approved stage.
- No automatic push or merge.
- Cross-platform: Linux, macOS, Windows, and WSL.

## Documentation

Start with [docs/README.md](docs/README.md).

- [Getting started](docs/getting-started.md)
- [CLI reference](docs/cli.md)
- [Project workspace](docs/project-workspace.md)
- [Stage contract](docs/stage-contract.md)
- [Configuration](docs/configuration.md)
- [Architecture](docs/architecture.md)
- [Harness adapters](docs/harnesses.md)
- [Permissions](docs/permissions.md)
- [State and resume](docs/state-and-resume.md)
- [Publishing to npm with OIDC](docs/publishing.md)

## Release

Current version: **2.1.4**. See [CHANGELOG.md](CHANGELOG.md).

## License

MIT
