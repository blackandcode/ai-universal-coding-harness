# CQRS

CQRS separates the model/path used to change state from the model/path used to answer queries.

## Levels

CQRS does not require two databases.

1. Separate command/query handlers in one application.
2. Separate write and read models in one database.
3. Separate projection/read store updated asynchronously.
4. Distributed read/write services only when needed.

Choose the lowest level that solves the problem.

## Good forces

- highly different read/write shapes;
- expensive joins/read scaling;
- domain-rich writes but simple denormalized reads;
- separate authorization or performance models;
- projections from an event stream.

## Costs

- model duplication;
- eventual consistency;
- projection lag/rebuild logic;
- more operational surfaces.
