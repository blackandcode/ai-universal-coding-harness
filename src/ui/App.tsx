/**
 * @fileoverview Root React 19 / Ink 7 application component and interactive keyboard router.
 * Subscribes to semantic UiEvents, manages navigation view panels (main, focus, todos, changes, logs),
 * tracks terminal dimension boundaries, and coordinates zero-jitter layout rendering.
 */

import React, { useEffect, useReducer, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { EventEmitter } from 'node:events';
import type { UiEvent } from '../types.js';
import { dashboardLayout } from './layout.js';
import { createInitialUiState, uiReducer } from './reducer.js';
import { selectActiveTask, selectFocusContent, selectTodoProgress } from './selectors.js';
import { truncateText } from './text.js';
import type { UiMeta, UiPanel } from './types.js';
import { Header } from './components/Header.js';
import { FocusPreview } from './components/FocusPreview.js';
import { ToolActivity } from './components/ToolActivity.js';
import { Footer } from './components/Footer.js';
import { FocusPanel } from './components/FocusPanel.js';
import { TodoPanel } from './components/TodoPanel.js';
import { ChangesPanel } from './components/ChangesPanel.js';
import { LogsPanel } from './components/LogsPanel.js';

/**
 * Properties for rendering the App root component.
 */
export interface AppProps {
  /** Event emitter transmitting live in-process UI events */
  readonly emitter?: EventEmitter;
  /** Initial runner metadata */
  readonly meta?: UiMeta;
  /** Replayed historical events from previous runs or log files */
  readonly initialEvents?: readonly UiEvent[];
}

/**
 * Root interactive terminal application managing display state, viewport slicing,
 * keyboard navigation, and layout dispatch.
 *
 * @param props - AppProps configuration.
 * @returns React.JSX.Element
 */
export function App({ emitter, meta = {}, initialEvents = [] }: AppProps): React.JSX.Element {
  const [state, dispatch] = useReducer(uiReducer, undefined, () => {
    let s = createInitialUiState(meta);
    for (const e of initialEvents) {
      s = uiReducer(s, e);
    }
    return s;
  });

  const [panel, setPanel] = useState<UiPanel>('main');
  const [quiet, setQuiet] = useState<boolean>(false);
  const [focusOffset, setFocusOffset] = useState<number>(0);
  const [follow, setFollow] = useState<boolean>(true);

  const { stdout } = useStdout();
  const rows = stdout?.rows || 24;
  const width = stdout?.columns || 120;
  const layout = dashboardLayout(rows, meta.dashboardMaxRows || 26);
  const maxRows = layout.maxRows;
  const minimal = layout.mode === 'minimal';

  useEffect(() => {
    if (!emitter) {
      return;
    }
    const handler = (event: UiEvent) => {
      dispatch(event);
    };
    emitter.on('event', handler);
    return () => {
      emitter.off('event', handler);
    };
  }, [emitter]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      process.kill(process.pid, 'SIGINT');
      return;
    }

    if (input === 'f') {
      setPanel((prev) => (prev === 'focus' ? 'main' : 'focus'));
      setFollow(true);
      setFocusOffset(0);
      return;
    }

    if (input === 't') {
      setPanel((prev) => (prev === 'todos' ? 'main' : 'todos'));
      return;
    }

    if (input === 'd') {
      setPanel((prev) => (prev === 'changes' ? 'main' : 'changes'));
      return;
    }

    if (input === 'l') {
      setPanel((prev) => (prev === 'logs' ? 'main' : 'logs'));
      return;
    }

    if (input === 'q') {
      setQuiet((prev) => !prev);
      return;
    }

    if (key.escape) {
      setPanel('main');
      return;
    }

    if (panel === 'focus') {
      if (key.upArrow) {
        setFollow(false);
        setFocusOffset((prev) => prev + 1);
      } else if (key.downArrow) {
        setFocusOffset((prev) => Math.max(0, prev - 1));
      } else if (key.pageUp) {
        setFollow(false);
        setFocusOffset((prev) => prev + Math.max(3, maxRows - 5));
      } else if (key.pageDown) {
        setFocusOffset((prev) => Math.max(0, prev - Math.max(3, maxRows - 5)));
      } else if (key.end) {
        setFollow(true);
        setFocusOffset(0);
      } else if (key.home) {
        setFollow(false);
        setFocusOffset(999999);
      }
    }
  });

  // Quiet Mode View
  if (quiet) {
    return (
      <Box height={maxRows} paddingX={1}>
        <Text color="cyan">{`◐ ${state.currentStage || state.status} · q restore`}</Text>
      </Box>
    );
  }

  const focusContent = selectFocusContent(state.focusFile, state.focusText);

  // Modal Panel Views
  if (panel === 'focus') {
    return (
      <FocusPanel
        text={focusContent}
        height={maxRows}
        width={width}
        offset={focusOffset}
        follow={follow}
      />
    );
  }

  if (panel === 'todos') {
    return <TodoPanel todos={state.todos} height={maxRows} />;
  }

  if (panel === 'changes') {
    return <ChangesPanel changedFiles={state.changedFiles} height={maxRows} />;
  }

  if (panel === 'logs') {
    return <LogsPanel logs={state.logs} height={maxRows} />;
  }

  // Dashboard Row Budgeting
  const headerH = Math.min(layout.headerRows, maxRows - 1);
  const focusH = Math.min(layout.focusRows, Math.max(0, maxRows - headerH - layout.footerRows));
  const taskH = Math.min(
    layout.taskRows,
    Math.max(0, maxRows - headerH - focusH - layout.footerRows),
  );
  const footerH = layout.footerRows;
  const bodyH = Math.max(1, maxRows - headerH - focusH - taskH - footerH);

  const activeTask = selectActiveTask(state.todos);
  const todoProgress = selectTodoProgress(state.todos);

  return (
    <Box height={maxRows} flexDirection="column" paddingX={1}>
      <Header
        status={state.status}
        meta={state.meta}
        currentStage={state.currentStage}
        stageIndex={state.stageIndex}
        stageTotal={state.stageTotal}
        attempt={state.attempt}
        phase={state.phase}
        height={headerH}
        width={width}
      />

      {focusH > 0 ? <FocusPreview text={focusContent} height={focusH} width={width} /> : null}

      {taskH > 0 ? (
        <Box height={taskH}>
          <Text color={activeTask ? 'cyan' : 'gray'}>
            {activeTask
              ? `▶ ${truncateText(activeTask.content || activeTask.title || '', width - 24)} (${todoProgress.done}/${todoProgress.total})`
              : todoProgress.total > 0
                ? `✓ Todos ${todoProgress.done}/${todoProgress.total}`
                : '· No active todo'}
          </Text>
        </Box>
      ) : null}

      <ToolActivity
        messages={state.messages}
        tools={state.tools}
        toolOrder={state.toolOrder}
        quality={state.quality}
        height={bodyH}
        width={width}
      />

      <Footer height={footerH} minimal={minimal} reviewerCalls={state.tokens.calls} />
    </Box>
  );
}
