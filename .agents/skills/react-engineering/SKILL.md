---
name: react-engineering
description: Apply when creating, reviewing or refactoring React 19+ components, hooks, state, forms, async UI and performance-sensitive TSX code.
---

# React 19+ Engineering

Target React 19 or later. Prefer composition, predictable state ownership and measurable performance improvements over defensive memoization everywhere.

## Component design

- Components should express UI/domain concepts, not arbitrary file-size limits.
- Prefer composition over mode-heavy components with many boolean props.
- Use explicit variant components when variants have materially different behavior.
- Keep state close to the narrowest common owner that needs it.
- Separate application/domain logic from presentation when doing so improves testing or reuse.
- Do not mirror props into state unless there is a deliberate synchronization model.

## React 19 posture

- Prefer React 19 APIs and patterns when the repository baseline allows them.
- Do not introduce `forwardRef` solely for ref passing when React 19 ref-as-prop semantics are appropriate.
- Use `use()` where it improves integration with supported resources/context and fits the framework/runtime model; do not mechanically replace every existing hook.
- Use Actions/form action patterns when they simplify pending/error/result state for mutations.
- Treat Server Components as framework/runtime capabilities; do not assume plain React applications support an RSC architecture automatically.

## Hooks

- Hooks must obey the Rules of Hooks.
- Effects are for synchronization with external systems, not a generic mechanism to derive values.
- Derive render-time values directly when possible.
- Event-driven work belongs in event handlers rather than effects.
- Cleanup subscriptions, timers and external resources.
- Avoid unstable object/function dependencies by fixing ownership/design before suppressing lint rules.

## State

Prefer:

1. local component state;
2. lifted state when siblings need the same owner;
3. context for genuinely cross-tree concerns;
4. an external store only when the state model actually needs it.

Do not move server/cache state into generic client state stores without a concrete reason.

## Async UI

Avoid request waterfalls. Start independent work concurrently where architecture permits. Use Suspense boundaries deliberately for progressive rendering where supported by the framework/data layer.

Expose pending, success, empty and failure states intentionally.

## Performance

Prioritize:

1. eliminating network/data waterfalls;
2. reducing unnecessary shipped code;
3. improving server/data work where applicable;
4. avoiding unnecessary renders in measured hot paths;
5. micro-optimizations last.

Do not add `useMemo`, `useCallback` or `memo` automatically. React's compiler/runtime capabilities and component design may make manual memoization unnecessary; use it where identity stability or measured behavior requires it.

Avoid large barrel imports when they cause excessive bundles or slow tooling. Prefer direct imports when the dependency supports them and measurement shows a benefit.

## Accessibility

Semantic HTML and keyboard behavior are implementation requirements, not polish. Preserve labels, focus order, accessible names and appropriate status/error announcements.

## TypeScript + React

- Avoid `React.FC` as a default requirement; type props directly unless the repository standard prefers it.
- Model mutually exclusive component modes with discriminated unions.
- Type event handlers and refs precisely.
- Do not use `any` for third-party event/data boundaries; validate/narrow appropriately.
- Prefer children/composition over highly polymorphic prop bags.

## Testing

Test observable behavior. Prefer accessible queries that resemble how a user interacts with the page. Keep tests resilient to harmless DOM implementation changes.

## References

- `references/react-19.md`
- `references/performance.md`
- `references/composition.md`
- `scripts/check-react-project.mjs`
