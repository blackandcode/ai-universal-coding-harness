# Functional Specification — Stage 01: Complete Type and Protocol Boundaries

## Objective

Finish the strict-TypeScript and adapter-boundary work that was intended in modernization Stages 02–03 but remains incomplete in 2.1.2.

This stage is a refactor/hardening stage. It must not intentionally change user-visible workflow behavior.

## Required outcomes

### 1. Remove production explicit `any`

Production `src/**` must not use broad explicit `any` for domain, protocol, orchestration, reviewer, or evidence data.

Untrusted inputs must enter as `unknown` and be narrowed.

Target areas include:

- Cursor ACP transport/messages;
- ACP normalizer callbacks;
- pending JSON-RPC requests;
- Cursor capabilities/session results;
- Codex reviewer context and review inputs;
- Codex event parsing;
- Orchestrator reviewer context/cache/payloads;
- evidence verifier temporary values;
- recovery error handling.

`unknown`, discriminated unions, narrow interfaces and runtime guards are preferred over generic casts.

### 2. Make protocol boundaries explicit

Introduce explicit protocol-domain contracts for the subset of ACP/JSON-RPC actually consumed by the harness.

Do not attempt to model the entire provider protocol. Model only what the application reads.

Examples:

```text
JsonRpcId
JsonRpcRequest
JsonRpcResponse
JsonRpcNotification
AcpSessionUpdate
AcpToolUpdate
AcpPlanRequest
AcpQuestionRequest
AcpPermissionRequest
CursorSessionCapabilities
PendingRpcRequest<T>
```

### 3. Share one decode/normalize path for live and replay

Historical ACP replay must not maintain a second ad-hoc interpretation of tool updates.

Live stream and replay should share the same:

```text
unknown JSON
  -> JSON-RPC/ACP decoder
  -> normalized ACP event/tool update
  -> accumulator
  -> observation
```

Replay may suppress side effects/UI callbacks, but protocol interpretation must be shared.

### 4. Reduce `CursorAcpSession` responsibility

Keep behavior stable while separating at least transport mechanics from semantic handlers.

A reasonable target is:

```text
CursorExecutorHarness
  -> creates session

CursorAcpTransport
  -> child process
  -> JSON-RPC ids/pending requests
  -> timeout/cancel
  -> raw line IO

AcpEventDecoder / AcpEventNormalizer
  -> unknown wire payload to typed semantic data

CursorAcpSession
  -> session lifecycle
  -> plan/question/permission callbacks
  -> observation access
```

Exact names may differ.

### 5. Harden lint after migration

Once production `any` is removed, change `typescript/no-explicit-any` from warning to error for production TypeScript.

Tests may use narrowly justified test-double casts where unavoidable, but production code must remain clean.

## Non-goals

- No workflow redesign.
- No change to one-run/one-branch semantics.
- No change to permission policy.
- No change to reviewer authority.
- No new runtime validation library unless there is a demonstrated benefit over small local guards.
- Do not combine Stage 02 evidence/recovery changes here except where typing is required to enable them.
- Do not enforce `maxUniqueQuestionsPerStage`, apply `reviewer.<role>` overrides to Codex/Cursor runtime behavior, add config contract tests, or update `config.example.jsonc` / `docs/configuration.md` precedence — **owned by Stage 04 (F-12–F-14)**. Stage 01 may add typed fields on `HarnessContext` only where needed for typing, not behavioral wiring.

## Acceptance criteria

- No production explicit `any` constructs in `src/**`.
- Oxlint fails on new production explicit `any`.
- Cursor live parsing and ACP replay use the same decoder/normalizer primitives.
- ACP regression behavior remains unchanged.
- External harness registry behavior remains backward compatible.
- `npm run check:changed` is green while iterating.
- `npm run verify` is green at stage completion.
