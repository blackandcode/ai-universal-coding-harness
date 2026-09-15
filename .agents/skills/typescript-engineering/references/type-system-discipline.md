# Type-system discipline

## Prefer modeling over checking

When several booleans or nullable properties jointly describe a state machine, redesign the type rather than adding more runtime conditionals.

## Parse, then trust

Validation belongs where untrusted information enters the system. After parsing succeeds, internal code should operate on validated domain types rather than repeatedly checking raw values.

## Exhaustiveness

For closed variant sets, use discriminated unions and exhaustiveness checks. Adding a new variant should produce compile errors at code paths that require an explicit decision.

## Derived contracts

Prefer generated or schema-derived types for OpenAPI, GraphQL, database schemas and event contracts. Avoid independent handwritten copies of authoritative external schemas.

## Type complexity budget

Advanced types are justified when they prevent real classes of defects or substantially improve API ergonomics. If a type requires substantial explanation but protects little, simplify it.
