# Technical Specification — Stage 03

## Boundary typing

All protocol input starts as `unknown`.

Create narrow validators/helpers rather than deep optional chaining on `any`.

Examples of internal normalized models:

```ts
interface NormalizedToolUpdate {
  sessionId: string;
  toolCallId: string;
  title?: string;
  kind?: string;
  status: ToolStatus;
  rawInput?: unknown;
  rawOutput?: unknown;
}

interface CommandObservation {
  source: 'acp' | 'broker' | 'replay';
  sessionId: string;
  toolCallId: string;
  sequence: number;
  command: string;
  commandConfidence: 'high' | 'medium' | 'low';
  status: ToolStatus;
  exitCode: number | null;
}
```

Do not leak Cursor wire structures into the orchestrator.

## Observation durability

Persist normalized observations per attempt when needed for crash/recovery.

Replay is a recovery path, not an excuse to accept arbitrary historical success.

## Quality epoch

Record a quality epoch boundary.

Evidence must be rejected when:

```text
quality PASS
then repository mutation
then evidence
```

The executor must rerun quality after any later mutation.

## Command matching

Prefer exact normalized logical command matching.

Support known wrappers where needed:

- `sh -c`
- `bash -c` / `bash -lc`
- `cmd /c`
- PowerShell/pwsh command wrapper

Do not use substring matching that makes this pass:

```text
echo "npm run check"
```

## Codex adapter

Separate:

- prompt construction;
- subprocess invocation;
- JSONL event parsing;
- output-schema result parsing;
- token accounting;
- role-boundary violation detection.

Use typed reviewer result variants.

## Orchestrator

Keep `Orchestrator` small.

Move domain logic into services:

- plan service/coordinator;
- evidence service;
- recovery service;
- stage execution service if necessary.

The orchestrator coordinates; it should not parse ACP or reviewer wire data.

## Tests required

### Cursor

- multi-chunk accumulation;
- command retained when completion omits input;
- empty update does not erase state;
- all supported exit-code keys;
- completed without exit remains unknown;
- failed without exit remains failure;
- duplicate replay deduplication;
- session-ID collision protection;
- real sanitized Stage 07 fixture.

### Evidence

- current attempt pass;
- old attempt pass rejected;
- pass followed by edit rejected;
- latest fail beats earlier pass;
- patch fingerprint mismatch;
- untracked change invalidates fingerprint;
- wrong cwd rejected if cwd is available;
- broker source cannot silently substitute executor quality proof.

### Codex

- valid verdict;
- invalid JSON;
- timeout;
- non-zero exit;
- role-boundary violation;
- token usage parsing.

### Recovery

- recover to Review;
- recover to Quality;
- stale evidence;
- missing observation journal;
- rebuild from ACP log;
- dry-run does not mutate state.

### Permissions

- modes;
- cache;
- outside-project write;
- dangerous Git command;
- reviewer denial does not end stage;
- many permission requests do not trigger a stage quota.
