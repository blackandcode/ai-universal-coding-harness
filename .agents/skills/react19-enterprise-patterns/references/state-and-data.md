# State and data boundaries

## Local UI state

Use React state/reducer for transient interaction state owned by the component tree.

## Server state

Use the framework/data library's caching/query primitives when data is remote, asynchronous, invalidated, refetched, and shared. Do not manually duplicate a server cache into global client state without a reason.

## Domain/application state

Complex client-side workflows can use a reducer/state machine/application service independent of rendering. Model finite workflow states with TypeScript discriminated unions.

## URL state

Filters, pagination, selected tab/entity, and shareable navigation state often belong in URL/router state rather than hidden component/global state.

## Form state

Validate at the user interaction boundary for feedback, but the server remains authoritative for security/business validation.
