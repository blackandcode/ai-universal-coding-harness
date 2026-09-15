# Functional Specification — Stage 04: React 19 / Ink 7 UI and CLI Modernization

## Objective

Rewrite the presentation layer into readable, typed React 19 + Ink 7 TSX while
preserving the zero-jitter terminal design and keeping UI state separate from
orchestration truth.

## Current problem

`src/ui/InkUi.ts` currently combines:

- semantic state shape;
- reducer;
- formatting helpers;
- file tailing;
- event replay;
- terminal keyboard handling;
- all components;
- focus viewer;
- list panels;
- main dashboard;

and expresses much of it through nested `React.createElement`.

This makes React 19/Ink 7 maintenance harder than necessary.

## Required outcomes

### TSX

Rename/build UI as `.tsx`.

Use the modern JSX transform.

### Module separation

Suggested structure:

```text
src/ui/
├── types.ts
├── reducer.ts
├── selectors.ts
├── text.ts
├── eventFile.ts
├── InkUi.tsx
├── App.tsx
└── components/
    ├── Header.tsx
    ├── FocusPreview.tsx
    ├── FocusPanel.tsx
    ├── TodoPanel.tsx
    ├── ChangesPanel.tsx
    ├── LogsPanel.tsx
    ├── ToolActivity.tsx
    └── Footer.tsx
```

Exact file names may differ.

### Typed semantic events

UI consumes typed semantic events such as:

```text
run.started
stage.started
executor.tool
executor.focus.delta
reviewer.plan
quality.result
review.result
stage.committed
```

Do not pass raw ACP/Codex payloads to components.

### Stable layout

Preserve:

- normal/compact/minimal layouts;
- bounded main dashboard height;
- no console bounce caused by dynamically growing sections;
- full focus stream in dedicated panel;
- fixed main focus preview;
- quiet mode;
- todos/changes/logs/focus panels.

### Keyboard behavior

Unit/integration test:

- `f`
- `t`
- `d`
- `l`
- `q`
- `Esc`
- focus scrolling keys

### Comments

Document terminal-layout invariants and event/reducer design.

Do not comment normal JSX line by line.

## Acceptance criteria

- no broad `any` in UI state/components;
- UI is TSX;
- `ink-testing-library` verifies real render output;
- reducers/selectors are independently unit-tested;
- dashboard remains within terminal height contract;
- no orchestration decisions occur in UI modules.
