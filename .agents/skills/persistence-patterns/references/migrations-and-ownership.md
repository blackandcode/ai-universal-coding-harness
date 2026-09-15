# Schema migrations and ownership

- Make schema changes compatible with rolling deployments when zero-downtime deployment matters.
- Use expand -> migrate/backfill -> switch readers/writers -> contract/remove for breaking schema evolution.
- Separate schema deployment from large data backfills when operational risk requires it.
- A module/service owns authoritative writes to its tables/schema.
- Cross-context reporting can use read replicas, ETL/warehouse, explicit projections, or owned query APIs rather than ungoverned cross-service writes.
- Migration scripts are production code: review, test, observe, and make recovery/rollback strategy explicit.
