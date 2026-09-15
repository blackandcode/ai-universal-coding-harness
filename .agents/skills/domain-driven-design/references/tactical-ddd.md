# Tactical DDD in TypeScript

## Entity

Use when continuity/identity matters across state changes.

## Value object

Use when equality is based on value and the concept can be immutable. Validate at construction.

## Aggregate

Use to protect invariants and define a consistency boundary. External code references the aggregate root, not arbitrary internals.

## Domain service

Use for a domain operation involving multiple domain concepts where placing behavior on one entity would distort the model.

## Repository

Use an application/domain-owned interface when aggregate retrieval/persistence is a meaningful capability.

## Factory

Use when creating a valid aggregate requires non-trivial policy or coordinated construction. Keep invariants in the created domain model as well.

## Specification

Useful when complex business predicates must be named, composed, tested, and reused. Do not automatically turn every `if` condition into a Specification class; a typed predicate function is often enough.

```ts
type Specification<T> = (candidate: T) => boolean;
```

## Anemic model warning

If domain objects are merely getters/setters and all business rules live in transaction scripts/services, decide consciously whether the domain is actually simple. Rich models are valuable only where behavior/invariants deserve them.
