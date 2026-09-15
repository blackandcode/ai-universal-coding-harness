# Evidence corroboration

Truth hierarchy:

1. agent prose alone — claim only;
2. structured `evidence.json` — structured claim;
3. observed provider/tool command telemetry and exit state — execution observation;
4. independent Git/repository mechanical checks — independent observation;
5. patch fingerprint — binds evidence to current work.

Only sufficient, green, corroborated evidence proceeds to semantic implementation review.

## Corroboration responsibilities

The verifier should compare claimed required checks with normalized observed commands/results and current patch identity. It should tolerate harmless wrappers/quoting/compound commands without accepting substring accidents.

Examples that may be semantically equivalent only after safe parsing/normalization:

- `npm run verify`
- shell wrapper invoking exactly `npm run verify`
- compound command where the required command is an independently identifiable component.

## Diagnostics

On failure, show the expected checks and useful recent observed command identities/status/exit information. “Quality failed” without evidence is insufficient for debugging.

## Prohibited fallback

Do not solve missing adapter telemetry by silently having the orchestrator run arbitrary project `quality_cmd` as an unpermissioned fallback. Fix the observation/adaptation path.
