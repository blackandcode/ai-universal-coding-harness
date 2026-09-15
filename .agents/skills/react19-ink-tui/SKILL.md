---
name: react19-ink-tui
description: Implement or refactor the AI Harness terminal UI with React 19+ and Ink 7+, using semantic harness events without moving orchestration logic into components. Use when changing Ink components, terminal layout, keyboard interaction, progress/status rendering, live event display, terminal resize behavior, or TUI tests. Do not use browser/DOM assumptions or make UI state authoritative for run correctness.
compatibility: React 19+; Ink 7+; TypeScript 7.x; Node.js 24.18+.
metadata:
  role: terminal-ui
---

# React 19 + Ink TUI

Ink is a React renderer for terminal applications. The architecture is still CLI/event-driven, not browser UI architecture.

Read:

- `references/react19-typescript7.md`
- `references/ink-architecture.md`
- `references/terminal-interaction.md`
- `references/testing-tui.md`

## Core boundary

The UI consumes semantic run events/state produced by core orchestration. It may maintain presentation-only state, but orchestration correctness must survive with no Ink renderer attached.

## Component posture

- keep components focused on presentation/interaction;
- derive display state rather than duplicating authoritative run state;
- use reducers/discriminated unions when presentation state itself has meaningful modes;
- avoid `useEffect` as a workflow engine;
- do not parse provider-specific raw ACP/Codex data in components;
- do not let rendering block protocol/process handling.

## Terminal posture

Design for small/large terminals, non-interactive CI, redirected output, Unicode/ANSI behavior, and stable raw logs separate from dynamic TUI rendering.
