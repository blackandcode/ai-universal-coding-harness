/**
 * @fileoverview Pure selectors for deriving display models and viewport slices from UiState.
 * Extracts active tasks, progress ratios, formatted lists, and scroll-offset focus viewports
 * without mutating state or triggering side effects.
 */

import fs from 'node:fs';
import {
  PHASES,
  type PhaseName,
  type UiLogEntry,
  type UiMessage,
  type UiPhaseMap,
  type UiTodo,
  type UiTool,
} from './types.js';
import { normalizeOneLine, wrapText } from './text.js';

/**
 * Todo completion metrics for stage task tracking.
 */
export interface TodoProgress {
  /** Count of completed todo tasks */
  readonly done: number;
  /** Count of non-cancelled todo tasks */
  readonly total: number;
  /** Ratio of completion between 0.0 and 1.0 */
  readonly ratio: number;
}

/**
 * Progression metrics across the five orchestration phases.
 */
export interface PhaseProgress {
  /** Number of phases marked completed */
  readonly done: number;
  /** Whether an active phase is currently executing */
  readonly active: boolean;
  /** Ratio of completion from 0.0 to 1.0 */
  readonly ratio: number;
  /** Formatted integer percentage between 0 and 100 */
  readonly percent: number;
}

/**
 * Selects the active or next pending todo task from the stage task list.
 *
 * @param todos - The list of todos.
 * @returns The currently active or next pending UiTodo, or undefined if none.
 */
export function selectActiveTask(todos: readonly UiTodo[]): UiTodo | undefined {
  return (
    todos.find((item) => item.status === 'in_progress') ??
    todos.find((item) => item.status === 'pending')
  );
}

/**
 * Computes completion metrics for a todo task list.
 *
 * @param todos - The list of todos.
 * @returns An object containing done count, total active count, and ratio.
 */
export function selectTodoProgress(todos: readonly UiTodo[]): TodoProgress {
  const done = todos.filter((item) => item.status === 'completed').length;
  const total = todos.filter((item) => item.status !== 'cancelled').length;
  const ratio = total > 0 ? done / total : 0;

  return { done, total, ratio };
}

/**
 * Computes overall stage progression across standard workflow phases.
 *
 * @param phase - The mapping of phase names to their current statuses.
 * @returns Computed PhaseProgress metrics including ratio and percentage.
 */
export function selectPhaseProgress(phase: UiPhaseMap): PhaseProgress {
  const done = PHASES.filter((p: PhaseName) => phase[p] === 'completed').length;
  const active = PHASES.some((p: PhaseName) => phase[p] === 'active');
  const activeWeight = active ? 0.45 : 0;
  const ratio = Math.max(0, Math.min(1, (done + activeWeight) / PHASES.length));
  const percent = Math.round(ratio * 100);

  return { done, active, ratio, percent };
}

/**
 * Selects a prioritized list of active tools and recently finished tools for dashboard display.
 * Prioritizes actively executing tools up to 2 items, filling remaining display slots with
 * the most recent finished or failed tools.
 *
 * @param tools - Map of tool call IDs to tool objects.
 * @param toolOrder - Insertion-ordered array of tool call IDs.
 * @param maxTotal - Maximum number of tools to return (defaults to 3).
 * @returns Prioritized array of tools to render.
 */
export function selectActiveAndRecentTools(
  tools: Readonly<Record<string, UiTool>>,
  toolOrder: readonly string[],
  maxTotal: number = 3,
): UiTool[] {
  const orderedTools = toolOrder.map((id) => tools[id]).filter((t): t is UiTool => Boolean(t));

  const active = orderedTools.filter((t) =>
    ['pending', 'in_progress', 'active', 'started'].includes(t.status),
  );
  const inactive = orderedTools.filter((t) => !active.includes(t));

  const activeSlice = active.slice(0, 2);
  const neededInactive = Math.max(0, maxTotal - activeSlice.length);
  const recentInactive = inactive.slice(-neededInactive);

  return [...activeSlice, ...recentInactive].slice(0, maxTotal);
}

/**
 * Selects the trailing tail of conversational messages for dashboard display.
 *
 * @param messages - Array of all recorded UI messages.
 * @param count - Maximum number of recent messages to select (defaults to 2).
 * @returns Array of recent messages.
 */
export function selectRecentMessages(
  messages: readonly UiMessage[],
  count: number = 2,
): readonly UiMessage[] {
  return messages.slice(-count);
}

/**
 * Safely resolves focus content from disk if a focusFile exists, or falls back to in-memory text.
 *
 * @param focusFile - File path to read if available.
 * @param inMemoryText - In-memory accumulated text buffer.
 * @returns Resolved text content.
 */
export function selectFocusContent(focusFile: string, inMemoryText: string): string {
  if (focusFile) {
    try {
      if (fs.existsSync(focusFile)) {
        return fs.readFileSync(focusFile, 'utf8');
      }
    } catch {}
  }
  return inMemoryText || '';
}

/**
 * Computes wrapped text lines and slices the viewport window according to scroll offset and follow mode.
 * Always returns exactly `viewportHeight` lines (padding with empty strings if needed) to maintain
 * zero console jitter.
 *
 * @param rawText - The unformatted source text to view.
 * @param viewportHeight - Number of rows allocated for text content.
 * @param offset - Upward scroll offset from the bottom of the stream.
 * @param follow - Whether auto-follow is active (forces offset to 0).
 * @param width - Available terminal column width.
 * @returns An array of exactly `viewportHeight` strings.
 */
export function selectVisibleFocusLines(
  rawText: string,
  viewportHeight: number,
  offset: number,
  follow: boolean,
  width: number,
): string[] {
  const effectiveHeight = Math.max(1, viewportHeight);
  const columnWidth = Math.max(20, width);
  const lines = wrapText(rawText || '(Awaiting executor focus/progress…)', columnWidth);

  const effectiveOffset = follow ? 0 : Math.max(0, offset);
  const startIndex = Math.max(0, lines.length - effectiveHeight - effectiveOffset);
  const visible = lines.slice(startIndex, startIndex + effectiveHeight);

  // Pad to exact viewport height to prevent terminal jitter
  while (visible.length < effectiveHeight) {
    if (follow) {
      visible.push('');
    } else {
      visible.unshift('');
    }
  }

  return visible;
}

/**
 * Formats a list of todos into bulleted terminal strings.
 *
 * @param todos - The list of todos.
 * @returns Formatted strings ready for rendering in a list panel.
 */
export function selectFormattedTodos(todos: readonly UiTodo[]): string[] {
  if (todos.length === 0) {
    return ['(No todos recorded)'];
  }
  return todos.map((item) => {
    const glyph = item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '◐' : '○';
    const label = item.content || item.title || item.id;
    return `${glyph} ${label}`;
  });
}

/**
 * Formats a list of diagnostic log entries into terminal strings.
 *
 * @param logs - Array of log entries.
 * @param maxRows - Maximum entries to format.
 * @returns Formatted strings ready for rendering.
 */
export function selectFormattedLogs(logs: readonly UiLogEntry[], maxRows: number): string[] {
  if (logs.length === 0) {
    return ['(No recent logs)'];
  }
  return logs
    .slice(-maxRows)
    .map((entry) => `${entry.level || 'info'} · ${normalizeOneLine(entry.message || '')}`);
}
