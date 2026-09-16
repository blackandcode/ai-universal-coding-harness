/**
 * @fileoverview Time and date utility functions for timestamps, ISO strings, and sleep delays.
 */

/**
 * Returns current timestamp formatted as an ISO 8601 string.
 *
 * @returns ISO 8601 string (e.g. '2026-09-16T00:00:00.000Z')
 */
export const iso = (): string => new Date().toISOString();

/**
 * Returns current timestamp formatted as a compact UTC string suitable for IDs and branches.
 *
 * @returns Compact UTC string (e.g. '20260916T000000Z')
 */
export const utcStamp = (): string =>
  new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

/**
 * Asynchronously pauses execution for a specified duration in milliseconds.
 *
 * @param ms - Duration in milliseconds to sleep.
 * @returns Promise that resolves after the specified duration.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
