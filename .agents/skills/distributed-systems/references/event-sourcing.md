# Event sourcing

Event sourcing stores domain state changes as the authoritative append-only history and derives current state by replay/projection.

## Use when

- historical state/why/how is a first-class requirement;
- audit/temporal reconstruction matters deeply;
- domain naturally expresses durable events;
- team can own event schema evolution, snapshots, replay, projections, and operational tooling.

## Do not use merely because

- you publish domain events;
- you need an audit log;
- CQRS sounds useful;
- events are fashionable.

An audit log can coexist with state-based persistence without making events the source of truth.

## Requirements

- immutable event identity/order semantics;
- schema/version/upcasting strategy;
- deterministic aggregate replay;
- snapshot strategy when needed;
- idempotent rebuildable projections;
- observability of projection lag and poison events.
