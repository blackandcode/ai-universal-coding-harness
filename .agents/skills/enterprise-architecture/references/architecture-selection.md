# Architecture selection

## Default: modular monolith

Prefer a modular monolith when:

- one team or a small number of teams can coordinate deployment;
- scaling characteristics are broadly similar;
- strong local transactions simplify correctness;
- the business boundaries are still evolving;
- operational simplicity is valuable;
- service-to-service network failure would add more risk than value.

A modular monolith is not an unstructured monolith. Modules have explicit public APIs, private internals, owned data where practical, and import/dependency rules.

## Consider independently deployed services when

At least one concrete force exists:

- different teams need independent release cycles;
- a capability needs materially different scaling/runtime characteristics;
- regulatory/security isolation requires a deployment boundary;
- fault isolation is worth remote-call complexity;
- the capability has a mature, stable contract and clear data ownership;
- organizational structure already demands independent ownership.

Do not split merely for code organization. Modules provide code organization without network costs.

## Hexagonal / clean architecture

Use when business rules must survive changes in frameworks, storage, delivery channels, vendors, or test environments. It is particularly valuable for enterprise business systems with long lifetimes.

Avoid ceremony for tiny scripts and genuinely simple CRUD modules. Even there, keep validation and external dependencies at boundaries.

## Layered architecture

Traditional presentation -> service -> data layers can be sufficient for simple systems. The risk is dependency direction: business logic tends to leak into controllers and persistence models. If that is occurring, move to inward-owned ports and use-case/domain modules.

## Event-driven architecture

Use events when facts need asynchronous fan-out, temporal decoupling, durable integration, or independent reactions. Do not use events merely to avoid direct function calls inside one process.

## CQRS

Use when read and write models have genuinely different shapes, scaling, authorization, or consistency needs. Simple `Command` and `Query` handlers do not require separate databases or event sourcing.

## Event sourcing

Use only when event history is the authoritative business record and replay/audit/temporal reasoning justify the operational burden. Never choose event sourcing simply because domain events are useful.

## Microservices

Treat microservices as an organizational/deployment architecture, not as a synonym for good modularity. Every network boundary adds latency, partial failure, versioning, observability, security, deployment, and consistency costs.
