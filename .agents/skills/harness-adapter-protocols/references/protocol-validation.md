# Protocol validation and semantic normalization

TypeScript interfaces describe expected shapes but do not validate provider JSON/text.

Validate or parse:

- structured reviewer decisions (`APPROVE`/`REWORK` plus required detail);
- executor evidence/result envelopes;
- permission requests;
- blocking questions;
- provider tool/event fields used for command corroboration;
- external plugin registration metadata when data-shaped.

## Semantic layer

Normalize provider-specific transport into harness-owned concepts such as:

- session started/resumed;
- tool started/updated/completed;
- command observed/completed;
- permission requested;
- question raised;
- plan/result available;
- provider diagnostic.

The semantic model should preserve enough identifiers to correlate raw events without copying the full provider schema through the application.

## Fail closed

Unknown/malformed decision text must not default to approval. Unknown command completion must not default to exit code zero. Missing evidence must remain missing.
