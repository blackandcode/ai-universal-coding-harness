# Type-driven design

## Make invalid states harder to represent

Instead of independent booleans:

```ts
type PaymentState =
  | { kind: 'pending' }
  | { kind: 'authorized'; authorizationId: string }
  | { kind: 'captured'; receiptId: string }
  | { kind: 'failed'; reason: PaymentFailure };
```

This makes state transitions explicit and supports exhaustive handling.

## Semantic identifiers

For large domains, prevent accidental ID mixing with branded/opaque patterns:

```ts
declare const CustomerIdBrand: unique symbol;
export type CustomerId = string & { readonly [CustomerIdBrand]: true };
```

Create the value through a validated constructor/parser; do not scatter `as CustomerId` assertions.

## Value objects

Use a small immutable value type when a concept has validation/normalization/behavior, such as Money, EmailAddress, Percentage, DateRange, or SKU.

Do not create classes for every primitive. The pattern pays off when the concept carries invariants or behavior.

## Boundary parsing

```ts
function parseCreateOrder(input: unknown): CreateOrderInput {
  return CreateOrderSchema.parse(input); // schema library chosen by project
}
```

After parsing, application/domain code should receive trusted domain/application types rather than rechecking raw transport fields everywhere.

## State transitions

Prefer functions/methods that encode permitted transitions instead of arbitrary property mutation.

```ts
function capture(state: AuthorizedPayment): CapturedPayment {
  // invariant checks here
}
```

Where runtime identity matters, an aggregate/entity class can encapsulate transitions instead.
