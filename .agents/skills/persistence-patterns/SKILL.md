---
name: persistence-patterns
description: Apply enterprise persistence patterns in TypeScript 7 / Node.js 24 applications. Use for transaction boundaries, repository/data-mapper decisions, unit-of-work behavior, query objects, optimistic concurrency, migrations, pagination, read models, ORM isolation, and database ownership across modules/services.
compatibility: Node.js 24+, TypeScript 7.x; database/ORM-neutral.
metadata:
  role: persistence
---

# Persistence Patterns

The database is part of the architecture, but persistence mechanics should not casually become the domain model.

Read `references/transactions.md`, `references/repositories-and-queries.md`, and `references/migrations-and-ownership.md`.

## Principles

- A transaction boundary should follow a consistency requirement, not a controller method by habit.
- Keep transactions short; do not hold a DB transaction open across slow remote calls unless there is a specific supported design.
- Use optimistic concurrency when concurrent updates to the same aggregate/business record must be detected.
- Prevent N+1 query patterns and unbounded result sets.
- Separate write-model persistence from optimized read/query models when the use case justifies it; that does not automatically require full CQRS infrastructure.
- Do not put a generic repository over an ORM if it merely renames every ORM method and leaks all of its types anyway.
