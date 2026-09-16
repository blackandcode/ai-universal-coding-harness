/**
 * @fileoverview Unit tests for ReviewPayloadBuilder in src/orchestrator/services/ReviewPayloadBuilder.ts.
 *
 * Validates calculation of diff metrics (char_count, estimated_tokens, truncation flag),
 * extraction and retention of diff_stat and changed_files, bounding against maxDiffChars,
 * and context prioritization for requested_paths from prior review rounds.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ReviewPayloadBuilder } from './ReviewPayloadBuilder.js';
import type { GitReviewProvider } from './ReviewPayloadBuilder.js';

function createMockGit(options: {
  fullDiff: string;
  requestedDiff?: string;
  status?: string;
  stat?: string;
  files?: string[];
}): GitReviewProvider {
  return {
    statusShort: () => options.status ?? ' M src/index.ts',
    diffStat: () => options.stat ?? ' 1 file changed, 10 insertions(+)',
    changedFiles: () => options.files ?? ['src/index.ts'],
    reviewDiff: (paths?: string[]) => {
      if (paths && paths.length > 0) {
        return options.requestedDiff ?? `diff --git a/${paths[0]} b/${paths[0]}\n+ prioritized`;
      }
      return options.fullDiff;
    },
  };
}

test('ReviewPayloadBuilder: builds complete untruncated payload when diff is within limit', () => {
  const fullDiff = 'diff --git a/file.ts b/file.ts\n+const a = 1;';
  const git = createMockGit({ fullDiff });

  const payload = ReviewPayloadBuilder.build({
    git,
    approvedPlan: { verdict: 'APPROVE' },
    planReviewerCarryover: 'keep tests updated',
    evidence: { status: 'PASS' },
    maxDiffChars: 1000,
  });

  assert.equal(payload.diff, fullDiff);
  assert.equal(payload.git_status, ' M src/index.ts');
  assert.equal(payload.diff_stat, ' 1 file changed, 10 insertions(+)');
  assert.deepEqual(payload.changed_files, ['src/index.ts']);
  assert.equal(payload.diff_metrics.char_count, fullDiff.length);
  assert.equal(payload.diff_metrics.estimated_tokens, Math.ceil(fullDiff.length / 4));
  assert.equal(payload.diff_metrics.truncated, false);
  assert.equal(payload.diff_metrics.original_chars, fullDiff.length);
  assert.equal(payload.requested_context_diff, undefined);
});

test('ReviewPayloadBuilder: truncates diff exceeding maxDiffChars and preserves stats', () => {
  const largeDiff = 'a'.repeat(5000);
  const git = createMockGit({ fullDiff: largeDiff });

  const payload = ReviewPayloadBuilder.build({
    git,
    maxDiffChars: 500,
  });

  assert.equal(payload.diff_metrics.truncated, true);
  assert.equal(payload.diff_metrics.original_chars, 5000);
  assert.ok(payload.diff.length <= 600);
  assert.match(payload.diff, /diff truncated: total 5000 chars exceeds limit 500/);
  // File list and stats are never truncated
  assert.deepEqual(payload.changed_files, ['src/index.ts']);
  assert.equal(payload.diff_stat, ' 1 file changed, 10 insertions(+)');
});

test('ReviewPayloadBuilder: prioritizes requested_paths ahead of general diff', () => {
  const largeDiff = 'b'.repeat(4000);
  const requestedDiff = 'diff --git a/prioritized.ts b/prioritized.ts\n+critical fix';
  const git = createMockGit({
    fullDiff: largeDiff,
    requestedDiff,
  });

  const payload = ReviewPayloadBuilder.build({
    git,
    maxDiffChars: 600,
    requestedPaths: ['src/prioritized.ts'],
  });

  assert.equal(payload.diff_metrics.truncated, true);
  assert.deepEqual(payload.diff_metrics.prioritized_paths, ['src/prioritized.ts']);
  assert.ok(payload.diff.includes('PRIORITIZED CONTEXT FOR REQUESTED PATHS (src/prioritized.ts)'));
  assert.ok(payload.diff.includes('+critical fix'));
  assert.equal(payload.requested_context_diff, requestedDiff);
});

test('ReviewPayloadBuilder: handles requested_paths when full diff is within limit', () => {
  const fullDiff = 'short full diff';
  const requestedDiff = 'short requested diff';
  const git = createMockGit({ fullDiff, requestedDiff });

  const payload = ReviewPayloadBuilder.build({
    git,
    maxDiffChars: 2000,
    requestedPaths: ['path/a.ts'],
  });

  assert.equal(payload.diff_metrics.truncated, false);
  assert.deepEqual(payload.diff_metrics.prioritized_paths, ['path/a.ts']);
  assert.equal(payload.diff, fullDiff);
  assert.equal(payload.requested_context_diff, requestedDiff);
});

test('ReviewPayloadBuilder: truncates prioritized context when prefix alone exceeds maxDiffChars', () => {
  const fullDiff = 'f'.repeat(5000);
  const hugeRequestedDiff = 'r'.repeat(1000);
  const git = createMockGit({ fullDiff, requestedDiff: hugeRequestedDiff });

  const payload = ReviewPayloadBuilder.build({
    git,
    maxDiffChars: 200,
    requestedPaths: ['src/huge.ts'],
  });

  assert.equal(payload.diff_metrics.truncated, true);
  assert.match(payload.diff, /prioritized context \(1000 chars\) exceeds limit 200/);
});
