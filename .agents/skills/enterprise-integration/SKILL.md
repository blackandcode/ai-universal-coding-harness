---
name: enterprise-integration
description: Implement enterprise integration and messaging patterns for Node.js 24 + TypeScript 7 systems. Use for queues/topics, commands/events, transactional outbox/inbox, idempotent consumers, retries, dead-letter handling, correlation, splitter/aggregator, process manager, webhook integration, anti-corruption adapters, and schema evolution.
compatibility: Node.js 24+, TypeScript 7.x; broker/vendor-neutral.
metadata:
  role: integration
---

# Enterprise Integration Patterns

Messaging buys temporal decoupling and durability, but introduces duplicate delivery, ordering, lag, schema evolution, replay, and operational state.

Read `references/message-semantics.md`, `references/outbox-inbox.md`, `references/resilience.md`, and `references/routing-workflows.md`.

## Core rules

- Distinguish command, event, and document/data-transfer messages.
- Every message has a stable ID; propagate correlation/causation metadata where useful.
- Assume at-least-once delivery unless the infrastructure contract proves otherwise, and still protect side effects appropriately.
- Make consumers idempotent.
- Use a transactional outbox for DB state + event publication dual-write problems.
- Define retryability and dead-letter policy by error class.
- Do not retry poison messages forever.
- Validate message schemas at the consumer boundary.
- Keep broker/vendor envelopes outside domain logic.
