# TypeScript 7 rules

The project currently targets TypeScript 7.0.x.

## Compiler/configuration facts

TypeScript 7 adopts TypeScript 6 behavior while changing important defaults and rejecting formerly-deprecated options. For this repository:

- keep `strict` expectations explicit even though TS7 defaults it on;
- explicitly set `rootDir` when source layout requires it;
- remember `types` defaults to `[]`; list required ambient type packages intentionally;
- use modern ESM module resolution appropriate to direct Node execution/build output; do not use legacy `node`/`node10`/`classic` resolution;
- do not reintroduce `baseUrl`;
- do not target ES5 or use removed legacy module formats;
- use import attributes (`with`) rather than obsolete import assertions where applicable.

## TS 7.0 tooling caveat

TypeScript 7.0 does not expose the old JavaScript compiler API. Tooling that imports the TypeScript compiler programmatically must be verified explicitly. Do not assume a TS6-era transformer, loader, language plugin, or AST tool works with TS7 merely because `tsc` does. Re-check this rule when the repository adopts a later TS7 release with a new API.

## Type design

Prefer:

```ts
type StagePhase =
  | { kind: 'planning'; attempt: number }
  | { kind: 'implementing'; attempt: number }
  | { kind: 'quality'; patchFingerprint: string }
  | { kind: 'review'; evidenceId: string }
  | { kind: 'completed'; commit: string };
```

over independent flags such as `isPlanning`, `isQuality`, `isReviewing`, which can form impossible combinations.

Use `unknown` at runtime trust boundaries and narrow through validation. A TypeScript type annotation does not validate JSON, config, adapter output, or persisted state.
