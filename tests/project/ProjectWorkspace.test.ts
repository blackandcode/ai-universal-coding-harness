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
import { ProjectWorkspace } from '../../src/project/ProjectWorkspace.js';
import { LOCK_FILE, RUNS_ROOT, LOCAL_CONFIG_FILE, LATEST_FILE } from '../../src/core/paths.js';
import { LockConflictError } from '../../src/errors.js';

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
    JSON.stringify({ pid: process.pid, run_id: 'test-active', branch: 'test-branch' })
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
    JSON.stringify({ pid: 999999999, run_id: 'test-dead', branch: 'test-branch' })
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
      updated_at: new Date().toISOString()
    })
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

test('ProjectWorkspace: requireInitialized throws when workspace files are missing', () => {
  const ws = new ProjectWorkspace();
  const hadConfig = fs.existsSync(LOCAL_CONFIG_FILE);
  const configBackup = hadConfig ? fs.readFileSync(LOCAL_CONFIG_FILE, 'utf8') : null;
  if (hadConfig) fs.unlinkSync(LOCAL_CONFIG_FILE);
  try {
    assert.throws(() => ws.requireInitialized(), /not initialized/i);
  } finally {
    if (configBackup !== null) fs.writeFileSync(LOCAL_CONFIG_FILE, configBackup, 'utf8');
    else ws.init(false);
  }
});

test('ProjectWorkspace: deleteRun validates run id and existence', () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  if (fs.existsSync(LOCK_FILE)) {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: 0, run_id: 'unit-test-neutralized' }));
  }

  assert.throws(() => ws.deleteRun('', true), /--run/);
  assert.throws(() => ws.deleteRun('bad id!', true), /Invalid run id/);
  assert.throws(() => ws.deleteRun('missing-run-xyz', true), /not found/i);
});

test('ProjectWorkspace: listRuns tolerates missing runs root and corrupt run.json', () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const corruptId = `corrupt-${Date.now()}`;
  const corruptDir = path.join(RUNS_ROOT, corruptId);
  fs.mkdirSync(corruptDir, { recursive: true });
  fs.writeFileSync(path.join(corruptDir, 'run.json'), 'not-json');

  try {
    const listed = ws.listRuns();
    const corrupt = listed.find((r) => r.id === corruptId);
    assert.ok(corrupt);
    assert.equal(corrupt?.status, undefined);
  } finally {
    fs.rmSync(corruptDir, { recursive: true, force: true });
  }

  try {
    fs.chmodSync(RUNS_ROOT, 0o755);
    fs.rmSync(RUNS_ROOT, { recursive: true, force: true });
  } catch {
    // Another test may hold the runs directory read-only while integration runs execute.
  }
  assert.deepEqual(ws.listRuns(), []);
  ws.init(false);
});

test('ProjectWorkspace: deleteRun rewrites latest pointer to next newest run', () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  // Neutralize a live lock from parallel orchestrator tests (pid 0 skips active-process check).
  if (fs.existsSync(LOCK_FILE)) {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: 0, run_id: 'unit-test-neutralized' }));
  }

  const older = `older-${Date.now()}`;
  const newer = `newer-${Date.now() + 1}`;
  for (const id of [older, newer]) {
    const dir = path.join(RUNS_ROOT, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'run.json'),
      JSON.stringify({ version: 1, run_id: id, status: 'completed' })
    );
  }
  fs.writeFileSync(LATEST_FILE, `${newer}\n`);

  try {
    ws.deleteRun(newer, true);
    assert.equal(fs.readFileSync(LATEST_FILE, 'utf8').trim(), older);
  } finally {
    for (const id of [older, newer]) {
      fs.rmSync(path.join(RUNS_ROOT, id), { recursive: true, force: true });
    }
    fs.rmSync(LATEST_FILE, { force: true });
  }
});

test('ProjectWorkspace: ensureGitExclude is idempotent', () => {
  const ws = new ProjectWorkspace();
  ws.init(false);
  ws.ensureGitExclude();
  ws.ensureGitExclude();
});
