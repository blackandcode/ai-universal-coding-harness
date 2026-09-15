---
name: typescript-advanced
description: Use for difficult TypeScript 6/7 compiler errors, complex generics, conditional or mapped types, inference, type guards, branded types, declaration design, or systematic removal of any.
---

# Advanced TypeScript

Use this skill only when ordinary TypeScript modeling is insufficient.

## Workflow

1. Run the project's typecheck and capture the exact compiler errors.
2. Reduce the problem to the smallest relevant type relationship.
3. Identify whether the issue is inference, variance, distributivity, overloads, widening/narrowing, module declarations, or an incorrect domain model.
4. Prefer redesigning the public type shape over adding assertions.
5. Add focused compile-time/type tests when the project supports them.
6. Re-run the exact project compiler version.

## Principles

- Advanced types should make APIs safer/easier for callers, not demonstrate cleverness.
- Preserve inference where possible.
- Constrain generics to express requirements.
- Be deliberate about distributive conditional types.
- Prefer readable helper aliases over deeply nested one-line types.
- Remove `any` by discovering the actual boundary/model, not replacing it mechanically with impossible generics.
- Use `unknown` where knowledge is genuinely absent.
- Use type predicates only when runtime checks truly prove the predicate.

## Library types

For public libraries, consumer ergonomics matter. Validate declaration output against realistic consumer code and the supported compiler range.
