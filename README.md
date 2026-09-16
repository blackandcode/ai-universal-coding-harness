# AI Universal Coding Harness

![CI](https://github.com/blackandcode/ai-universal-coding-harness/actions/workflows/ci.yml/badge.svg)
![npm](https://img.shields.io/npm/v/ai-universal-coding-harness.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

**One CLI for autonomous, staged software delivery across coding-agent harnesses.**

AI Universal Coding Harness connects an **executor** that plans/codes/tests with a **reviewer** that makes human-like decisions from evidence. It ships with **Cursor + Gemini 3.8 Flash High** as the default executor and **Codex + GPT-6 Astra** as the primary reviewer, with automatic **ReviewerRouter** failover, large-diff routing, and fast permission review—while keeping the harness layer pluggable for future agents.

```text
Stage specs → plan → implement → quality gate → review → one Git commit per stage
```

## Prerequisites

The host machine must have the required agent harness CLIs installed and authenticated on `PATH`:

- **Current implementation**: Requires **Codex CLI** (`codex`) and **Cursor CLI** (`cursor` / Cursor Agent ACP).
- **Pluggable harness adapters**: In later versions, support for other agent harnesses will be added. Support has been developed using modular **harness adapters** (`src/harness/`), making it straightforward to integrate new agent CLIs and protocol runtimes.
- **System requirements**: Requires **Node.js 24.18+** and **Git**.

## Installation

Only npm is supported for installation (installing directly from Git is not supported).

### Global Installation

Install the package globally:

```bash
npm install --global ai-universal-coding-harness
```

### Updating to New Versions

Keep your global installation up to date with the latest releases:

```bash
# Update to the latest published version
npm update --global ai-universal-coding-harness

# Or reinstall the latest version explicitly
npm install --global ai-universal-coding-harness@latest

# Verify the installed version
ai-harness --version
```

## Quick start

```bash
# Navigate to your target Git repository
cd /path/to/your/repository

# Initialize the local .ai-orchestrator/ workspace without touching tracked project files
ai-harness init

# Validate stage specifications and prompt contracts before running
ai-harness validate \
  --stage-source docs/specifications/my-feature \
  --stage 06

# Run preflight checks to verify Git working tree cleanliness, tools, and harness availability
ai-harness preflight \
  --stage-source docs/specifications/my-feature \
  --stage 06

# Execute stages sequentially on a dedicated AI branch and create approved stage commits
ai-harness run \
  --stage-source docs/specifications/my-feature \
  --stage 06 \
  --stage 07
```

### Inspecting and Managing Runs

```bash
# Display the current run progress, stage phases, active locks, and review verdicts
ai-harness status

# Stream live execution logs and semantic agent events from the active run
ai-harness tail

# Reset local run history and runtime artifacts while preserving configuration
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

## Resume and Recovery

`ai-harness` persists all run metadata, stage phases, and evidence under `.ai-orchestrator/`, allowing interrupted or stalled workflows to safely pick up where they left off without repeating completed work.

### Resuming a Run

To resume execution after an interruption, network issue, or review pause:

```bash
# Automatically resume the latest active or interrupted run
ai-harness resume

# Or resume a specific run by its run ID
ai-harness resume --run <run-id>
```

- **Phase re-entry**: The engine tracks five stage phases (`plan`, `implementation`, `quality`, `review`, and `commit`). Resuming re-enters execution at the last valid phase rather than restarting from scratch.
- **Smart artifact reuse**: If stage specifications have not changed, the approved plan is reused. If workspace edits match corroborated evidence, implementation is skipped and the run proceeds directly to review.
- **Native harness session continuation**: Harness session identifiers and conversation epochs are persisted so executor sessions continue without losing context.

### Recovery from Inconsistent States

If a process was terminated abruptly or halted due to external dependency issues:

```bash
# Preview proposed state corrections without modifying state or Git
ai-harness recover --dry-run

# Apply state repair with automatic timestamped backup creation
ai-harness recover --apply
```

For deeper architectural details and state flow diagrams, see [docs/state-and-resume.md](docs/state-and-resume.md).

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

Current version: **2.1.7**. See [CHANGELOG.md](CHANGELOG.md).

## License

MIT
