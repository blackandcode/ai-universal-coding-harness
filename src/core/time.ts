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

/**
 * Configuration options for retrying asynchronous operations with exponential backoff.
 */
export interface RetryOptions {
  /** Maximum number of attempts including the initial call. Defaults to 3. */
  maxAttempts?: number;
  /** Initial delay before the first retry in milliseconds. Defaults to 1000ms. */
  initialDelayMs?: number;
  /** Multiplier for each subsequent delay. Defaults to 2. */
  backoffFactor?: number;
  /** Maximum delay cap in milliseconds. Defaults to 30000ms. */
  maxDelayMs?: number;
  /** Optional predicate to determine if a specific error is retryable. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Optional callback invoked when a retry attempt is scheduled. */
  onRetry?: (error: unknown, attempt: number, nextDelayMs: number) => void;
}

/**
 * Retries an asynchronous operation with exponential backoff upon failure.
 *
 * @remarks
 * Invariant: Executes `fn` up to `maxAttempts` times. If an attempt fails, pauses for an
 * exponentially increasing delay (bounded by `maxDelayMs`) before the next attempt.
 *
 * @typeParam T - Return type of the asynchronous function.
 * @param fn - Asynchronous function to execute, receiving the 1-based attempt counter.
 * @param options - Configuration options controlling retry counts, delays, and filters.
 * @returns Resolves with the result of `fn` or rejects with the last encountered error.
 * @throws The error thrown on the final attempt if all retry attempts are exhausted.
 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const backoffFactor = options.backoffFactor ?? 2;
  const maxDelayMs = options.maxDelayMs ?? 30000;

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: unknown) {
      lastError = err;
      if (attempt >= maxAttempts) {
        break;
      }
      if (options.shouldRetry && !options.shouldRetry(err, attempt)) {
        break;
      }
      options.onRetry?.(err, attempt, delay);
      await sleep(delay);
      delay = Math.min(delay * backoffFactor, maxDelayMs);
    }
  }

  throw lastError;
}
