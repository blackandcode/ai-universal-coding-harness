---
name: architecture-review
description: Review a Node.js 24 + TypeScript 7 enterprise codebase or design for architectural consistency, unnecessary pattern complexity, module/data ownership, DDD/hexagonal boundaries, runtime reliability, integration correctness, distributed-system risks, API compatibility, testability, React boundary quality, and actionable modernization priorities.
compatibility: Optimized for Node.js 24+, TypeScript 7.x, optional React 19+.
metadata:
  role: architecture-review
---

# Architecture Review

Review evidence before proposing a pattern rewrite. The goal is not pattern compliance; it is lower change cost and controlled operational risk.

Read `references/review-checklist.md` and `references/smells.md`.

## Review order

1. Business/module boundaries and ownership.
2. Dependency direction and public APIs.
3. State/transaction consistency boundaries.
4. External contracts and runtime validation.
5. Failure/retry/idempotency/timeouts.
6. Node event-loop/concurrency/lifecycle risks.
7. Messaging/outbox/workflow correctness.
8. Persistence/query/migration behavior.
9. Tests and architecture fitness functions.
10. Security/observability/release consequences.
11. Pattern complexity that can be deleted.

## Findings format

For each finding provide:

- evidence/location;
- violated architectural force or concrete risk;
- why it matters;
- smallest safe change;
- migration compatibility concerns;
- verification method.

Rank by impact/risk and change dependency, not by how fashionable a pattern is.
