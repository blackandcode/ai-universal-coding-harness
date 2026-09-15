# Domain events and integration events

## Domain event

A fact that occurred inside a bounded context and is meaningful to its domain model. It can coordinate local reactions without immediately becoming a public cross-system contract.

## Integration event

A versioned contract published for other bounded contexts/systems. It should be stable, intentionally shaped, observable, and compatible with asynchronous delivery semantics.

Do not expose internal domain objects directly as integration messages.

## Publication

When a state change and external event must not diverge, persist the state change and an outbox record in the same transaction, then publish asynchronously. See `enterprise-integration`.

## Naming

Name events as completed facts (`OrderPlaced`, `PaymentCaptured`) rather than commands (`PlaceOrder`) or vague technical notifications (`OrderUpdated`).
