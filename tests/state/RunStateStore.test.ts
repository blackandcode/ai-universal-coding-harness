/**
 * @fileoverview Unit tests for RunStateStore and runtime state validation.
 * Tests JSON serialization, atomic writes, corrupted JSON recovery, and schema validation with RunStateError.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  RunStateStore,
  validateRunState,
  validateStageRuntimeState
} from '../../src/state/RunStateStore.js';
import { RunStateError } from '../../src/errors.js';
import type { RunState } from '../../src/types.js';

function createValidRunState(runId = 'test-run-valid'): RunState {
  return {
    version: 1,
    run_id: runId,
    created_at: new Date().toISOString(),
    status: 'created',
    workspace: '/fake/workspace',
    base_ref: 'HEAD',
    base_commit: '1234567890abcdef',
    original_branch: 'main',
    original_head: '1234567890abcdef',
    branch: 'ai-harness/test-run-valid-s01',
    branch_created: false,
    stage_source: '/fake/stages',
    stages: [
      {
        name: 'stage-01-init',
        selector: '01',
        status: 'pending',
        manifest: {
          name: 'stage-01-init',
          selector: '01',
          source: '/fake/stages',
          relative_path: 'stage-01-init',
          sha256: {}
        }
      }
    ],
    executor_harness: 'cursor',
    reviewer_harness: 'codex',
    quality_cmd: 'npm test'
  };
}

test('validateRunState accepts valid state and rejects invalid objects', () => {
  const valid = createValidRunState();
  assert.equal(validateRunState(valid).run_id, valid.run_id);

  assert.throws(() => validateRunState(null), RunStateError);
  assert.throws(() => validateRunState('not an object'), RunStateError);
  assert.throws(() => validateRunState({ ...valid, status: 'invalid_status' }), RunStateError);
  assert.throws(() => validateRunState({ ...valid, branch: '' }), RunStateError);
  assert.throws(() => validateRunState({ ...valid, stages: 'not an array' }), RunStateError);
});

test('validateStageRuntimeState validates stage phase', () => {
  assert.equal(validateStageRuntimeState({ phase: 'plan' }).phase, 'plan');
  assert.throws(() => validateStageRuntimeState({ phase: 'unknown_phase' }), RunStateError);
  assert.throws(() => validateStageRuntimeState(null), RunStateError);
});

test('RunStateStore saves, loads, and writes human-readable markdown', () => {
  const store = new RunStateStore();
  const runId = `test-store-${Date.now()}`;
  const state = createValidRunState(runId);

  try {
    store.save(state);
    const loaded = store.load(runId);
    assert.equal(loaded.run_id, runId);
    assert.equal(loaded.status, 'created');
    assert.ok(fs.existsSync(path.join(store.runDir(runId), 'RUN.md')));

    // Test stage saving and loading
    store.saveStage(runId, 'stage-01-init', { phase: 'plan', attempt: 1 });
    const stageState = store.loadStage(runId, 'stage-01-init');
    assert.equal(stageState.phase, 'plan');
    assert.equal(stageState.attempt, 1);

    // Test human artifact appending
    store.appendHuman(runId, 'stage-01-init', 'PLAN.md', 'Test Heading', 'Test Body');
    const planFile = path.join(store.stageDir(runId, 'stage-01-init'), 'PLAN.md');
    assert.ok(fs.existsSync(planFile));
    const content = fs.readFileSync(planFile, 'utf8');
    assert.ok(content.includes('Test Heading'));
    assert.ok(content.includes('Test Body'));
  } finally {
    fs.rmSync(store.runDir(runId), { recursive: true, force: true });
  }
});

test('RunStateStore throws RunStateError on missing or corrupted run file', () => {
  const store = new RunStateStore();
  assert.throws(() => store.load('non-existent-run-id-xyz'), RunStateError);

  const corruptRunId = `test-corrupt-${Date.now()}`;
  const corruptDir = store.runDir(corruptRunId);
  fs.mkdirSync(corruptDir, { recursive: true });
  try {
    fs.writeFileSync(store.runStatePath(corruptRunId), '{ invalid json ,,,');
    assert.throws(() => store.load(corruptRunId), RunStateError);
  } finally {
    fs.rmSync(corruptDir, { recursive: true, force: true });
  }
});
