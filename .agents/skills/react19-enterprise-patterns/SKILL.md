---
name: react19-enterprise-patterns
description: Structure enterprise React 19+ applications with TypeScript 7 so React remains the view/runtime adapter rather than the domain layer. Use for feature/module boundaries, component composition, server-state vs client-state decisions, API adapters, forms/validation, React 19 ref/action patterns, performance boundaries, and sharing domain/application logic with a Node backend without coupling it to React.
compatibility: React 19+ (includes React 19.3 guidance) and TypeScript 7.x.
metadata:
  role: frontend-architecture
  stack: react19-typescript7
---

# React 19 Enterprise Patterns

Treat React as the view and interaction runtime. Complex business rules should live in framework-independent domain/application modules when that improves reuse/testability/change isolation.

Read `references/layering.md`, `references/state-and-data.md`, and `references/react19-notes.md`.

## Default component posture

- Prefer composition over inheritance.
- Keep presentational components narrow; feature/application hooks may orchestrate UI state and application calls.
- Do not put network clients directly throughout components; centralize boundary adapters/query functions.
- Validate server/external data at an appropriate boundary even when the API is TypeScript on both ends.
- Distinguish server/cache state from local UI state.
- Derive state rather than synchronizing redundant copies with effects.
- Do not use `useEffect` as a general-purpose workflow engine.

## Cross-stack boundary

Shared packages may contain pure schemas/types/domain rules when they genuinely have shared semantics. Do not import Node-only infrastructure into browser bundles or force backend domain entities to become React component models.
