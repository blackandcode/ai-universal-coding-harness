---
name: react-engineering
description: Apply to React 19+ / React 19.3 TSX work. Covers TypeScript 7 configuration and React typing changes, modern refs/JSX, state/composition, Actions, Suspense, React Compiler, performance, accessibility, testing, and library compatibility.
---

# React 19.3 + TypeScript 7 Engineering

React and TypeScript configuration are one system. Do not apply old React TypeScript patterns that conflict with React 19 types or TS7 project defaults.

## Baseline

- React 19+; current guidance aligned with React 19.3.
- TypeScript 7 is preferred.
- Use current `@types/react` and `@types/react-dom` matching the React major when the project uses DefinitelyTyped packages.
- React 19 requires the modern JSX transform.
- For bundler-owned apps, prefer TS7 `module: Preserve` + `moduleResolution: Bundler` unless the framework specifies another model.

## React-specific TS7 configuration

A typical Vite-style React app:

```json
{
  "compilerOptions": {
    "target": "ES2025",
    "module": "Preserve",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "types": ["vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "noUncheckedSideEffectImports": true
  }
}
```

Do not put Node/test globals into the browser tsconfig unless browser source actually needs them. Prefer separate configs for app, Node tooling, and tests.

## React 19 TypeScript rules

### `ref` is a prop for function components

New function components usually do not need `forwardRef` solely to forward a ref.

```tsx
type InputProps = React.ComponentProps<'input'> & {
  ref?: React.Ref<HTMLInputElement>;
};

function Input({ ref, ...props }: InputProps) {
  return <input ref={ref} {...props} />;
}
```

Do not mechanically rewrite third-party or compatibility components if their public API requires `forwardRef`, but do not introduce it by default for new React 19-only components.

### Callback refs can return cleanup functions

Avoid accidental implicit returns:

```tsx
// Avoid: assignment expression is returned.
<div ref={(node) => (instance = node)} />

// Prefer.
<div ref={(node) => { instance = node; }} />
```

### `useRef` requires an initial argument

Use `useRef(null)` or `useRef(undefined)` intentionally. React 19's `RefObject` model is mutable; do not carry old `MutableRefObject` assumptions into new code.

### `ReactElement` props default to `unknown`

Do not introspect arbitrary element props unsafely. If element props genuinely need to be inspected, parameterize the element type or narrow explicitly.

### JSX namespace is scoped

Do not add global `namespace JSX` augmentations for React 19. Use `React.JSX` or augment the module matching the configured JSX runtime (`react`, `react/jsx-runtime`, or `react/jsx-dev-runtime`).

### `useReducer` favors inference

Prefer:

```tsx
const [state, dispatch] = useReducer(reducer, initialState);
```

Annotate reducer parameters/public types where inference needs help instead of forcing the old `React.Reducer<...>` type argument pattern.

## Component design

- Components should model UI/domain concepts, not arbitrary size limits.
- Prefer composition over components controlled by many boolean mode props.
- Use discriminated prop unions for mutually exclusive variants.
- Keep state in the narrowest owner that requires it.
- Do not mirror props into state without an explicit synchronization model.
- Keep server/cache state in its data layer rather than duplicating it into generic client stores.

## Effects

Effects synchronize React with external systems. They are not the default place for derived state or event logic.

- Derive values during render when possible.
- Put user-driven operations in event handlers/actions.
- Clean up subscriptions/resources.
- Fix unstable ownership/dependencies rather than disabling Hooks lint rules.

## Actions and async UI

Use React 19 Actions/form patterns when they simplify mutation pending/error/result state. Do not wrap ordinary synchronous state changes in Actions unnecessarily.

Avoid request waterfalls. Start independent work concurrently in the data layer/framework. Use Suspense boundaries where the data/runtime architecture actually supports suspension.

Explicitly design pending, success, empty, error, and retry states.

## React Compiler

React Compiler is compatible with React 19 and can remove much manual memoization pressure.

When the repository enables React Compiler:

- write components according to the Rules of React;
- do not add `useMemo`, `useCallback`, or `memo` by reflex;
- preserve manual memoization when identity semantics are part of an API or measurement proves it is needed;
- use compiler diagnostics/lint integration instead of guessing whether code can be optimized;
- library authors may compile library output, but must test published output and version compatibility.

When React Compiler is not enabled, still do not memoize everything. Measure meaningful render costs.

## React 19.3 features

React 19.3 stabilizes APIs including View Transitions and Fragment Refs. Use them when they solve an actual product/UI problem; do not treat them as mandatory modernization chores.

Server/client APIs such as browser-only suspension or Server Component behavior depend on the runtime/framework. Do not assume a plain React/Vite app has an RSC environment.

## Performance order

Optimize in this order:

1. network/data waterfalls;
2. unnecessary shipped code;
3. expensive server/data work;
4. unnecessary renders in measured hot paths;
5. micro-optimizations.

Prefer direct imports if a library's barrel exports materially harm bundle/tool performance. Verify with tooling rather than applying this universally.

## Security and trusted HTML

Avoid `dangerouslySetInnerHTML` unless content has a defined sanitization/trust policy. React 19.3 can work with browser Trusted Types; use them where the application enforces Trusted Types/CSP rather than coercing trusted objects back into unsafe strings.

## Accessibility

Semantic HTML, labels, keyboard interaction, focus management, accessible names, and status/error announcements are implementation requirements.

## Testing

Test observable behavior through accessible interactions. React 19 deprecates `react-test-renderer`; prefer Testing Library-style component tests or appropriate integration/E2E tests.

Keep typechecking separate from test execution unless the test runner truly uses the TS7 checker.

## References

- `references/react-19-typescript-7.md`
- `references/react-19.3.md`
- `references/react-compiler.md`
- `references/performance.md`
- `references/composition.md`
- `../typescript-engineering/references/tooling-compatibility.md`
- `scripts/check-react-project.mjs`
