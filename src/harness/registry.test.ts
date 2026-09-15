import test from 'node:test';
import assert from 'node:assert/strict';
import { HarnessRegistry } from './registry.js';

test('default harness registry exposes Cursor executor and Codex reviewer only through generic contracts', () => {
  const r = new HarnessRegistry();
  assert.deepEqual(r.list(), { executors: ['cursor'], reviewers: ['codex'] });
});
