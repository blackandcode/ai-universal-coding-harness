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

## Reviewer quota, rate limits, or crashes

Symptoms: run stops during plan or final review; Codex messages about usage or credits; non-zero exit without `result.json`.

1. Check `ai-harness status` for `external_dependency` or `retryable_error`.
2. Tail the run UI or open `ui-events.jsonl` and search for `reviewer.fallback` to confirm automatic failover.
3. Adjust `reviewer.fallback` in config (enable/disable, triggers, fallback harness/model). See [Configuration](configuration.md).
4. After resolving provider limits, run `ai-harness resume`.

Persisted review JSON under `runs/<run-id>/stages/<stage>/` may include `_orchestrator_meta` when a verdict was produced by the fallback reviewer.

## Truncated diff or NEEDS_CONTEXT verdict

When the unified diff exceeds `maxDiffChars`, `ReviewPayloadBuilder` truncates the body but still sends `diff_stat` and `changed_files`. If the reviewer returns `NEEDS_CONTEXT` with `requested_paths`, the orchestrator automatically rebuilds the payload with those paths prioritized and re-runs final review once.

To reduce truncation, raise `maxDiffChars` in project config or narrow the stage scope. For very large patches, ensure `reviewer.largeDiff` uses a high-context model (defaults route to Cursor when diff length exceeds `thresholdChars`).

## Plan review keeps finding improvements

The configured normal review budget is followed by one final consolidation review. Remaining findings are carried into implementation; the review budget itself does not block the stage.
