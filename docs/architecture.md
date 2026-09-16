# Architecture

## System overview

```mermaid
flowchart TD
  Human[Human / CI] --> CLI[ai-harness CLI]
  CLI --> Project[Target Git repository]
  CLI --> Workspace[.ai-orchestrator local workspace]
  Workspace --> Specs[Frozen validated stage specs]
  Specs --> Engine[Harness-neutral orchestration engine]
  Engine --> Exec[Executor Harness]
  Exec -->|plan / code / tests / quality| Project
  Exec -->|questions / permissions| Engine
  Engine --> Review[Reviewer Harness]
  Review -->|decisions only| Engine
  Exec --> Evidence[Execution evidence]
  Evidence --> Verify[Mechanical evidence verifier]
  Verify --> Review
  Review -->|APPROVE| Commit[One stage-named Git commit]
  Review -->|REWORK| Exec
  Commit --> Next[Next explicitly selected stage]
```

## Repository-local lifecycle

```mermaid
flowchart LR
  Install[Install global npm CLI] --> Init[ai-harness init]
  Init --> Local[.ai-orchestrator]
  Local --> Validate[Validate selected stage packages]
  Validate --> Preflight[Harness preflight]
  Preflight --> Branch[Create dedicated AI branch]
  Branch --> Stages[Execute selected stages]
  Stages --> History[Human + machine run history]
  History --> HumanMerge[Human reviews/tests/merges]
```

No AI branch is created until selected stage packages have passed structural validation.

## Package modules

```text
src/
├── cli/           pure CLI argument parsing and dispatching
├── config/        configuration layers, paths, schema, normalization
├── core/          paths, filesystem, process execution, time
├── git/           branch and repository lifecycle
├── harness/       pluggable executor/reviewer adapters
├── orchestrator/  stage state machine and recovery
├── permissions/   autonomous permission classification and policy
├── project/       project init and local history lifecycle
├── quality/       execution evidence verification
├── stages/        source resolution, validation and plan coordination
├── state/         run persistence and repository lock
├── tooling/       package invariants and build tooling
└── ui/            semantic events and Ink presentation
```

The orchestration engine depends on harness interfaces, not Cursor/Codex implementations. The default registry currently provides `cursor` and `codex`.

## Target project context

The CLI resolves the target Git repository before loading the orchestration engine. Harness subprocesses receive that repository as their working directory when their adapter context policy requires project access.

That allows agent CLIs to discover repository-local instructions and capabilities naturally:

```text
AGENTS.md
.agents/skills/
.cursor/rules/
.cursor/skills/
MCP/tool configuration
repository files and tests
```

The global harness package does not copy its own development rules into target projects.

## Configuration layers

```mermaid
flowchart TD
  CLIArgs[CLI arguments] --> Effective[Effective config]
  Env[AI_HARNESS_* environment] --> Effective
  Local[.ai-orchestrator/config.jsonc] --> Effective
  Tracked[.ai-universal-coding-harness.jsonc] --> Effective
  Global[User profile config] --> Effective
  Defaults[Package defaults] --> Effective
```

Higher layers override lower layers.
