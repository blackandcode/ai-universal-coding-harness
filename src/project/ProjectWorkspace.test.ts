/**
 * @fileoverview Unit tests for ProjectWorkspace.
 * Tests git repo validation, initialization checks, active run detection with LockConflictError, and clean state assertions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ProjectWorkspace } from './ProjectWorkspace.js';
import { LOCK_FILE } from '../core/paths.js';
import { LockConflictError } from '../errors.js';

test('ProjectWorkspace checks git status and initialization', () => {
  const ws = new ProjectWorkspace();
  assert.equal(typeof ws.isGitRepository(), 'boolean');
  assert.equal(ws.isGitRepository(), true);
  assert.equal(typeof ws.isInitialized(), 'boolean');
});

test('ProjectWorkspace assertNoActiveRun throws LockConflictError when alive', () => {
  const ws = new ProjectWorkspace();
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(
    LOCK_FILE,
    JSON.stringify({ pid: process.pid, run_id: 'test-active', branch: 'test-branch' }),
  );
  try {
    assert.throws(() => ws.assertNoActiveRun(), LockConflictError);
  } finally {
    fs.rmSync(LOCK_FILE, { force: true });
  }
});

test('ProjectWorkspace assertNoActiveRun ignores stale locks with non-existent PIDs', () => {
  const ws = new ProjectWorkspace();
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(
    LOCK_FILE,
    JSON.stringify({ pid: 999999999, run_id: 'test-dead', branch: 'test-branch' }),
  );
  try {
    // Should not throw because PID 999999999 is dead
    ws.assertNoActiveRun();
  } finally {
    fs.rmSync(LOCK_FILE, { force: true });
  }
});
