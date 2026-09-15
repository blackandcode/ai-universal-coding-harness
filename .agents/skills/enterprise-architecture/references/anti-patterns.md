# Enterprise architecture anti-patterns

Watch for these signals.

## Distributed monolith

Services deploy separately but must release together, share schemas, call each other synchronously in long chains, and cannot complete work independently. Prefer repairing boundaries before adding more services.

## Shared database as public API

Multiple modules/services directly modify each other's tables. This bypasses ownership and contract evolution.

## CRUD-shaped domain everywhere

Every layer mirrors database tables and business invariants are spread across controllers/services/jobs. Introduce domain concepts only where business rules justify them.

## Generic repository abstraction

`Repository<T>` with generic CRUD methods often hides business intent and leaks persistence semantics. Prefer capability-specific ports or query objects.

## Event soup

Everything emits events, event names are vague, schemas are undocumented, and consumers rely on incidental fields. Separate domain events, integration events, commands, and notifications.

## Retry storm

Nested layers retry the same dependency without coordinated budgets. Define retries at one appropriate boundary, with timeouts/deadlines, jitter, and circuit/concurrency protection.

## Exactly-once fantasy

Distributed messaging usually cannot make arbitrary side effects magically exactly once. Design consumers for idempotency and make delivery semantics explicit.

## Framework-owned domain

ORM decorators, HTTP request types, framework base classes, or React state constructs leak into business concepts. Keep framework models at adapters where practical.

## Pattern cargo cult

Factories around constructors, repositories around trivial SDK methods, CQRS for every endpoint, or events for in-process function calls. Every pattern must remove a specific pressure or risk.
