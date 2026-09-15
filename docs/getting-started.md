# Getting Started

## Prerequisites

- Node.js 24.18 or newer
- Git
- the executor/reviewer CLIs selected in configuration
- a Git repository as the target project

Default harnesses are Cursor (`agent`) as executor and Codex (`codex`) as reviewer.

## Install

```bash
npm install --global ai-universal-coding-harness
```

## Initialize a project

```bash
cd /path/to/repository
ai-harness init
```

This creates the local `.ai-orchestrator/` workspace and adds it to `.git/info/exclude` without modifying the repository's tracked `.gitignore`.

## Validate stage specifications

```bash
ai-harness validate \
  --stage-source docs/specifications/my-feature \
  --stage 06
```

Validation happens again automatically before `run`. No AI branch is created until every explicitly selected stage passes validation.

## Check harnesses

```bash
ai-harness preflight \
  --stage-source docs/specifications/my-feature \
  --stage 06
```

## Run

```bash
ai-harness run \
  --stage-source docs/specifications/my-feature \
  --stage 06 \
  --stage 07
```

The run uses one dedicated AI branch. Each approved stage becomes one commit named after the stage folder. The CLI never pushes or merges.

## Resume

```bash
ai-harness status
ai-harness tail
ai-harness resume
```
