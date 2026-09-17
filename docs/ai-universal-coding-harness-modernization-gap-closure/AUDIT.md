# Modernization Audit — Original Plan vs 2.2.1

## Executive assessment

The 2.2.1 codebase is not missing another broad modernization. Most of the five-stage plan was implemented well. The remaining issues are concentrated around places where static TypeScript strictness can give a false sense of safety while `any`, casts, shallow runtime validation, or incomplete evidence scoping still bypass the intended contracts.

## 1. Toolchain and modern runtime

**Status: substantially complete.**

Confirmed in 2.2.1:

- `engines.node = >=24.18.0`;
- `.nvmrc = 24.18.0`;
- TypeScript `7.0.2`;
- `target = ES2024`;
- `module/moduleResolution = NodeNext`;
- `strict = true`;
- `noImplicitAny = true`;
- `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedSideEffectImports`;
- React `19.2.8`, Ink `7.1.1`;
- Oxfmt/Oxlint;
- deterministic package and lockfile checks.

No new modernization stage is required for the toolchain itself.

## 2. Strict TypeScript completion

**Status: incomplete.**

A source audit found approximately 55 explicit production `any` constructs. Most are concentrated in:

- `src/harness/cursor/CursorExecutorHarness.ts`;
- `src/harness/cursor/AcpEventNormalizer.ts`;
- `src/harness/codex/CodexReviewerHarness.ts`;
- `src/harness/codex/CodexEventParser.ts`;
- `src/orchestrator/Orchestrator.ts`;
- `src/quality/EvidenceVerifier.ts`.

This matters because these are exactly the high-risk untrusted boundaries that the plan required to start as `unknown` and narrow through validators.

Current lint keeps `typescript/no-explicit-any` at `warn`, even though the planned Stage 02 end-state was elimination of broad internal `any`.

## 3. ACP architecture

**Status: partially complete.**

Good work already exists:

- `AcpToolAccumulator`;
- `AcpEventNormalizer`;
- `ObservationJournal`;
- ACP regression tests;
- multi-chunk command retention;
- no inferred exit 0 from completed-without-exit;
- duplicate/session collision tests.

Remaining problem:

`CursorAcpSession` still owns subprocess transport, JSON-RPC request tracking, raw message parsing, session configuration, plan/question/permission handling, command-broker fallback and stream handling. Historical replay (`parseAcpEvents`) also reimplements ACP message parsing separately instead of sharing one parser/normalizer pipeline.

That creates protocol drift risk: a future ACP format fix can be applied to live parsing but missed in replay/recovery, or vice versa.

## 4. Evidence trust model

**Status: important gaps remain.**

### 4.1 Quality epoch is not enforced

`VerificationContext` defines `quality_epoch_id`, and `Orchestrator` passes it, but `verifyEvidenceAgainstObserved()` does not use it.

The verifier currently filters by stage and attempt only, and even those filters allow observations whose stage/attempt metadata is absent.

The original plan required evidence to belong to the current:

- run;
- stage;
- attempt;
- executor session / quality epoch;
- patch.

The implementation therefore does not yet enforce its own intended trust boundary.

### 4.2 Resumed evidence can bypass a failed corroboration

`EvidenceService.checkReusableEvidence()`:

- parses saved JSON directly;
- does not call the evidence validator;
- does not require green status/zero exits/unresolved empty;
- trusts runtime `patch_fingerprint` equality plus file existence.

`Orchestrator` still calls corroboration afterwards, but only rejects a failed corroboration when `!isResumed`.

Therefore a resumed evidence file is treated as trusted more strongly than fresh evidence, even if the current corroboration report is not OK.

That is opposite to the desired invariant: resume should preserve proven state, not weaken validation.

### 4.3 Recovery fingerprint rule is permissive

`RecoveryManager` currently uses:

```text
!evidence.patch_fingerprint || evidence.patch_fingerprint === currentPatchFingerprint
```

This allows missing fingerprints to count as matching.

For a recovery path whose purpose is proving that old quality evidence belongs to the current patch, absence of a fingerprint must not be considered equivalent to a match.

### 4.4 Epoch replay is not reconstructable

Live observations can be tagged with a quality epoch, but the raw ACP replay path does not persist or reconstruct the epoch boundary. Recovery therefore cannot prove the same quality-epoch invariant after a crash.

## 5. Persisted state validation

**Status: incomplete.**

`validateRunState()` validates a small set of top-level properties and then casts the object to `RunState`.

