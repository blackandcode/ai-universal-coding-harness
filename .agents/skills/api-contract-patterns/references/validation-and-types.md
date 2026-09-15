# Runtime validation and TypeScript

TypeScript disappears at runtime. A generated/static TypeScript interface does not validate JSON.

Choose one source-of-truth strategy per contract:

- runtime schema -> inferred TypeScript types;
- OpenAPI/JSON Schema -> generated types/client + runtime validator;
- code-first contract library -> generated schema and types.

Avoid maintaining several independent representations by hand.

Validate at boundaries and normalize once. Application code should receive a stable internal type after validation.

Keep transport optionality distinct from domain optionality. For example, an omitted PATCH field is not the same semantic concept as a nullable domain property.
