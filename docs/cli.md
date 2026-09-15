# CLI Reference

The primary executable is `ai-harness`. `ai-universal-coding-harness` is an equivalent long-form alias.

## Project lifecycle

```bash
ai-harness init
ai-harness doctor
ai-harness preflight --stage-source <dir|zip> --stage 06
```

`init` requires a Git repository and creates `.ai-orchestrator/`.

## Stage discovery and validation

```bash
ai-harness list-stages --stage-source <dir|zip> [--feature token]
ai-harness inspect --stage-source <dir|zip> --stage 06
ai-harness validate --stage-source <dir|zip> [--stage 06 ...]
```

## Execute

```bash
ai-harness run \
  --stage-source docs/specifications/apps/my-feature \
  --stage 06 \
  --stage 07
```

Useful options:

```text
--project <path>             target another Git repository
--feature <token>            disambiguate stage folders in broad sources
--branch <name>              explicit AI branch name
--base <ref>                 branch base ref
--quality-cmd <command>      override deterministic quality command
--executor-harness <id>      select executor adapter
--reviewer-harness <id>      select reviewer adapter
--ui compact|line|raw        output mode
```

## Resume and inspect

```bash
ai-harness resume [--run <run-id>]
ai-harness recover [--run <run-id>] [--stage <stage>] [--dry-run] [--apply]
ai-harness status [--run <run-id>]
ai-harness tail [--run <run-id>]
```

`ai-harness recover` allows recovering stalled runs where quality checks completed in ACP logs without modifying state files by hand. Run with `--dry-run` (default) to inspect changes, or `--apply` to update state and create atomic backups.

## Run history

```bash
ai-harness runs list
ai-harness runs delete --run <run-id> --force
ai-harness runs reset --force
```

History deletion never deletes project/global configuration.

## Configuration

```bash
ai-harness config paths
ai-harness config show
ai-harness config init --global
ai-harness config init --project
ai-harness config init --local
```

## UI shortcuts

```text
f  full executor focus stream
t  todos
d  changed files
l  logs
q  quiet/minimal view
Esc return to main panel
```
