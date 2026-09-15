# Project Workspace

`ai-harness init` creates one local workspace inside the target repository:

```text
.ai-orchestrator/
├── README.md
├── config.jsonc
├── permissions.jsonc
├── orchestrator.lock          # while a run owns the repository
├── latest-run                 # after the first run
├── runs/
│   └── <run-id>/
│       ├── run.json
│       ├── RUN.md
│       ├── input/stages/
│       └── stages/<stage>/
├── stage-input/               # read-only frozen inputs for active execution
└── stage-runtime/             # executor evidence/runtime files
```

The whole directory is added to `.git/info/exclude`, so initializing the harness does not create a tracked project change.

## Local configuration

`.ai-orchestrator/config.jsonc` is created as an empty JSONC object with commented examples. Omitted fields inherit package/global defaults.

`.ai-orchestrator/permissions.jsonc` is also created with narrow placeholder allow/deny lists.

## History management

List runs:

```bash
ai-harness runs list
```

Delete one run:

```bash
ai-harness runs delete --run <run-id> --force
```

Reset all local run history/runtime data while keeping configuration:

```bash
ai-harness runs reset --force
```

The reset preserves:

```text
.ai-orchestrator/config.jsonc
.ai-orchestrator/permissions.jsonc
.ai-orchestrator/README.md
```

It removes run history, frozen stage inputs, runtime evidence, preflight logs, and `latest-run`. It does **not** delete AI Git branches or commits; Git history remains available for retrospectives.

## Concurrency

Only one orchestrator run may own a target repository at a time. `orchestrator.lock` contains the current PID/run metadata, and destructive history cleanup refuses to proceed while a live run holds the lock.
