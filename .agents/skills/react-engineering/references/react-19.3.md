# React 19.3 reference

React 19.3 is the current React 19 guidance baseline for this skill collection.

## Stable features worth knowing

### View Transitions

`<ViewTransition>` is stable in React 19.3. Use it for transitions tied to React updates when the product needs animated enter/exit/move/resize behavior. Do not replace simple CSS transitions without reason.

### Fragment Refs

Fragment refs are stable in 19.3 and expose a `FragmentInstance` for DOM operations across first-level Fragment children. Use them when a logical component renders sibling DOM nodes and adding a wrapper would be semantically/layout-wise harmful.

Do not use Fragment refs as a substitute for normal component APIs or state.

### Browser-only suspension

React DOM 19.3 adds a browser resource pattern usable with `use(...)` for opting parts of a supported SSR tree out of server rendering. This is runtime/framework-sensitive. Do not introduce it into client-only applications or frameworks with a different recommended mechanism.

### Trusted Types

React 19.3 supports Trusted Types objects without coercing them to plain strings at DOM injection sinks. Applications enforcing a Trusted Types CSP should integrate with their security policy rather than bypassing it.

## Version discipline

A library targeting `react >=19` cannot assume every consumer has 19.3-only APIs. If the library uses 19.3 APIs, set the peer dependency/compatibility contract accordingly or provide a feature-safe fallback.
