/**
 * @fileoverview Unit tests for time utilities and exponential backoff retry.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { iso, utcStamp, sleep, retryWithBackoff } from '../../src/core/time.js';

test('iso and utcStamp return formatted timestamp strings', () => {
  const i = iso();
  assert.ok(typeof i === 'string');
  assert.match(i, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  const u = utcStamp();
  assert.ok(typeof u === 'string');
  assert.match(u, /^\d{8}T\d{6}Z$/);
});

test('sleep resolves after specified milliseconds', async () => {
  const start = Date.now();
  await sleep(20);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 15, `Elapsed time ${elapsed} should be >= 15ms`);
});

test('retryWithBackoff succeeds on first attempt when no errors occur', async () => {
  let calls = 0;
  const result = await retryWithBackoff(async (attempt) => {
    calls++;
    assert.equal(attempt, 1);
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('retryWithBackoff retries with backoff and succeeds on subsequent attempt', async () => {
  let calls = 0;
  const retriedDelays: number[] = [];

  const result = await retryWithBackoff(
    async (attempt) => {
      calls++;
      if (attempt < 3) {
        throw new Error(`Failure on attempt ${attempt}`);
      }
      return 'success-on-3';
    },
    {
      maxAttempts: 3,
      initialDelayMs: 10,
      backoffFactor: 2,
      onRetry: (_err, _attempt, delay) => {
        retriedDelays.push(delay);
      }
    }
  );

  assert.equal(result, 'success-on-3');
  assert.equal(calls, 3);
  assert.deepEqual(retriedDelays, [10, 20]);
});

test('retryWithBackoff exhausts maxAttempts and throws last error', async () => {
  let calls = 0;
  await assert.rejects(async () => {
    await retryWithBackoff(
      async (_attempt) => {
        calls++;
        throw new Error('Persistent failure');
      },
      {
        maxAttempts: 3,
        initialDelayMs: 5,
        backoffFactor: 1.5
      }
    );
  }, /Persistent failure/);
  assert.equal(calls, 3);
});

test('retryWithBackoff respects shouldRetry predicate', async () => {
  let calls = 0;
  await assert.rejects(async () => {
    await retryWithBackoff(
      async (_attempt) => {
        calls++;
        throw new Error('Fatal non-retryable error');
      },
      {
        maxAttempts: 5,
        initialDelayMs: 5,
        shouldRetry: (err) => err instanceof Error && !err.message.includes('Fatal')
      }
    );
  }, /Fatal non-retryable error/);
  assert.equal(calls, 1);
});
