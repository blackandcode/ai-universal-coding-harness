# Changelog

All notable changes to this project are documented here. The project follows Semantic Versioning.

## [Unreleased]

### Added

- Placeholder for future changes.

## [1.0.0] - 2026-09-15

### Added

- Standalone cross-platform TypeScript/Node.js CLI package.
- Canonical project/repository/npm identity: `ai-universal-coding-harness` at `blackandcode/ai-universal-coding-harness`.
- Git-like `ai-harness init` command creating a local `.ai-orchestrator/` workspace with placeholder config and permission files.
- Project run-history commands: `runs list`, `runs delete`, and `runs reset`.
- `.ai-orchestrator/stage-input/` and `.ai-orchestrator/stage-runtime/` consolidate all harness-local state under one folder.
- Explicit `validate` command and mandatory structural stage validation before branch creation/implementation.
- Secure npm Trusted Publishing workflow using GitHub Actions OIDC with no long-lived npm publish token.
- npm/GitHub publishing documentation including the one-time first-publish bootstrap requirement and post-OIDC token hardening.
- `ai-harness` and `ai-universal-coding-harness` command entrypoints.
- Pluggable executor/reviewer harness architecture.
- Cursor ACP executor adapter with Gemini 3.8 Flash High defaults.
- Codex reviewer adapter with GPT-6 Astra defaults and structured schema decisions.
- Structured stage sources from directories or ZIP archives.
- Explicit stage selection and ambiguity protection across multi-feature stage sources.
- One dedicated AI branch per run and one exact stage-named commit per approved stage.
- Human-readable run artifacts: plans, plan reviews, decisions, execution evidence, and final reviews.
- Stable Ink terminal dashboard, focus/todos/changed-files/log panels, and semantic event stream.
- Autonomous permission modes: `auto_safe`, `allow_all`, `allowlist`, and `ask_reviewer`.
- Reviewer brokerage for executor questions and uncertain permission requests.
- Plan review with three normal passes plus one graceful final consolidation; review limits never block execution by themselves.
- Approved-plan reuse, persisted executor sessions, phase-level resume state, repository locking, and branch/stash recovery.
- Mechanical corroboration of executor quality evidence against observed command results before reviewer approval.
- Global user configuration, tracked project configuration, local project overrides, and configuration inspection/init commands.
- Cross-platform Node ZIP extraction and platform-native approved-command fallback execution.
- Shared `AGENTS.md` and `.agents/skills` plus Cursor project rules for maintaining the repository.
- GitHub CI configuration for Linux, Windows, and macOS.

### Changed

- Converted the original embedded orchestrator prototype into the independent `ai-universal-coding-harness` public repository and npm package.
- Removed Git worktree architecture in favor of a single dedicated branch in the target checkout.
- Removed redundant mandatory Codex planning; stage specifications remain canonical, with Cursor producing the implementation plan and Codex reviewing it.
- Moved model/binary/timing defaults into harness adapters instead of hardcoding them in generic orchestration logic.
- Generalized runtime events from Cursor/Codex names to executor/reviewer semantics.
- Replaced raw ACP console noise with a stateful human-oriented Ink UI while retaining raw diagnostic logs.
- Replaced shell scripts with Node package commands and CLI entrypoints.

### Fixed

- Permission decision budgets can no longer block a stage mid-implementation.
- Repeated identical plan feedback is detected instead of wasting reviewer calls indefinitely.
- Plan review exhaustion gracefully continues with consolidated carry-over findings.
- Approved plans are reused only when plan/spec hashes remain valid.
- Workspace-scoped permission checks prevent automatic edits outside the target repository.
- Dirty developer work is preserved before switching to an AI branch.
- Concurrent runs against one repository are rejected by an atomic run lock.
- Quality evidence mismatches are rejected before final reviewer approval.
- Terminal layout height is bounded to prevent Ink scrolling/jitter.
- Full executor focus/progress is persisted instead of being permanently truncated.
