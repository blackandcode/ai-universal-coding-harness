# Modular monolith pattern

## Desired properties

Each business module should have:

```text
src/modules/<module>/
  domain/             # business concepts and invariants
  application/        # use cases, commands, queries, ports
  infrastructure/     # DB, queue, vendor, filesystem adapters
  interface/          # HTTP/RPC/message adapters if locally owned
  public.ts           # intentional public module surface
```

The exact names may change. The invariants matter more than the folders.

## Rules

- Other modules import only a module's public surface.
- Do not import another module's ORM entities/tables/internal handlers.
- Cross-module writes happen through the owning module's use case or explicit integration contract.
- Prefer ownership by business capability rather than technical folders such as one global `controllers/`, `services/`, `repositories/` tree.
- A database can be physically shared while tables/schemas remain logically owned by modules.
- Avoid cross-module joins that make one module dependent on another module's private schema. For reporting, introduce explicit read models where justified.
- Module boundaries should be enforceable with lint rules, package/workspace exports, or architecture tests.

## Extraction path

A good modular monolith makes later service extraction possible without assuming extraction will happen:

1. stabilize the module API;
2. remove private cross-module imports;
3. establish data ownership;
4. replace in-process calls with a port if a remote boundary is actually needed;
5. add contract tests;
6. only then move execution/deployment out of process.
