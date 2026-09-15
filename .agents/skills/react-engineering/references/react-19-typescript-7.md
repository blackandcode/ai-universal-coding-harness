# React 19 typing under TypeScript 7

## Modern JSX transform

React 19 requires the modern JSX transform. In TypeScript-owned JSX emission use `jsx: react-jsx` (or `react-jsxdev` for the relevant development pipeline). Frameworks that preserve JSX may use `jsx: preserve`, provided their build stage applies the modern transform.

## Scoped JSX

React 19 no longer wants a globally polluted `JSX` namespace. Use `React.JSX` in types and module-scoped augmentation.

For automatic runtime augmentation:

```ts
declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'my-element': { value?: string };
    }
  }
}
```

Use the module matching the project's configured JSX runtime.

## Refs

React 19:

- permits `ref` as a prop on function components;
- supports cleanup functions returned by ref callbacks;
- requires an initial argument for `useRef`;
- makes ref objects mutable in the React 19 type model;
- deprecates old `MutableRefObject` assumptions.

For reusable DOM component props, derive native props when practical:

```tsx
type ButtonProps = React.ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary';
};
```

This naturally tracks React 19 DOM/ref typing better than manually duplicating dozens of attributes.

## ReactElement

`ReactElement` without an explicit prop parameter has `unknown` props. This is intentional type safety. Do not cast back to `any` merely to preserve old element introspection patterns.

## Reducers

Prefer inference from a well-typed reducer:

```ts
type Action =
  | { type: 'increment' }
  | { type: 'reset'; value: number };

function reducer(state: State, action: Action): State {
  // ...
}

const [state, dispatch] = useReducer(reducer, initialState);
```

## TS7 `types: []`

React's imported module types still resolve through imports/JSX runtime, but global environment types no longer appear accidentally.

Explicitly add environment globals that are genuinely required:

- `vite/client` for Vite client globals/asset typing;
- `node` for Node-side config/build files in a separate Node tsconfig;
- test runner globals only in the test config if globals are enabled.

Keep browser, Node, and test environments separated when possible.

## Exact optional properties

With `exactOptionalPropertyTypes`, distinguish “prop omitted” from “prop explicitly set to undefined”. This often makes component contracts more accurate but can expose old patterns that pass `undefined` mechanically.

Prefer conditional prop construction or types that intentionally include `undefined` when that is part of the API.
