# Hexagonal boundaries for Node + TypeScript

## Inbound adapters

Examples:

- Fastify/Express/HTTP route
- message consumer
- CLI command
- cron/scheduler
- GraphQL resolver
- React Server Function/server action if used in the chosen framework

Inbound adapters translate transport concerns into application inputs. They should not contain core business policy.

## Application layer

Owns use-case orchestration:

- authorization decisions tied to application use cases;
- transaction orchestration;
- loading/saving aggregates through ports;
- invoking domain behavior;
- publishing domain/integration events through abstract capabilities;
- returning application results independent of HTTP status codes.

## Domain layer

Owns business rules that remain meaningful without Node, HTTP, SQL, React, or a message broker.

## Outbound ports

Define capabilities in terms the application/domain understands:

```ts
export interface CustomerRepository {
  findById(id: CustomerId): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
}
```

Do not expose ORM query builders as the port unless persistence is intentionally part of the contract.

## Adapters

Adapters translate between a port and a concrete technology. They own vendor SDK peculiarities, SQL/ORM mapping, retry instrumentation, and transport details.

## Dependency injection

Prefer explicit composition at the application entry point. A framework DI container is optional. Avoid service-locator calls from domain/application code.

A simple composition root is often enough:

```ts
const customerRepository = new PostgresCustomerRepository(db);
const createCustomer = new CreateCustomer({ customerRepository, clock, idGenerator });
const app = createHttpApp({ createCustomer });
```

The value is explicit dependency direction, not a specific DI library.
