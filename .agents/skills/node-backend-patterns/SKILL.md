---
name: node-backend-patterns
description: Apply when designing Node.js 24+ HTTP APIs, services, workers, queues, persistence boundaries, authentication or backend module architecture in TypeScript.
---

# Node Backend Patterns

This skill supplements `nodejs-engineering`; it focuses on service architecture.

## Layering

Prefer clear ownership boundaries such as:

```text
transport (HTTP/queue/CLI)
  -> application/use-case
    -> domain
      -> ports/interfaces
        -> infrastructure adapters
```

Do not force this exact folder structure on small applications. The goal is dependency direction and testable boundaries, not ceremony.

## HTTP/API

- Validate path/query/body at the transport boundary.
- Convert transport data into domain/application inputs.
- Map domain errors to stable API responses centrally.
- Keep handlers thin enough that business rules can be tested without an HTTP server.
- Make pagination, filtering and sorting contracts explicit.
- Version breaking external contracts deliberately.

## Persistence

Repository/data-access abstractions should exist when they protect domain/application code from persistence details or enable meaningful substitution. Avoid generic repository abstractions that merely mirror the ORM.

Transactions should surround a coherent business operation. Do not hide partial-success semantics.

## Authentication and authorization

Authentication identifies the principal; authorization decides permission. Keep authorization decisions near the protected use case/resource and avoid scattered role-name conditionals.

## Background jobs

Jobs must define retry, idempotency, timeout and dead-letter/failure behavior. Assume delivery can be repeated unless infrastructure guarantees otherwise.

## External services

Use small typed adapters around third-party clients when they isolate vendor semantics, normalization, retries/timeouts or testing boundaries.

## Frameworks

Express, Fastify and other frameworks are transport adapters. Follow the existing project choice. Do not migrate frameworks without a task-level reason.

## TypeScript 7 integration

Keep transport schemas/runtime validation authoritative at external boundaries and derive/narrow domain inputs from them. Under TS7, do not rely on ambient global types or legacy Node module resolution. Backend packages should use the Node module profile from `typescript-engineering`/`nodejs-engineering`, with explicit Node global types and runtime-resolvable imports.
