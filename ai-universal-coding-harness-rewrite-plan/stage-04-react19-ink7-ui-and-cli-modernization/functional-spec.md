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

### Documentation and docblock standards

- **Top-of-file descriptions**: Every file added or modified (TSX components, reducer, selectors, event tailing, CLI presentation) must begin with a descriptive top-level docblock explaining the file's purpose, role in the UI architecture, and rendering responsibilities.
- **Cross-stage header maintenance**: When editing an existing file to add or modify functionality, update the top-level docblock description to reflect the additions and current module scope.
- **Docblock coverage for code constructs**: All React components, custom hooks, helper functions, classes, interfaces (especially component prop interfaces and action/state types), and type definitions must have comprehensive JSDoc/TSDoc docblocks.
- **Internal logic documentation**: Provide docblocks and explanatory comments for internal logic where possible (reducer transitions, event-stream tailing and partial line handling, viewport slicing, focus tracking, terminal dimension bounds, and keyboard shortcuts). Avoid trivial line-by-line JSX narration.

## Acceptance criteria

- no broad `any` in UI state/components;
- UI is TSX;
- `ink-testing-library` verifies real render output;
- reducers/selectors are independently unit-tested;
- dashboard remains within terminal height contract;
- no orchestration decisions occur in UI modules;
- all added or edited files contain descriptive top-of-file docblocks, with existing file headers updated to reflect new functionality;
- all components, functions, classes, interfaces, types, and complex internal logic have thorough docblock and explanatory documentation.
