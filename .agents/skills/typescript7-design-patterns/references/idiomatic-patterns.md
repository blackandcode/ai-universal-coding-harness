# Idiomatic classic patterns in TypeScript

## Strategy

Often a function is enough:

```ts
type PricingStrategy = (cart: Cart) => Money;
```

Use an interface/object when the strategy has multiple operations or dependencies.

## Adapter

Use at framework/vendor boundaries to translate one contract into an application-owned port. This is one of the most important enterprise patterns for TypeScript services.

## Factory

Use when construction requires policy, validation, subtype selection, or dependency wiring. Do not wrap a trivial constructor just to say “factory.”

## Decorator

Function wrapping is often cleaner than class inheritance:

```ts
const withMetrics = (next: Handler): Handler => async input => {
  const started = performance.now();
  try { return await next(input); }
  finally { recordDuration(performance.now() - started); }
};
```

Useful for logging, metrics, authorization, caching, retry policy, and tracing when ordering is explicit.

## Command

Use a command object when an operation needs a named contract, queueing/serialization, auditing, authorization, or independent handler. Do not create command classes for private one-line function calls.

## State

Use discriminated unions first. Use State objects/classes when state-specific behavior is large enough to justify polymorphism.

## Observer / publish-subscribe

Inside one process, an event emitter can decouple optional reactions. Across process boundaries, use a durable broker and integration-event contract. Do not confuse an in-memory observer with reliable messaging.

## Facade

Expose a stable module API that hides several internal collaborators. This works especially well as the public surface of a bounded context/module.

## Composite

Useful for tree-like structures and policy/rule evaluation. Keep recursive types explicit and validate external tree input.

## Builder

Useful for tests, complex immutable configuration, or construction with many optional stages. Normal object literals are preferable for simple data.

## Chain of responsibility / middleware

Node frameworks commonly implement this as middleware/interceptors. Keep cross-cutting concerns out of domain logic and make execution order obvious.
