# Terminal UI

Interactive terminal presentations are built using React 19 and Ink 7. The dashboard dynamically adapts to terminal dimensions and enforces strict vertical height budgets to eliminate console jitter and screen bouncing.

The full executor focus and thought stream is persisted to disk in each stage's `executor-focus.log`; the primary dashboard renders a compact, stable preview with interactive full-screen inspection available on demand.

## UI architecture and semantic event flow

```mermaid
flowchart TD
  subgraph EventSources [1. Event Producers]
    ACP[Cursor ACP Protocol Stream: message, thought, tool calls] --> Norm[AcpEventNormalizer]
    Orch[Orchestrator: run, stage, phase shifts] --> Bus[EventBus]
    Qual[Quality Gate: PASS / FAIL results] --> Bus
    Rev[Codex Reviewer: verdicts & feedback] --> Bus
    Norm --> Bus
  end

  subgraph EventDispatch [2. Normalization & Persistence]
    Bus --> DiskEvents[Disk: events.jsonl]
    Bus --> DiskFocus[Disk: executor-focus.log]
    Bus --> InProcess[In-Process UiEvent Stream]
  end

  subgraph StateAndSelectors [3. State Management & Selectors]
    InProcess --> Reducer[uiReducer: Pure State Reducer]
    Reducer --> State[UiState: tokens, tools, todos, logs, phase]
    State --> Selectors[Derived Selectors: layout, progress, focus, tools]
  end

  subgraph Presentation [4. React 19 / Ink 7 Presentation]
    Selectors --> LayoutEngine[calculateDashboardLayout]
    LayoutEngine --> Dashboard[Main Fixed-Height Dashboard]
    Dashboard --> Header[Header: stage, branch, phase icons, progress bar]
    Dashboard --> FocusPrev[FocusPreview: bounded recent thought stream]
    Dashboard --> Activity[ToolActivity: recent messages, active tools, quality status]
    Dashboard --> Footer[Footer: navigation shortcuts & reviewer calls]

    LayoutEngine --> Modals[Interactive Modal Overlays]
    Modals --> FocusModal[f: FocusPanel - full scrollable thought stream]
    Modals --> TodoModal[t: TodoPanel - executor task list]
    Modals --> ChangesModal[d: ChangesPanel - modified file list]
    Modals --> LogsModal[l: LogsPanel - recent logs & errors]
  end
```

## Interactive Panels

The dashboard supports live hotkeys during execution:

| Key      | Mode / Action  | Description                                                                        |
| :------- | :------------- | :--------------------------------------------------------------------------------- |
| `f`      | Focus Stream   | Opens full scrollable agent thought and reasoning stream with follow/pause toggles |
| `t`      | Todos          | Displays the executor's task plan and completion statuses                          |
| `d`      | Changed Files  | Lists files modified during the current stage                                      |
| `l`      | Logs           | Displays recent runtime log messages, tool failures, and warnings                  |
| `q`      | Quiet Mode     | Toggles minimal one-line status bar to minimize terminal consumption               |
| `Esc`    | Main Dashboard | Exits any open modal overlay and returns to the primary multi-panel dashboard      |
| `Ctrl+C` | Abort          | Gracefully aborts current turn and persists state before exiting                   |

## Non-Interactive & CI Modes

The UI subsystem detects non-interactive terminals (e.g. CI runners or redirected stdout) and falls back gracefully:

- **`--ui line`**: Emits concise single-line phase and quality milestone summaries formatted for CI build output.
- **`--ui raw`**: Emits unformatted JSONL event lines for machine consumption or external ingestion.
- **Audit Logs**: Raw ACP and reviewer JSONL logs are always retained on disk under `.ai-orchestrator/runs/<run-id>/` for retrospective analysis regardless of display mode.
