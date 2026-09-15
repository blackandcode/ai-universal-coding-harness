# TypeScript module boundaries

## Public API

Give each architectural module a deliberate public entry point (`public.ts`, package `exports`, or equivalent). Do not use barrel files that accidentally export every internal symbol.

## ESM-first

For new Node 24 code, use native ESM unless a concrete ecosystem constraint requires CommonJS. Align `package.json`, TypeScript module mode, file extensions/import specifiers, and runtime behavior.

## Import direction

Enforce dependency rules with one or more of:

- workspace/package boundaries;
- package `exports` maps;
- ESLint import restrictions or boundary plugins;
- architecture tests;
- path conventions checked in CI.

Do not rely on folder naming alone.

## Types are dependencies too

A type-only import can still create architectural coupling. Do not expose infrastructure-owned ORM/generated SDK types as domain/application public contracts simply because the import is `type`-only.

## Shared libraries

Avoid a giant `shared` package. Shared code should have a clear semantic owner and reason for reuse. Duplicate tiny, unstable code rather than creating a coupling magnet prematurely.
