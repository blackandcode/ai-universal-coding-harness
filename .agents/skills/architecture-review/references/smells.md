# Architecture smells

High-value smells in Node/TypeScript enterprise systems:

- `controllers/ services/ repositories/` global folders with no business module ownership;
- domain files importing Fastify/Express/Nest/ORM/vendor SDKs;
- every class has an interface even when there is no boundary/variation;
- generic CRUD repositories for every table;
- direct `process.env` reads across business code;
- external JSON typed with `as SomeType` rather than validated;
- nested remote calls without timeout or cancellation budget;
- unbounded `Promise.all` on variable-size inputs;
- DB transaction held across remote network calls;
- event publication immediately after commit without outbox despite correctness requirement;
- consumers not idempotent;
- microservices sharing a database schema and release cadence;
- CQRS/event sourcing introduced without read/write/history forces;
- React components containing domain calculations or direct vendor API details;
- tests mocking the ORM/HTTP client so deeply that no real adapter contract is exercised;
- architecture documented but not checked by code/CI.
