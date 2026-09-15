---
name: typescript-advanced
description: Use for difficult TypeScript 7 compiler errors, complex generics, conditional/mapped/template types, inference, type guards, branded types, declaration design, or systematic removal of unsafe types.
---

# Advanced TypeScript 7

Use only when ordinary domain modeling is insufficient. Advanced types should reduce caller complexity and illegal states, not demonstrate type-system cleverness.

## Workflow

1. Run the project's TS7 typecheck and capture the exact errors.
2. Reduce the problem to the smallest type relationship.
3. Determine whether the issue is inference, variance, distributivity, widening/narrowing, overloads, generic constraints, module declarations, declaration emit, or an incorrect domain model.
4. Prefer redesigning the public type shape over assertions.
5. Add focused compile-time/type tests when the project supports them.
6. Re-run the exact TS7 compiler configuration and any consumer declaration tests.

## TS7-specific inference note

TS7 always uses stable type ordering. If a migration from TS6 surfaces an inference difference, do not depend on declaration/order accidents. Add a deliberate type boundary, type parameter, or public annotation where it communicates the intended relationship.

TS6 `stableTypeOrdering` is only a migration diagnostic and should not become part of new design guidance.

## Principles

- Preserve useful inference.
- Use `satisfies` for conformance without widening away useful literals.
- Use `const` type parameters when literal preservation is genuinely part of an API.
- Constrain generics to express requirements.
- Be deliberate about distributive conditional types; wrap operands when non-distribution is intended.
- Prefer named helper aliases over deeply nested type expressions.
- Remove `any` by discovering the actual boundary/model, not by replacing it with unmaintainable generics.
- Use `unknown` when knowledge is genuinely absent.
- Runtime type predicates/assertion functions must actually prove the claimed condition.

## Declarations and libraries

For publishable libraries:

- test declaration emit under TS7;
- consider `isolatedDeclarations` where it fits the API and build architecture;
- avoid exposing private/internal inferred types accidentally;
- validate realistic consumer projects;
- ensure package `exports` and declaration resolution agree.

## Compiler-API work

Do not assume TS7.0 exposes the historical TypeScript compiler API. If the task involves AST transforms, custom language tooling, API extraction, or code generation through `typescript`, verify the tool/API path first and use the official TS6 compatibility lane when required.
