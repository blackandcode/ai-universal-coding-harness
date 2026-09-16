/**
 * @fileoverview Lifecycle management and runner functions for interactive Ink UI terminal sessions.
 * Initializes the React 19 / Ink 7 application, orchestrates historical event replays,
 * manages follow-mode event tailing, and coordinates clean terminal teardown.
 */

import React from 'react';
import { EventEmitter } from 'node:events';
import { render } from 'ink';
import { App } from './App.js';
import { followEventFile, readRecentEvents } from './eventFile.js';
import { uiReducer } from './reducer.js';
import type { FollowInkUiOptions, InkUiInstance, StartInkUiOptions } from './types.js';

/**
 * Starts an in-process interactive Ink UI session connected to an active orchestration run.
 *
 * @param opts - StartInkUiOptions containing the live event emitter, event log path, and metadata.
 * @returns An InkUiInstance handle capable of unmounting the UI application.
 */
export async function startInkUi(opts: StartInkUiOptions): Promise<InkUiInstance> {
  const previous = readRecentEvents(opts.eventFile);
  const app = render(<App emitter={opts.emitter} meta={opts.meta} initialEvents={previous} />, {
    exitOnCtrlC: false
  });

  return {
    close() {
      try {
        app.unmount();
      } catch {}
    }
  };
}

/**
 * Follows and displays an existing or remote orchestration run in real-time by tailing its event log.
 *
 * @param opts - FollowInkUiOptions containing the target event log file path and metadata.
 */
export async function followInkUi(opts: FollowInkUiOptions): Promise<void> {
  const emitter = new EventEmitter();
  const previous = readRecentEvents(opts.eventFile);
  const app = render(<App emitter={emitter} meta={opts.meta} initialEvents={previous} />, {
    exitOnCtrlC: true
  });

  const watcher = followEventFile(opts.eventFile, (event) => {
    emitter.emit('event', event);
  });

  try {
    await app.waitUntilExit();
  } finally {
    watcher.stop();
    emitter.removeAllListeners();
  }
}

// Backward compatibility re-exports
export { App };
export { uiReducer as reducer };
export * from './types.js';
