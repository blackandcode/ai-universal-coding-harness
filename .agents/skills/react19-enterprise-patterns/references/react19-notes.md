# React 19 / TypeScript 7 notes

- React 19 allows `ref` as a prop for function components; avoid automatically adding `forwardRef` in new code when it is unnecessary.
- React 19 TypeScript changes include stricter ref/useRef behavior and scoped `React.JSX`; do not rely on legacy global JSX augmentation patterns.
- Use Actions/transitions where they match the framework/application interaction model, but do not move domain transaction semantics into UI primitives.
- React Compiler can reduce the need for manual memoization in configured projects. Do not add `useMemo`, `useCallback`, or `memo` reflexively; profile or follow compiler/framework requirements.
- React 19.3 makes View Transitions and Fragment Refs stable. They are UI capabilities, not architectural requirements; adopt them when they remove real DOM/layout/transition work.
