# Troubleshooting

## Find effective configuration

```bash
ai-harness config paths
ai-harness config show
```

## Harness preflight

```bash
ai-harness doctor
```

or validate a real stage source:

```bash
ai-harness preflight --stage-source docs/specifications/my-feature --stage 06
```

## Run interrupted

```bash
ai-harness status
ai-harness resume
```

The AI branch is intentionally preserved. The orchestrator never automatically pushes or merges it.

## Corroboration or evidence failure

If an interrupted run dropped tool observations or stalled prior to final review:

```bash
# Preview recovery actions safely (dry-run)
ai-harness recover

# Apply recovery, reconstruct tool observations, and corroborate evidence
ai-harness recover --apply

# Resume the run to complete evaluation and commit
ai-harness resume
```

## Permission denied

A denied operation should not automatically end the stage. The executor is instructed to choose another safe approach. See [Permissions](permissions.md).

## Plan review keeps finding improvements

The configured normal review budget is followed by one final consolidation review. Remaining findings are carried into implementation; the review budget itself does not block the stage.
