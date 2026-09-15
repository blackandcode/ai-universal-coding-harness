---
name: domain-driven-design
description: Apply strategic and tactical Domain-Driven Design to enterprise TypeScript 7 systems. Use when discovering bounded contexts, defining ubiquitous language, modeling entities/value objects/aggregates/domain services, designing domain events and repositories, or protecting a domain from external/legacy models with an anti-corruption layer. Do not use DDD ceremony for simple CRUD without meaningful domain rules.
compatibility: Language concepts are general; examples target TypeScript 7.x.
metadata:
  role: domain-modeling
  stack: typescript7
---

# Domain-Driven Design

DDD manages **business complexity and ownership boundaries**. It is not a folder template.

## Strategic before tactical

1. Identify business capabilities/subdomains.
2. Establish bounded contexts and ownership.
3. Define the language used by business and code inside each context.
4. Map context relationships and integration contracts.
5. Only then decide entities, value objects, aggregates, repositories, and events.

Read `references/strategic-ddd.md` for boundaries and context mapping.

Read `references/tactical-ddd.md` for aggregates/entities/value objects/services/repositories.

Read `references/domain-events.md` for domain vs integration events.

## Aggregate rule

An aggregate protects invariants that must be consistent together. Keep aggregate boundaries as small as correctness permits. One transaction normally modifies one aggregate; cross-aggregate workflows use application orchestration or asynchronous coordination when required.

## Repository rule

Repositories abstract access to aggregates when the domain/application benefits from persistence independence. Define them around domain intent, not generic CRUD.

## Domain service rule

Use a domain service for domain logic that does not naturally belong to one entity/value object. Do not turn the application layer into “domain services” or use services as a dumping ground for behavior that belongs on a model.
