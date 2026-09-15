---
name: distributed-systems
description: Apply distributed-system patterns only when required in Node.js 24 + TypeScript 7 architectures. Use for sagas, CQRS, event sourcing, projections, eventual consistency, distributed workflow coordination, compensation, duplicate/ordering handling, and service-boundary resilience. Requires explicit justification because these patterns add operational complexity.
compatibility: Node.js 24+, TypeScript 7.x; infrastructure-neutral.
metadata:
  role: distributed-systems
---

# Distributed Systems Patterns

Use this skill after `enterprise-architecture` identifies a real distributed problem.

Read `references/saga.md`, `references/cqrs.md`, `references/event-sourcing.md`, and `references/consistency.md`.

## Non-negotiable realities

- networks fail partially;
- messages can be duplicated and delayed;
- clocks differ;
- remote operations cannot be treated like local function calls;
- a timeout means “unknown outcome” as often as “did not happen”;
- consistency guarantees must be stated, not assumed.

## Default

Prefer local transactions and in-process calls when requirements allow them. Distribution should purchase a concrete property worth its failure modes.
