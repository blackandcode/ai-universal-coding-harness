# React application layering

A large React application can follow the same dependency principles as backend architecture:

```text
routes/screens
    |
feature UI + feature controllers/hooks
    |
application/domain modules
    |
ports/query interfaces
    ^
    |
HTTP/storage/browser adapters
```

This is not a requirement to create five folders for every button. Apply layering where business/data interaction complexity warrants it.

## Feature modules

Organize around user/business capabilities, not only technical component categories. Keep a feature's UI, tests, schemas, data adapter, and feature-level application code close when that improves locality.

## Design system

Shared visual primitives belong in a design-system/UI package. Business feature components should compose them without pushing business semantics down into generic primitives.
