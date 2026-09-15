---
name: api-contract-patterns
description: Design stable enterprise API and message contracts for TypeScript 7 / Node.js 24 systems. Use for REST/HTTP resource design, commands/events, runtime validation, OpenAPI/schema ownership, pagination, errors, idempotency keys, compatibility/versioning, webhooks, and contract tests. Keeps transport contracts separate from domain/internal models.
compatibility: Node.js 24+, TypeScript 7.x; framework-neutral.
metadata:
  role: contract-design
---

# API Contract Patterns

A public contract is a product boundary. Treat it differently from internal TypeScript types.

## Contract workflow

1. Define consumer intent and ownership.
2. Define runtime schema/validation.
3. Define compatibility rules before clients depend on it.
4. Map contract DTOs to application/domain types at the adapter.
5. Define errors, idempotency, pagination, auth semantics, and observability.
6. Publish machine-readable schemas where useful.
7. Test provider/consumer expectations.

Read `references/http-api.md`, `references/validation-and-types.md`, and `references/versioning.md`.

## Rules

- External input is `unknown` until validated.
- Do not expose ORM entities/domain aggregates directly as wire contracts.
- Prefer additive compatible evolution.
- Make pagination ordering deterministic.
- For mutation endpoints susceptible to retries, define idempotency behavior.
- Webhooks require authentication/signature verification, replay protection/idempotency, and retry semantics.
