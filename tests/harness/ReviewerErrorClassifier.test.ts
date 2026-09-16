/**
 * @fileoverview Unit tests for ReviewerErrorClassifier in src/harness/ReviewerErrorClassifier.ts.
 *
 * Validates classification of usage limits, 429 rate limits, quota exhaustion, process crashes,
 * protocol turn failures, and timeouts against real fixtures from run 20260915T193118Z-76e14b.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ReviewerErrorClassifier } from '../../src/harness/ReviewerErrorClassifier.js';
import { ProcessExecutionError } from '../../src/errors.js';

test('ReviewerErrorClassifier: classifies real fixture from run 20260915T193118Z-76e14b as usage_limit', () => {
  const fixtureLines = [
    '{"type":"thread.started"}',
    '{"type":"error","message":"You\'ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 11:00 PM."}',
    '{"type":"turn.failed","error":{"message":"You\'ve hit your usage limit..."}}'
  ];

  const res = ReviewerErrorClassifier.classify(1, '', fixtureLines, false);
  assert.equal(res.isTrigger, true);
  assert.equal(res.trigger, 'usage_limit');
  assert.match(res.reason, /usage limit/i);
});

test('ReviewerErrorClassifier: classifies 429 rate limits from stderr and events', () => {
  const eventRes = ReviewerErrorClassifier.classify(
    1,
    '',
    ['{"type":"error","message":"HTTP 429: Too Many Requests - rate limit exceeded"}'],
    false
  );
  assert.equal(eventRes.isTrigger, true);
  assert.equal(eventRes.trigger, 'rate_limit');

  const stderrRes = ReviewerErrorClassifier.classify(1, 'Rate limit exceeded: 429', [], false);
  assert.equal(stderrRes.isTrigger, true);
  assert.equal(stderrRes.trigger, 'rate_limit');
});

test('ReviewerErrorClassifier: classifies quota exhaustion messages', () => {
  const res = ReviewerErrorClassifier.classify(
    1,
    '',
    ['{"type":"error","message":"You have exceeded your current quota, please check your plan"}'],
    false
  );
  assert.equal(res.isTrigger, true);
  assert.equal(res.trigger, 'quota_exhausted');
});

test('ReviewerErrorClassifier: classifies turn.failed events', () => {
  const res = ReviewerErrorClassifier.classify(
    1,
    '',
    ['{"type":"turn.failed","error":{"message":"Protocol stream ended unexpectedly"}}'],
    false
  );
  assert.equal(res.isTrigger, true);
  assert.equal(res.trigger, 'turn_failed');
  assert.match(res.reason, /Protocol stream ended unexpectedly/);
});

test('ReviewerErrorClassifier: classifies process crashes without result.json as process_crash', () => {
  const res = ReviewerErrorClassifier.classify(1, '', [], false);
  assert.equal(res.isTrigger, true);
  assert.equal(res.trigger, 'process_crash');
  assert.match(res.reason, /crashed with exit code 1/);
});

test('ReviewerErrorClassifier: classifies clean completion without result.json as no_result', () => {
  const res = ReviewerErrorClassifier.classify(0, '', [], false);
  assert.equal(res.isTrigger, true);
  assert.equal(res.trigger, 'no_result');
});

test('ReviewerErrorClassifier: classifies clean completion with result.json as non-trigger', () => {
  const res = ReviewerErrorClassifier.classify(0, '', [], true);
  assert.equal(res.isTrigger, false);
  assert.equal(res.trigger, null);
});

test('ReviewerErrorClassifier.classifyError: classifies structured ProcessExecutionError with eventLines', () => {
  const err = new ProcessExecutionError('Reviewer plan-review failed (exit 1).', {
    exitCode: 1,
    stderr: ''
  });
  Object.assign(err, {
    eventLines: ['{"type":"error","message":"You\'ve hit your usage limit. Upgrade to Pro"}'],
    resultFileExists: false
  });

  const res = ReviewerErrorClassifier.classifyError(err);
  assert.equal(res.isTrigger, true);
  assert.equal(res.trigger, 'usage_limit');
});

test('ReviewerErrorClassifier.classifyError: classifies timeout errors', () => {
  const err = new ProcessExecutionError('Process timed out after 480000ms', {
    timedOut: true
  });

  const res = ReviewerErrorClassifier.classifyError(err);
  assert.equal(res.isTrigger, true);
  assert.equal(res.trigger, 'timeout');
});

test('ReviewerErrorClassifier.classifyError: extracts triggers from generic error messages', () => {
  const usageErr = new Error('Codex error: usage limit reached');
  assert.equal(ReviewerErrorClassifier.classifyError(usageErr).trigger, 'usage_limit');

  const rateErr = new Error('Request failed with status code 429');
  assert.equal(ReviewerErrorClassifier.classifyError(rateErr).trigger, 'rate_limit');

  const crashErr = new Error('Reviewer failed (exit 1)');
  assert.equal(ReviewerErrorClassifier.classifyError(crashErr).trigger, 'process_crash');

  const unknownErr = new Error('Invalid assertion occurred in business logic');
  const unknownRes = ReviewerErrorClassifier.classifyError(unknownErr);
  assert.equal(unknownRes.isTrigger, false);
  assert.equal(unknownRes.trigger, null);

  // Additional triggers in message
  assert.equal(
    ReviewerErrorClassifier.classifyError(new Error('exceeded your current quota')).trigger,
    'quota_exhausted'
  );
  assert.equal(
    ReviewerErrorClassifier.classifyError(new Error('turn.failed reported by reviewer')).trigger,
    'turn_failed'
  );
  assert.equal(
    ReviewerErrorClassifier.classifyError(new Error('timed out waiting for response')).trigger,
    'timeout'
  );
  assert.equal(
    ReviewerErrorClassifier.classifyError(new Error('produced no structured result')).trigger,
    'no_result'
  );
});

test('ReviewerErrorClassifier: classifies stderr signals and error formats', () => {
  // Stderr usage limit
  const res1 = ReviewerErrorClassifier.classify(
    1,
    'Hit usage limit please upgrade to pro',
    [],
    false
  );
  assert.equal(res1.trigger, 'usage_limit');

  // Stderr timeout
  const res2 = ReviewerErrorClassifier.classify(1, 'operation timed out', [], false);
  assert.equal(res2.trigger, 'timeout');

  // Event line with type: turn.failed and parsed.error string
  const eventLine1 = JSON.stringify({
    type: 'turn.failed',
    error: 'turn_failed with fatal syntax error'
  });
  const res3 = ReviewerErrorClassifier.classify(0, '', [eventLine1], false);
  assert.equal(res3.trigger, 'turn_failed');

  // Event line with quota message
  const eventLine2 = JSON.stringify({
    error: { message: 'insufficient_quota on your plan' }
  });
  const res4 = ReviewerErrorClassifier.classify(0, '', [eventLine2], false);
  assert.equal(res4.trigger, 'quota_exhausted');

  // Structured object with no triggers
  const nonTriggerErr = {
    exitCode: 0,
    stderr: '',
    eventLines: [],
    resultFileExists: true
  };
  const res5 = ReviewerErrorClassifier.classifyError(nonTriggerErr);
  assert.equal(res5.isTrigger, false);
});
