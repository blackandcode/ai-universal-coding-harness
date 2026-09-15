/**
 * @fileoverview Unit tests for RunLock.
 * Tests lock acquisition, atomic updates, graceful release, PID liveness checks, and LockConflictError on concurrent runs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RunLock } from './RunLock.js';
import { LOCK_FILE } from '../core/paths.js';
import { LockConflictError } from '../errors.js';

test('RunLock acquires, updates, and releases lock', () => {
  const lock = new RunLock();
  try {
    lock.acquire('test-run-1', 'ai-harness/branch-1');
    assert.equal(lock.owned, true);
    assert.ok(fs.existsSync(LOCK_FILE));

    const content = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    assert.equal(content.pid, process.pid);
    assert.equal(content.run_id, 'test-run-1');

    lock.update('test-run-updated', 'ai-harness/branch-updated');
    const updated = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    assert.equal(updated.run_id, 'test-run-updated');
  } finally {
    lock.release();
  }
  assert.equal(lock.owned, false);
  assert.equal(fs.existsSync(LOCK_FILE), false);
});

test('RunLock throws LockConflictError when active process owns lock', () => {
  const lock1 = new RunLock();
  const lock2 = new RunLock();
  try {
    lock1.acquire('run-1', 'branch-1');
    assert.throws(() => lock2.acquire('run-2', 'branch-2'), LockConflictError);
  } finally {
    lock1.release();
    lock2.release();
  }
});

test('RunLock recovers from stale lock when PID is dead', () => {
  // Write a fake stale lock with an impossible/dead PID
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(
    LOCK_FILE,
    JSON.stringify({ pid: 999999999, run_id: 'stale-run', branch: 'stale-branch' }),
  );

  const lock = new RunLock();
  try {
    lock.acquire('fresh-run', 'fresh-branch');
    assert.equal(lock.owned, true);
    const content = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    assert.equal(content.pid, process.pid);
    assert.equal(content.run_id, 'fresh-run');
  } finally {
    lock.release();
  }
});
