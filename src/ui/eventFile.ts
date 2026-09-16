/**
 * @fileoverview Stream reading, bounded replay, and live tailing of the JSONL event log file.
 * Handles partial line buffering across poll ticks, corrupted JSON lines, bounded historical
 * replays, and file descriptors safely across operating systems.
 */

import fs from 'node:fs';
import type { UiEvent } from '../types.js';

/** Default byte slice window for reading recent events (256 KB) */
export const DEFAULT_READ_MAX_BYTES = 256 * 1024;

/** Default maximum event count returned during historical replay */
export const DEFAULT_MAX_EVENTS_COUNT = 500;

/** Default polling interval in milliseconds for following active event files */
export const DEFAULT_POLL_INTERVAL_MS = 250;

/**
 * Handle returned by `followEventFile` allowing clean teardown of timers and file watchers.
 */
export interface EventFileWatcher {
  /** Stops polling and releases all internal timers and resources */
  stop(): void;
}

/**
 * Reads a bounded window of recent semantic events from an event log file.
 * If the file exceeds `maxBytes`, only the trailing slice is read, safely dropping
 * any truncated partial line at the beginning of the slice.
 *
 * @param filePath - Path to the events.jsonl file.
 * @param maxBytes - Maximum bytes to read from the end of the file.
 * @param maxCount - Maximum number of parsed events to return.
 * @returns Array of validated UiEvents sorted chronologically.
 */
export function readRecentEvents(
  filePath: string,
  maxBytes: number = DEFAULT_READ_MAX_BYTES,
  maxCount: number = DEFAULT_MAX_EVENTS_COUNT
): UiEvent[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  let fd: number | null = null;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      return [];
    }

    const startPos = Math.max(0, stat.size - maxBytes);
    const readLength = stat.size - startPos;
    const buffer = Buffer.alloc(readLength);

    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, readLength, startPos);

    let text = buffer.toString('utf8');
    // If we sliced midway into the file, drop the incomplete leading line
    if (startPos > 0) {
      const firstNewline = text.indexOf('\n');
      if (firstNewline >= 0) {
        text = text.slice(firstNewline + 1);
      }
    }

    const events: UiEvent[] = [];
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
          events.push(parsed as UiEvent);
        }
      } catch {
        // Ignore malformed or truncated JSON lines
      }
    }

    return events.slice(-maxCount);
  } catch {
    return [];
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

/**
 * Polls and tails an events.jsonl file for new appends, buffering incomplete trailing lines
 * across polling intervals so multi-chunk lines are safely reconstructed.
 *
 * @param filePath - Path to the event log file to follow.
 * @param onEvent - Callback invoked when a complete, valid semantic event is appended.
 * @param pollIntervalMs - Polling interval in milliseconds.
 * @returns An EventFileWatcher handle to stop polling.
 */
export function followEventFile(
  filePath: string,
  onEvent: (event: UiEvent) => void,
  pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS
): EventFileWatcher {
  let position = 0;
  let lineBuffer = '';
  let stopped = false;

  if (fs.existsSync(filePath)) {
    try {
      position = fs.statSync(filePath).size;
    } catch {
      position = 0;
    }
  }

  const intervalId = setInterval(() => {
    if (stopped) {
      return;
    }

    if (!fs.existsSync(filePath)) {
      return;
    }

    let fd: number | null = null;
    try {
      const stat = fs.statSync(filePath);
      // If file was truncated or rotated, reset pointer
      if (stat.size < position) {
        position = 0;
        lineBuffer = '';
      }

      if (stat.size === position) {
        return;
      }

      const bytesToRead = stat.size - position;
      const buffer = Buffer.alloc(bytesToRead);

      fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, bytesToRead, position);
      position = stat.size;

      const chunk = lineBuffer + buffer.toString('utf8');
      const lines = chunk.split(/\r?\n/);

      // The last element in the split is either empty (if ended with \n) or an incomplete partial line
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
            onEvent(parsed as UiEvent);
          }
        } catch {
          // Ignore invalid JSON lines
        }
      }
    } catch {
      // Ignore transient read errors during rapid writes
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {}
      }
    }
  }, pollIntervalMs);

  return {
    stop() {
      stopped = true;
      clearInterval(intervalId);
    }
  };
}
