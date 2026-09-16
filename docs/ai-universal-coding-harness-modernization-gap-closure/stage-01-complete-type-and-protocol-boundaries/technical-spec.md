# Technical Specification — Stage 01

## Primary files

Expected touch points:

```text
src/harness/types.ts
src/harness/cursor/types.ts
src/harness/cursor/AcpEventNormalizer.ts
src/harness/cursor/AcpToolAccumulator.ts
src/harness/cursor/CursorExecutorHarness.ts
src/harness/codex/types.ts
src/harness/codex/CodexEventParser.ts
src/harness/codex/CodexReviewerHarness.ts
src/harness/codex/CodexResultParser.ts
src/orchestrator/Orchestrator.ts
src/orchestrator/services/ReviewerRouter.ts
src/quality/EvidenceVerifier.ts
src/orchestrator/RecoveryManager.ts
.oxlintrc.json
tests/harness/**
tests/orchestrator/**
tests/quality/**
```

## Boundary design

### JSON parsing

Every external JSON parse should produce `unknown` first.

Use helpers such as:

```ts
function isRecord(value: unknown): value is Record<string, unknown>
function readString(record: Record<string, unknown>, key: string): string | undefined
function readNumber(...): number | undefined
```

Avoid `JSON.parse(...) as SomeDomainType` when the result affects workflow decisions.

### JSON-RPC transport

Model pending requests instead of `Map<number, any>`.

Example direction:

```ts
interface PendingRpcRequest<T = unknown> {
  method: string;
  timer: NodeJS.Timeout;
  resolve(value: T): void;
  reject(error: Error): void;
}
```

A generic transport may expose `request<TResponse>(...)`, but provider-specific response narrowing must happen before response values become domain objects.

### Child-process/readline fields

Replace broad child/readline `any` fields with Node types:

```text
ChildProcessWithoutNullStreams
readline.Interface
```

Use the actual spawn shape rather than optional-property guessing.

### Harness contexts

`CursorExecutorHarness` and `CodexReviewerHarness` constructors should accept `HarnessContext` or a narrower derived context, not `any`.

If a reviewer role needs `thinking`, `timeoutMinutes`, or `timeoutSeconds`, add these to an explicit role context/type rather than casting the context to records repeatedly.

**Stage 04 boundary:** fields on role context here are **type surface only**. Runtime precedence (`reviewer.<role>` over `harnesses.<adapter>`) and Codex field application (`verbosity`, `contextMode`, etc.) are **Stage 04 (F-13)**.

### Review inputs

Use the existing:

```text
PlanReviewInput
QuestionReviewInput
PermissionReviewInput
FinalReviewInput
```

through adapters and Orchestrator. Remove `payload as any` at call sites.

## Shared ACP replay

`parseAcpEvents()` should no longer manually duplicate the relevant `session/update` shape logic.

Preferred pattern:

```text
raw persisted SERVER line
  -> parse JSON as unknown
  -> shared ACP decoder
  -> feed typed update to accumulator/normalizer in replay mode
  -> journal observation
```

Interactive requests (plan/question/permission) may be ignored in replay mode.

## Tests

Add/adjust tests for:

1. malformed JSON-RPC messages;
2. non-object JSON values;
3. response id with malformed result/error;
4. unknown ACP notification type;
5. malformed tool update fields;
6. live/replay equivalence from the same fixture;
7. session-load/new response narrowing;
8. Codex malformed event shapes;
9. external harness module type compatibility;
10. no regression in Stage 07 ACP fixture.

## Static gate

Add a deterministic repository assertion that production source has no explicit `any` constructs, either through Oxlint severity or an additional invariant test.

Do not rely only on `strict: true`; explicit `any` bypasses strictness by design.
