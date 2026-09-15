---
name: enterprise-architecture
description: Select and evolve software architecture for Node.js 24+ and TypeScript 7 enterprise applications. Use when choosing modular monolith vs services, defining module/bounded-context boundaries, applying hexagonal/clean architecture, planning dependencies, evaluating architectural trade-offs, or deciding whether CQRS/events/microservices are justified. Routes detailed work to sibling skills instead of duplicating them.
compatibility: Node.js 24+ and TypeScript 7.x oriented; architectural principles are framework-neutral.
metadata:
  stack: node24-typescript7
  role: architecture-router
---

# Enterprise Architecture

Own the **shape of the system and its dependency boundaries**. Do not solve a concrete persistence, messaging, runtime, or React problem here when a narrower sibling skill owns it.

## Core posture

1. Start simple but create real boundaries.
2. Prefer a modular monolith until independent deployment/ownership/scaling/failure isolation is a demonstrated requirement.
3. Inside meaningful modules, use ports and adapters so business/application code does not depend on transport, database, queue, vendor SDK, or framework details.
4. Apply DDD to business complexity, not to every CRUD screen.
5. Keep architectural rules executable through tests/lint/CI where practical.
6. Record consequential choices with an ADR or equivalent decision record.
7. Design for change: boundaries should let infrastructure and delivery mechanisms change without rewriting domain rules.

## Decision sequence

Before coding a non-trivial feature:

1. Identify the business capability and owner.
2. Identify the source of truth and invariants.
3. Decide whether this belongs to an existing module/bounded context.
4. Define inbound use cases/commands/queries.
5. Define outbound capabilities required from infrastructure as ports.
6. Decide transaction boundaries.
7. Decide synchronous vs asynchronous interactions based on actual forces.
8. Define failure, retry, idempotency, timeout, and observability behavior.
9. Define tests that prove the boundary and behavior.
10. Escalate to distributed patterns only when the single-process/deployment option cannot meet requirements.

## Architecture selection

Read `references/architecture-selection.md` before choosing architecture for a new subsystem.

Read `references/modular-monolith.md` when building or repairing a monolith.

Read `references/hexagonal-boundaries.md` when defining layers, ports, adapters, dependencies, or framework placement.

Read `references/anti-patterns.md` during architecture review/refactoring.

## Routing

- Business concepts, bounded contexts, aggregates -> `domain-driven-design`
- Type-level modeling and implementation patterns -> `typescript7-design-patterns`
- Node process/runtime behavior -> `node24-backend-patterns`
- HTTP/event/public contracts -> `api-contract-patterns`
- Database/transaction/query design -> `persistence-patterns`
- Messaging/integration -> `enterprise-integration`
- Sagas/CQRS/event sourcing/distributed consistency -> `distributed-systems`
- Verification/fitness functions -> `architecture-testing`
- React/frontend module boundaries -> `react19-enterprise-patterns`
- Whole-system review -> `architecture-review`

## Dependency rule

For a bounded context/module:

```text
transport / UI / jobs / consumers
             |
             v
        application
          /      \
         v        v
      domain     ports  <----- interfaces owned inward
                   ^
                   |
          infrastructure adapters
      DB / HTTP clients / queues / filesystem
```

Dependencies point toward business/application policy. Infrastructure implements interfaces; it does not define the core model.

## Do not over-apply patterns

A pattern needs a force. If the problem can be solved clearly by a function and a well-named module, do that. Do not introduce repositories, factories, event buses, CQRS, or microservices merely because they appear in a pattern catalog.
