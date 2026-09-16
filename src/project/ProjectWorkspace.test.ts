/**
 * @fileoverview Unit tests for ProjectWorkspace in src/project/ProjectWorkspace.ts.
 *
 * Validates git repository detection, initialization state checks, active run lock collision
 * detection with LockConflictError, run history listing, specific run deletion, and history reset.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ProjectWorkspace } from './ProjectWorkspace.js';
import { LOCK_FILE, RUNS_ROOT } from '../core/paths.js';
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

test('ProjectWorkspace: init creates workspace structure and is idempotent', () => {
  const ws = new ProjectWorkspace();
  const res = ws.init(false);
  assert.ok(fs.existsSync(res.root));
  assert.ok(fs.existsSync(res.config));
  assert.ok(fs.existsSync(res.permissions));
  assert.ok(fs.existsSync(res.runs));
  assert.ok(ws.isInitialized());
  assert.doesNotThrow(() => ws.requireInitialized());
});

test('ProjectWorkspace: listRuns and deleteRun manage run records', () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const testRunId = `test-run-${Date.now()}`;
  const testRunDir = path.join(RUNS_ROOT, testRunId);
  fs.mkdirSync(testRunDir, { recursive: true });
  fs.writeFileSync(
    path.join(testRunDir, 'run.json'),
    JSON.stringify({
      version: 1,
      run_id: testRunId,
      status: 'completed',
      branch: 'ai-harness/test',
      updated_at: new Date().toISOString(),
    }),
  );

  try {
    const runs = ws.listRuns();
    const found = runs.find((r) => r.id === testRunId);
    assert.ok(found, 'Created test run should be listed');
    assert.equal(found?.status, 'completed');

    // Refuses deletion without force
    assert.throws(() => ws.deleteRun(testRunId, false), /--force/);

    // Deletes with force
    const deleted = ws.deleteRun(testRunId, true);
    assert.equal(deleted, testRunId);
    assert.equal(fs.existsSync(testRunDir), false);
  } finally {
    fs.rmSync(testRunDir, { recursive: true, force: true });
  }
});

test('ProjectWorkspace: resetRuns resets run directories', () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  // Refuses reset without force
  assert.throws(() => ws.resetRuns(false), /--force/);

  // Succeeds with force
  const result = ws.resetRuns(true);
  assert.ok(result.deleted);
});
