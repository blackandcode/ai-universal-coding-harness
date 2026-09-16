/**
 * @fileoverview Text processing, word wrapping, ANSI/glyph mapping, and terminal formatting helpers.
 * Provides pure utility functions to format strings, calculate bounded progress meters, and
 * map orchestration status codes to consistent terminal icons and colors.
 */

import type { PhaseStatus } from './types.js';

/**
 * Normalizes multi-line or whitespace-heavy text into a single trimmed line.
 *
 * @param text - The raw string to normalize.
 * @returns Whitespace-collapsed single-line string.
 */
export function normalizeOneLine(text: string = ''): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncates a string to a specified length, appending an ellipsis if truncated.
 * Normalizes inner whitespace before calculating length.
 *
 * @param text - The string to truncate.
 * @param maxLength - Maximum permitted character length (defaults to 120).
 * @returns Truncated string with ellipsis or original string.
 */
export function truncateText(text: string = '', maxLength: number = 120): string {
  const normalized = normalizeOneLine(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const sliceLength = Math.max(0, maxLength - 1);
  return normalized.slice(0, sliceLength) + '…';
}

/**
 * Wraps text to fit within a bounded column width.
 * Preserves explicit newlines and breaks long words cleanly if no space is available.
 *
 * @param text - The raw multi-line string to wrap.
 * @param width - The maximum column width available for rendering.
 * @returns An array of line strings bounded to the specified width.
 */
export function wrapText(text: string, width: number): string[] {
  const safeWidth = Math.max(10, width);
  const out: string[] = [];
  const lines = String(text ?? '').split(/\r?\n/);

  for (const raw of lines) {
    if (!raw) {
      out.push('');
      continue;
    }

    let remaining = raw;
    while (remaining.length > safeWidth) {
      // Find the last space before the column boundary
      let breakIndex = remaining.lastIndexOf(' ', safeWidth);
      // If no reasonable whitespace boundary exists in the second half of the line, break hard
      if (breakIndex < safeWidth * 0.45) {
        breakIndex = safeWidth;
      }

      out.push(remaining.slice(0, breakIndex));
      remaining = remaining.slice(breakIndex).trimStart();
    }

    out.push(remaining);
  }

  return out;
}

/**
 * Resolves an iconic status glyph for a stage phase or general execution status.
 *
 * @param status - Phase or task execution status string.
 * @returns Unicode status glyph (✓, ✗, ◐, or ○).
 */
export function getPhaseIcon(status: PhaseStatus | string): string {
  const normalized = String(status ?? '').toLowerCase();
  if (['completed', 'approved', 'pass'].includes(normalized)) {
    return '✓';
  }
  if (['failed', 'blocked', 'deny', 'error'].includes(normalized)) {
    return '✗';
  }
  if (['active', 'in_progress', 'started', 'pending'].includes(normalized)) {
    return '◐';
  }
  return '○';
}

/**
 * Resolves a terminal theme color for a phase or general execution status.
 *
 * @param status - Phase or task execution status string.
 * @returns Terminal theme color name.
 */
export function getPhaseColor(status: PhaseStatus | string): 'green' | 'red' | 'cyan' | 'gray' {
  const normalized = String(status ?? '').toLowerCase();
  if (['completed', 'approved', 'pass'].includes(normalized)) {
    return 'green';
  }
  if (['failed', 'blocked', 'deny', 'error'].includes(normalized)) {
    return 'red';
  }
  if (['active', 'in_progress', 'started'].includes(normalized)) {
    return 'cyan';
  }
  return 'gray';
}

/**
 * Resolves an iconic status glyph for an active or completed executor tool.
 *
 * @param status - Tool execution status.
 * @returns Unicode status glyph (◐, ✓, or ✗).
 */
export function getToolStatusIcon(status?: string): string {
  const normalized = String(status ?? '').toLowerCase();
  if (['pending', 'in_progress', 'active', 'started'].includes(normalized)) {
    return '◐';
  }
  if (['completed', 'success'].includes(normalized)) {
    return '✓';
  }
  return '✗';
}

/**
 * Resolves a terminal theme color for an executor tool status.
 *
 * @param status - Tool execution status.
 * @returns Terminal theme color name.
 */
export function getToolStatusColor(status?: string): 'green' | 'red' | 'cyan' | 'gray' {
  const normalized = String(status ?? '').toLowerCase();
  if (['failed', 'error'].includes(normalized)) {
    return 'red';
  }
  if (['pending', 'in_progress', 'active', 'started'].includes(normalized)) {
    return 'cyan';
  }
  if (['completed', 'success'].includes(normalized)) {
    return 'green';
  }
  return 'gray';
}

/**
 * Progress bar components formatted for terminal rendering.
 */
export interface ProgressBarLayout {
  /** Solid characters representing completed progress */
  readonly filled: string;
  /** Dotted characters representing remaining work */
  readonly unfilled: string;
  /** Formatted percentage string (e.g. "75%") */
  readonly percent: string;
}

/**
 * Computes characters and percentage for a bounded terminal progress meter.
 *
 * @param ratio - Progress ratio between 0.0 and 1.0.
 * @param totalWidth - Total available terminal width.
 * @returns Object containing filled blocks, unfilled blocks, and percentage string.
 */
export function formatProgressBar(ratio: number, totalWidth: number): ProgressBarLayout {
  const clampedRatio = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const barWidth = Math.max(10, Math.min(36, totalWidth - 14));
  const fillCount = Math.round(barWidth * clampedRatio);
  const unfilledCount = Math.max(0, barWidth - fillCount);

  return {
    filled: '█'.repeat(fillCount),
    unfilled: '░'.repeat(unfilledCount),
    percent: `${Math.round(clampedRatio * 100)}%`
  };
}
