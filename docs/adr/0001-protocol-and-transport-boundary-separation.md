# ADR: Protocol and transport boundary separation

- Status: Accepted
- Date: 2026-09-16

## Context

In AI Universal Coding Harness 2.1.2–2.1.6, the Cursor ACP integration concentrated subprocess management, stdio line handling, JSON-RPC message tracking, protocol decoding, interactive orchestration callbacks, and tool state accumulation inside `CursorAcpSession`. Additionally:

1. **Replay Drift (Finding F-02)**: Historical log replay (`parseAcpEvents()`) implemented an ad-hoc parser for `SERVER` lines in `events.jsonl`, duplicating tool call shape detection rather than reusing the live stream decoder.
2. **Monolithic Transport**: Transport-level concerns (child process lifetime, readline interfaces, pending request maps, cancellation) were entangled with session-level concerns (negotiating model/thinking settings, executing prompt turns, handling plan/question/permission callbacks).
3. **Boundary Integrity (Finding F-01)**: Untrusted wire data entered without complete protocol-level typing and narrowing, leading to broad type assertions and type leaks across adapter boundaries.

The core architecture requires harness neutrality: provider adapters encapsulate provider-specific wire quirks while presenting clean semantic contracts to the orchestrator.

## Decision

We separate Cursor ACP transport, decoding, and session orchestration into dedicated components:

1. **`CursorAcpTransport` (`src/harness/cursor/CursorAcpTransport.ts`)**:
   - Owns child process spawning, stdio stream management, readline line framing, raw `CLIENT`/`SERVER` audit logging to `events.jsonl`, and stderr forwarding to `runLog`.
   - Manages pending JSON-RPC request tracking (`PendingJsonRpcRequest`), request timeouts, and cancellation.
   - Provides clean lifecycle methods: `start()`, `request<T>()`, `respond()`, `cancel()`, `stop()`.

2. **`AcpEventDecoder` (`src/harness/cursor/AcpEventDecoder.ts`)**:
   - A pure, deterministic decoder that accepts `unknown` inputs and returns a typed `DecodedAcpMessage` discriminated union (`response`, `notification`, `request`, `unknown`, `invalid`).
   - Normalizes session updates into `AcpSessionUpdate` (agent message chunks, thought/progress chunks, and tool updates).
   - Validates server-initiated interactive requests (`AcpPlanRequest`, `AcpQuestionRequest`, `AcpPermissionRequest`).
   - Serves as the single protocol decoder shared by both live streaming (`AcpEventNormalizer`) and historical replay (`parseAcpEvents`).

3. **`CursorAcpSession` (`src/harness/cursor/CursorExecutorHarness.ts`)**:
   - Focuses strictly on session lifecycle (`initialize`, `authenticate`, `session/load`, `session/new`, `session/set_config_option`), turn execution (`prompt`), mode switching (`setMode`), observation access, and bridging interactive requests to orchestrator callbacks.

4. **Explicit Protocol Boundaries and Types**:
   - Define explicit protocol types in `src/harness/cursor/types.ts` (`CursorSessionCapabilities`, `AcpSessionUpdate`, `AcpPlanRequest`, `AcpQuestionRequest`, `AcpPermissionRequest`, `DecodedAcpMessage`).
   - Define `ExternalHarnessModule` in `src/harness/registry.ts` to type external plugin module contracts.
   - Add explicit role context fields to `HarnessContext` in `src/types.ts` (`thinking`, `reasoningEffort`, `timeoutMinutes`, `timeoutSeconds`, `attempt`).

5. **Static Invariant Enforcement**:
   - Maintain `typescript/no-explicit-any: error` in `.oxlintrc.json`.
   - Add an invariant test in `scripts/verify-oxlint-rules.mjs` ensuring Oxlint catches `explicit-any` violations.

## Alternatives considered

- **Alternative 1: Keep transport inside `CursorAcpSession` and only extract `AcpEventDecoder`**:
  - _Cost_: Leaves `CursorAcpSession` with multiple responsibilities and tight coupling between subprocess I/O and session logic.
  - _Why rejected_: Fails to satisfy Functional Specification Outcome 4 and leaves transport testing intertwined with session orchestration.

- **Alternative 2: Introduce an external schema validation library (Zod, TypeBox, Valibot)**:
  - _Benefit_: Declarative schema syntax.
  - _Cost_: Adds external runtime dependencies, increases bundle size, and risks version mismatch.
  - _Why rejected_: Per the Functional Specification Non-goals, lightweight custom type guards and discriminator checks are fast, zero-dependency, and fully sufficient for the consumed protocol subset.

## Consequences

- **Positive**:
  - Eliminates divergence between live and replay protocol interpretation.
  - `CursorAcpTransport` and `AcpEventDecoder` can be tested hermetically in pure unit tests.
  - Removes broad explicit `any` and unsafe type casts at adapter edges.
  - Simplifies `CursorAcpSession` maintenance and error isolation.
- **Negative / Trade-offs**:
  - Adds two modular source files in `src/harness/cursor/`.
- **Compatibility / Migration**:
  - Fully backward compatible. Public exports (`CursorExecutorHarness`, `CursorAcpSession`, `parseAcpEvents`) retain their existing signatures.
- **Security / Reliability**:
  - External JSON payloads are strictly validated before entering the accumulator or orchestrator.
  - Process termination and timeout logic are encapsulated in `CursorAcpTransport`.
- **Testing / Observability**:
  - Direct equivalence testing between live and replay modes via `AcpLiveReplayEquivalence.test.ts`.

## Verification

- `tests/harness/cursor/AcpEventDecoder.test.ts`: Covers malformed JSON-RPC messages, non-object values, response error/result narrowing, unknown notifications, and malformed tool updates.
- `tests/harness/cursor/AcpLiveReplayEquivalence.test.ts`: Verifies live and replay equivalence against identical multi-chunk stream fixtures.
- `tests/harness/cursor/acp-regression.test.ts`: Proves no regression in real-world Stage 07 protocol fixtures and accumulation invariants.
- `scripts/verify-oxlint-rules.mjs`: Verifies `typescript/no-explicit-any` gate enforcement.
- `npm run verify`: Full suite passes with strict coverage thresholds.

## Revisit triggers

- Changes to the upstream Agent Client Protocol (ACP) specification introducing binary framing or transport shifts away from JSON-RPC stdio.
- Replacement of Cursor CLI with an entirely different executor protocol.
