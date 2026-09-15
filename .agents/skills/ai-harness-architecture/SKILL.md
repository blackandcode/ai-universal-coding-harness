---
name: ai-harness-architecture
description: Design or change architecture in AI Universal Coding Harness while preserving orchestrator/executor/reviewer/verifier/Git/state/UI ownership boundaries. Use when adding a subsystem, moving responsibilities, changing module dependencies, introducing a pattern, designing a cross-module feature, writing an ADR, or deciding where new behavior belongs. Do not use for a local implementation that stays inside one established module.
compatibility: AI Universal Coding Harness; Node.js 24.18+; TypeScript 7.x.
metadata:
  role: architecture-router
---

# AI Harness Architecture

Use the existing architecture as a set of enforceable contracts, not as a folder convention.

Read `references/project-invariants.md` first for any cross-module change. Then load only the relevant reference:

- `references/module-boundaries.md` — ownership and dependency direction;
- `references/pattern-selection.md` — TypeScript patterns that fit this project;
- `references/deep-modules-and-guardrails.md` — abstraction depth and enforceable boundaries;
- `templates/adr-template.md` — consequential decisions.

## Decision workflow

1. State the user-visible or operational behavior that must change.
2. Identify the authority that should own it: orchestrator, adapter, permission engine, verifier, Git, state, stages, core/process utilities, or UI.
3. Identify the state/invariant that must remain true before and after the change.
4. Keep provider-specific behavior inside an adapter and external-data parsing at the boundary.
5. Prefer extending an existing deep module over creating a pass-through layer.
6. Use the smallest pattern that expresses the required variation or lifecycle.
7. Define verification before implementation: unit invariant, adapter contract, integration scenario, or cross-platform smoke test.
8. Record an ADR when the decision changes authority, persistence semantics, plugin contracts, security policy, or a public CLI/config contract.

## Architecture defaults

- The orchestrator coordinates; it is not a second shell, provider adapter, or Git implementation.
- Executor harnesses implement and run project quality commands.
- Reviewer harnesses decide/review; they do not mutate the target repository.
- Mechanical evidence verification is independent from semantic review.
- Git and durable-state mechanics have dedicated owners.
- UI consumes semantic events and does not become the source of orchestration truth.
- Provider adapters normalize transport/protocol details into harness-owned contracts.
- New abstractions must reduce coupling or protect an invariant; otherwise keep the direct implementation.

## Pattern priority

Prefer, in order:

1. cohesive function/module;
2. discriminated union plus pure transition/handler functions;
3. explicit interface/port at a real replaceable boundary;
4. registry/adapter/policy when runtime variability requires it;
5. class only when identity/lifecycle/mutable encapsulation materially helps;
6. more elaborate patterns only with a concrete force and a deletion test.

Do not introduce DDD aggregates, repositories, CQRS, event sourcing, sagas, service buses, or microservices to model this local CLI unless the product architecture actually acquires those forces.