It does not validate, among other things:

- state version;
- timestamps;
- base/original branch fields;
- stage entries;
- stage manifests;
- manifest SHA maps;
- executor/reviewer ids;
- quality command;
- optional indices/phases.

`validateStageRuntimeState()` validates only `phase` and then casts to `StageRuntimeState`.

More importantly, `loadStage()` catches invalid/corrupt state and silently returns `{version:1, phase:'pending'}`. Missing state may safely default to pending; corrupted existing state should not silently become a new pending stage.

## 6. UI modernization

**Status: complete enough.**

The plan's major UI goals are present:

- `.tsx`;
- modern JSX transform;
- component decomposition;
- pure reducer;
- selectors;
- event-file module;
- bounded layout;
- Ink render tests;
- keyboard tests for `f`, `t`, `d`, `l`, `q`, `Esc` and focus scrolling.

No separate UI correction stage is warranted.

## 7. Testing and release gates

**Status: mostly complete, but several gates are only documented.**

### 7.1 Global coverage exists

`run-tests.mjs` enforces:

- lines >= 85%;
- functions >= 85%;
- branches >= 80%.

### 7.2 Critical-module coverage does not exist as an independent gate

Documentation and `DECISIONS.md` explicitly say that permissions, quality/evidence and recovery have independent coverage invariants.

No implementation was found that measures/enforces those modules independently. The test runner only applies global repository thresholds.

### 7.3 Script tests are outside `verify`

The repository has:

```text
npm run test:versioning
```

which executes:

- `tests/scripts/versioning.test.mjs`;
- `tests/scripts/changelog.test.mjs`;
- `tests/scripts/adr.test.mjs`.

But `npm run verify` does not call it, and `.mjs` tests are not compiled/discovered by `scripts/run-tests.mjs`.

Therefore `verify` is not currently the complete authoritative suite described in the plan.

### 7.4 Minimum Node matrix is incomplete

Current CI effectively runs:

```text
Ubuntu    Node 24 latest
Windows   Node 24 latest
macOS     Node 24 latest
Ubuntu    Node 24.18.0
```

The initial testing strategy required the minimum supported Node runtime on all three operating systems, plus at least one latest Node 24 job.

Desired structure:

```text
Ubuntu    24.18.0
Windows   24.18.0
macOS     24.18.0
Ubuntu    24 latest
```

## 8. Documentation and governance

**Status: needs cleanup.**

The root `DECISIONS.md` states that the authoritative decision log exists at:

```text
ai-universal-coding-harness-rewrite-plan/DECISIONS.md
```

but that directory is absent from the supplied 2.2.1 tree. This leaves a broken repository-relative link and loses the claimed detailed decision history.

The initial rewrite plan also required `IMPLEMENTATION-STATUS.md` updates during every stage, but the current repository contains no such file.

Recommended outcome:

- make root `DECISIONS.md` authoritative;
- migrate any important rewrite decisions into it;
- add a concise `IMPLEMENTATION-STATUS.md` describing implemented capabilities and remaining work;
- add a lightweight relative-Markdown-link check so this class of documentation break is caught by `verify`.

## 9. Configuration contract fidelity

**Status: gaps remain (Stage 04).**

A follow-up audit of `config.example.jsonc` against the 2.2.1+ tree found that most Stage 06 reviewer routing, fallback, and UI budget keys are implemented. Three contract gaps remain:

| ID   | Summary                                                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-12 | `maxUniqueQuestionsPerStage` is validated on merged config but not enforced in `Orchestrator.questionDecision`.                                                                         |
| F-13 | `ReviewerRouter` merges role fields into `HarnessContext`, but Codex reviewer still reads `harnesses.codex`; `reviewer.<role>` vs `harnesses.*` precedence is not normative at runtime. |
| F-14 | No automated config contract tests; example templates and `docs/configuration.md` can drift.                                                                                            |

Corrective specs: `stage-04-configuration-contract-fidelity/` (findings F-12–F-14). User-facing configuration accuracy is **not** part of Stage 03 F-11 (CI/governance docs only).

## 10. Items that should NOT be reopened

Do not spend another stage rewriting areas that already meet the modernization goals:

- configuration file decomposition;
- CLI command-union architecture;
- React/Ink component organization;
- Git repository abstraction;
- package tarball consumer verification;
- OIDC publishing;
- stage package format;
- general permission-engine architecture;
- current test directory separation.

The remaining work should be surgical and regression-driven.
