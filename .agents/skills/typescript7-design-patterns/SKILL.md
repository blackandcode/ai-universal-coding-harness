---
name: typescript7-design-patterns
description: Apply idiomatic software design patterns in TypeScript 7.x for Node.js 24+ and React 19+ systems. Use when modeling states and errors, choosing Strategy/Adapter/Factory/Decorator/State/Command patterns, designing interfaces, enforcing module boundaries, replacing unsafe runtime assumptions with validated types, or reviewing Java-style overengineering in TypeScript.
compatibility: TypeScript 7.x; Node.js 24+ and React 19+ examples. ESM-first.
metadata:
  stack: typescript7
  role: language-design
---

# TypeScript 7 Design Patterns

Use TypeScript's type system and JavaScript's first-class functions before introducing class-heavy pattern machinery.

## TypeScript 7 baseline

- `strict` is assumed.
- Explicitly configure `types` because TS7 defaults it to `[]`.
- New Node applications use `module`/resolution appropriate to NodeNext; bundler-owned React applications use bundler-oriented resolution.
- Do not reintroduce removed/deprecated TS6-era options such as legacy `node`/`classic` module resolution or `baseUrl`.
- Keep runtime validation separate from static typing: external JSON, environment variables, messages, DB results from untrusted/raw layers, and request input are runtime data.
- If relying on Node native TypeScript type stripping, keep runtime code compatible with erasable syntax and still run `tsc --noEmit` (or the repository's TS7 type-check command).

## Pattern priority

1. plain function/module;
2. discriminated union / data + function;
3. interface/port + implementation;
4. class when identity, lifecycle, encapsulated mutable state, inheritance constraints, or framework integration justify it;
5. more elaborate GoF pattern only when the simpler form does not express the required variation.

Read:

- `references/type-driven-design.md` for domain/state/error modeling;
- `references/idiomatic-patterns.md` for TypeScript forms of classic patterns;
- `references/module-boundaries.md` for public APIs and imports;
- `references/error-modeling.md` for errors and Result-style flows.

## Default rules

- Prefer discriminated unions for finite state machines and variant results.
- Prefer `satisfies` to assertions when checking object conformance while preserving inference.
- Treat `unknown` as the type of unvalidated external data.
- Avoid broad `any`; isolate unavoidable dynamic interop at adapters.
- Prefer semantic IDs and value types for concepts that must not be mixed accidentally.
- Use exhaustive `never` checking for important variants.
- Do not duplicate a runtime schema and a TypeScript type manually if one can be derived safely from the other.
- Use interfaces/types to describe boundaries, not to create an interface for every class.
