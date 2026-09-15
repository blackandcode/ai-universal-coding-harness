# Deep modules and guardrails

A useful module hides substantial complexity behind a smaller stable surface. AI-maintained repositories degrade when every small operation becomes a new wrapper, service, manager, helper, and interface.

## Prefer a deeper module when

- callers repeatedly coordinate the same sequence;
- invariants are duplicated across callers;
- provider/platform quirks leak outside the owner;
- test setup must know internal details that should be hidden;
- changing one concept requires edits across many shallow files.

## Suspicious abstractions

- interface with exactly one implementation and no meaningful boundary;
- service that forwards each method unchanged;
- helper whose name hides no policy;
- manager/controller/coordinator class with mixed ownership;
- `utils.ts` accumulating unrelated behavior;
- provider-specific conditionals outside the adapter;
- state flags that can form invalid combinations.

## Guardrails

Prefer executable rules over prose when practical:

- tests for state-transition legality and architectural invariants;
- import-boundary checks for provider/internal modules;
- package/CLI smoke verification;
- schema validation for external protocol output;
- temp-repository integration tests for Git behavior;
- cross-platform CI for process/path behavior.

Do not add a checker merely because it can be written. A guardrail should protect a failure mode that has occurred or is expensive enough to justify permanent enforcement.
