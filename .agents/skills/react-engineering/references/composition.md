# Composition

Prefer APIs that make valid usage obvious.

Avoid components such as:

```tsx
<Card compact bordered selectable editable adminMode />
```

when those flags create unrelated state combinations. Prefer explicit variants, nested components, slots/children, or separate higher-level compositions.

Context providers should hide implementation details behind a stable interface where that improves substitution/testing.
