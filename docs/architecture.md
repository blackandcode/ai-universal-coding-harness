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
  Engine --> Router[ReviewerRouter]
  Router --> ReviewAdapters[Primary / largeDiff / permission / fallback harnesses]
  ReviewAdapters -->|decisions only| Engine
  Exec --> Evidence[Execution evidence]
  Evidence --> Verify[Mechanical evidence verifier]
  Verify --> Payload[ReviewPayloadBuilder bounds diff + metrics]
  Payload --> Router
  Router -->|APPROVE| Commit[One stage-named Git commit]
  Router -->|REWORK| Exec
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

The orchestration engine depends on harness interfaces, not Cursor/Codex implementations. The default registry provides `cursor` (executor and reviewer) and `codex` (reviewer). Review dispatch, failover, and diff bounding live in `src/orchestrator/services/` (`ReviewerRouter`, `ReviewPayloadBuilder`); adapters remain unaware of Git lifecycle.

## Reviewer dispatch and failover

```mermaid
flowchart TD
  Orch[Orchestrator review phase] --> Builder[ReviewPayloadBuilder]
  Builder --> Router[ReviewerRouter]
  Router --> Role{Role dispatch}
  Role -->|plan / questions| Primary[primary Codex]
  Role -->|permission| Perm[permission Cursor fast model]
  Role -->|final review| Size{diff length}
  Size -->|above threshold| Large[largeDiff Cursor]
  Size -->|within threshold| Primary
  Primary -->|classified failure| Classifier[ReviewerErrorClassifier]
  Large -->|classified failure| Classifier
  Classifier -->|trigger enabled| Fallback[fallback Cursor]
  Classifier -->|no failover| Error[external_dependency or retryable_error]
  Fallback --> Verdict[Verdict + optional _orchestrator_meta]
```

Orchestration state (phase, attempt, fingerprints) stays in the engine; harness adapters only run provider-specific subprocesses and return structured verdicts.

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
