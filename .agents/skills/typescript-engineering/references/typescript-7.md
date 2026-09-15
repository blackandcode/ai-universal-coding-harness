# TypeScript 7 reference

## What changed conceptually

TypeScript 7.0 is the native Go implementation of TypeScript. Its type-checking behavior was intentionally ported from TypeScript 6.0, but the project model is modernized and old compatibility switches are gone.

Treat these as separate concerns:

1. **type semantics** — intentionally close to TS6;
2. **compiler implementation/performance** — native, multithreaded, materially faster;
3. **project defaults** — modern and sometimes breaking;
4. **compiler API** — not available in TS7.0 in the legacy form;
5. **ecosystem compatibility** — tools that import the TS API need explicit verification.

## TS7.0 defaults agents must know

- `strict` defaults to `true`.
- `module` defaults to `esnext`.
- `target` defaults to the most recent stable ECMAScript version before `esnext` (ES2025 in TS7.0).
- `noUncheckedSideEffectImports` defaults to `true`.
- `libReplacement` defaults to `false`.
- stable type ordering is always enabled.
- `rootDir` defaults to the config directory rather than inferred common source root.
- `types` defaults to `[]`.

These defaults improve correctness and performance, but explicit project configuration is still useful when the option is part of a runtime/public compatibility contract.

## Migration errors are signals

If TS7 rejects a TS6-deprecated option, remove/migrate the option. Do not seek a suppression flag.

Common migrations:

| Legacy                             | Modern direction                                                         |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `moduleResolution: node/node10`    | `NodeNext` for Node, `Bundler` for bundlers                              |
| `moduleResolution: classic`        | `NodeNext` or `Bundler`                                                  |
| `baseUrl`                          | explicit relative `paths`, package imports, or workspace/package imports |
| `outFile`                          | bundler                                                                  |
| `target: es5`                      | modern target or external downlevel compiler                             |
| `module: amd/umd/system/none`      | ESM/CJS through modern runtime/bundler                                   |
| import `asserts`                   | import attributes `with`                                                 |
| implicit global `@types` discovery | explicit `types`                                                         |

## `rootDir`

When config is at project root and source is under `src`, explicitly set:

```json
{
  "compilerOptions": {
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

For configs that intentionally include tests/config/build files outside `src`, either use a separate tsconfig for those concerns or choose a root that actually represents the compilation unit.

## `types`

Do not confuse `types` with imported module types. The `types` array controls which `@types` packages contribute global declarations. TS7's empty default reduces accidental global pollution and can improve performance.

Examples:

- Node app: `types: ["node"]`
- Jest globals: `types: ["node", "jest"]`
- Vitest globals only when enabled: `types: ["node", "vitest/globals"]`
- Vite client globals: `types: ["vite/client"]`

Prefer explicit imports over test globals when it fits the codebase.

## Parallel compiler controls

TS7 adds native concurrency controls. Treat them as tuning knobs, not code-style rules.

- `--checkers N`: type-check worker count; more CPU can cost more memory.
- `--builders N`: parallel project-reference builders.
- `--singleThreaded`: disables parallelism for debugging or constrained systems.

Benchmark before pinning values in scripts/CI.

## TS6 compatibility lane

TypeScript 6.0 is useful for tools requiring the old compiler API and for staged migration. It should not drive the architecture of new TS7 code.

Use `stableTypeOrdering` only while diagnosing TS6-vs-TS7 inference/declaration ordering differences.
