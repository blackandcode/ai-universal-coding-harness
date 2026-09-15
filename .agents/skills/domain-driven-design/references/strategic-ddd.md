# Strategic DDD

## Bounded context

A bounded context is a boundary within which a domain model and language are consistent. The same real-world word can legitimately mean different things in different contexts.

Signs a boundary is meaningful:

- distinct business owner/team;
- distinct rules/invariants;
- different lifecycle or source of truth;
- language meaning changes;
- integration can be expressed as an explicit contract.

## Context relationships

Prefer explicit relationships instead of accidental shared models.

Useful patterns include:

- customer/supplier contract;
- conformist when accepting an upstream model is truly cheaper;
- anti-corruption layer when translating an external/legacy model into your own;
- published language / stable integration schema;
- separate ways when integration is more expensive than duplication.

## Data ownership

A context owns the authoritative mutation of its data. Other contexts consume contracts, read models, or events rather than directly updating private tables.

## Avoid “enterprise canonical model” by default

A single universal object model across every context often creates semantic coupling. Canonical schemas can be useful at deliberate integration boundaries, but should not erase bounded-context meaning.
