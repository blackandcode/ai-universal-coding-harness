# Repositories, data mappers, and queries

## Repository

Repository interfaces are strongest around aggregate/business retrieval intent:

```ts
interface OrderRepository {
  get(orderId: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
```

Do not force reporting/search screens through aggregate repositories when they need projections/joins optimized for reading.

## Query object / read model

Use explicit query services/objects for complex read requirements. Return dedicated read DTOs rather than hydrating rich aggregates only to display data.

## Data mapper

Infrastructure translates between persistence representation and domain objects. This prevents ORM metadata/state from becoming the domain API.

## Active Record

Can be appropriate for simple modules where domain and persistence are intentionally close. Do not reject it dogmatically; understand that it couples model and persistence and becomes limiting in richer domains.
