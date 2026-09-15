# TS7 tooling and library compatibility

TypeScript 7 affects more than `.ts` source because TS7.0 does not provide the previous programmatic compiler API.

## Classify tools before upgrading

### Category 1 — invokes `tsc`/LSP only

Usually straightforward. Use the project's TS7 compiler and validate output.

### Category 2 — transpiles TypeScript syntax but does not typecheck

Examples include many bundler/transpiler paths. A successful build is not a type-safety gate. Keep `tsc --noEmit` (or a declaration build) separately.

### Category 3 — imports TypeScript's compiler API

Examples can include typed linting, custom AST tools, code generators, API/declaration tooling, and framework plugins.

For these tools:

1. check the exact installed tool's TS7 support;
2. update to its current release when support exists;
3. if it still requires TS6 API compatibility, use the official side-by-side TS6 package rather than changing application source architecture around the limitation;
4. keep TS7 as the main correctness compiler where possible.

## Official side-by-side bridge

TypeScript provides `@typescript/typescript6` for TS7.0 transition scenarios. It supplies a `tsc6` executable and legacy API. Microsoft also documents npm aliasing patterns for tools whose peer dependency expects the package name `typescript`.

Do not add this compatibility layer unless a concrete tool requires it. Remove it when the ecosystem dependency gains TS7 API support.

## typescript-eslint

Use the latest release and verify its current TS7 support rather than assuming compatibility from semver alone. Typed linting is particularly sensitive because it has historically relied on TypeScript program APIs.

Never disable type-aware linting globally just to force a TS7 upgrade through. Prefer either a supported version or the temporary official compatibility lane.

## Vite / esbuild / SWC / Babel-style builds

Transpilation is not type checking. The CI model should remain conceptually:

```text
transpiler/bundler build
        +
TypeScript typecheck
        +
lint/tests
```

Do not remove `tsc` because the app bundles successfully.

## Test runners

A test runner's ability to execute `.ts`/`.tsx` does not prove its types are valid. Keep the project typecheck separate unless the runner explicitly invokes the same TS7 checker.

Because TS7 defaults global `types` to `[]`, test-global types must be explicitly configured when tests use globals.

## React ecosystem

React 19's type package changes and TS7's stricter/cleaner global-type behavior reinforce each other:

- use scoped `React.JSX`/runtime augmentation instead of global `JSX` augmentation;
- use current `@types/react`/`@types/react-dom` compatible with the React major;
- modern JSX transform is required by React 19;
- avoid libraries that access React internals because those can block React upgrades independently of TypeScript.

## Package upgrades

When upgrading a major dependency in a TS7 project, verify four layers separately:

1. runtime compatibility;
2. TypeScript declaration compatibility;
3. compiler-API/tool integration compatibility;
4. emitted/bundled package behavior.

A green runtime smoke test is not enough.
