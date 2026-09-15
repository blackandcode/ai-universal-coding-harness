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

## Permission denied

A denied operation should not automatically end the stage. The executor is instructed to choose another safe approach. See [Permissions](permissions.md).

## Plan review keeps finding improvements

The configured normal review budget is followed by one final consolidation review. Remaining findings are carried into implementation; the review budget itself does not block the stage.
