/**
 * @fileoverview Unit tests for RunStateStore and runtime state validation.
 * Tests JSON serialization, atomic writes, corrupted JSON recovery, and schema validation with RunStateError.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  RunStateStore,
  validateRunState,
  validateStageRuntimeState,
  validateStageManifest,
  validateSelectedStage,
  validateCommandObservation
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
  assert.throws(() => validateRunState({ ...valid, workspace: '' }), RunStateError);
  assert.throws(() => validateRunState({ ...valid, run_id: '' }), RunStateError);
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

    // Test permission decision deduplication
    const dec1 = {
      allow: true,
      source: 'auto-safe',
      signature: '{"cmd":"ls"}',
      reason: 'Reversible safe operation.'
    };
    store.recordPermissionDecision(runId, 'stage-01-init', dec1);
    store.recordPermissionDecision(runId, 'stage-01-init', dec1);
    store.recordPermissionDecision(runId, 'stage-01-init', dec1);

    const decisionsFile = path.join(store.stageDir(runId, 'stage-01-init'), 'DECISIONS.md');
    assert.ok(fs.existsSync(decisionsFile));
    let decisionsContent = fs.readFileSync(decisionsFile, 'utf8');
    // Should have only 1 '## Permission decision' section but with Count: 3
    const matches = decisionsContent.match(/## Permission decision/g);
    assert.equal(matches?.length, 1);
    assert.ok(decisionsContent.includes('- **Count:** 3'));

    // Different decision appends a new section
    const dec2 = {
      allow: false,
      source: 'denylist',
      signature: '{"cmd":"git push"}',
      reason: 'Push blocked.'
    };
    store.recordPermissionDecision(runId, 'stage-01-init', dec2);
    decisionsContent = fs.readFileSync(decisionsFile, 'utf8');
    assert.equal(decisionsContent.match(/## Permission decision/g)?.length, 2);
    assert.ok(decisionsContent.includes('- **Decision:** DENY'));
    assert.ok(decisionsContent.includes('- **Count:** 1'));

    // Intervening appendHuman resets deduplication so a subsequent dec2 starts a fresh block
    store.appendHuman(runId, 'stage-01-init', 'DECISIONS.md', 'Executor question answered', 'Q&A');
    store.recordPermissionDecision(runId, 'stage-01-init', dec2);
    decisionsContent = fs.readFileSync(decisionsFile, 'utf8');
    assert.equal(decisionsContent.match(/## Permission decision/g)?.length, 3);
    assert.ok(decisionsContent.includes('## Executor question answered'));
  } finally {
    fs.rmSync(store.runDir(runId), { recursive: true, force: true });
  }
});

test('RunStateStore rejects invalid ids and defaults missing stage state', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'run-state-root-'));
  const store = new RunStateStore(tmpRoot);
  assert.throws(() => store.runDir('bad/run'), RunStateError);
  assert.throws(() => store.stageDir('valid-run', 'bad stage!'), RunStateError);
  assert.throws(() => store.loadLatest(), RunStateError);
  assert.equal(store.latestId(), '');
  assert.deepEqual(store.loadStage('missing-run', 'stage-01'), { version: 1, phase: 'pending' });

  const runId = `stage-corrupt-${Date.now()}`;
  const stage = 'stage-01';
  fs.mkdirSync(store.stageDir(runId, stage), { recursive: true });
  fs.writeFileSync(store.stageStatePath(runId, stage), '{ not json');
  try {
    assert.throws(() => store.loadStage(runId, stage), RunStateError);
  } finally {
    fs.rmSync(store.runDir(runId), { recursive: true, force: true });
    fs.rmSync(tmpRoot, { recursive: true, force: true });
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

test('validateStageManifest asserts all manifest fields and sha256 map', () => {
  const validManifest = {
    name: 'stage-01',
    selector: '01',
    source: '/path/to/stages',
    relative_path: 'stage-01',
    sha256: { 'file.txt': 'abc123' }
  };
  assert.equal(validateStageManifest(validManifest).name, 'stage-01');

  assert.throws(() => validateStageManifest(null), RunStateError);
  assert.throws(() => validateStageManifest({ ...validManifest, name: '' }), RunStateError);
  assert.throws(() => validateStageManifest({ ...validManifest, selector: '' }), RunStateError);
  assert.throws(() => validateStageManifest({ ...validManifest, source: '' }), RunStateError);
  assert.throws(
    () => validateStageManifest({ ...validManifest, relative_path: 123 }),
    RunStateError
  );
  assert.throws(() => validateStageManifest({ ...validManifest, sha256: null }), RunStateError);
  assert.throws(
    () => validateStageManifest({ ...validManifest, sha256: { 'file.txt': 123 } }),
    RunStateError
  );
});

test('validateSelectedStage asserts stage name, selector, status, and manifest', () => {
  const validStage = {
    name: 'stage-01',
    selector: '01',
    status: 'pending',
    manifest: {
      name: 'stage-01',
      selector: '01',
      source: '/path/to/stages',
      relative_path: 'stage-01',
      sha256: {}
    }
  };
  assert.equal(validateSelectedStage(validStage).name, 'stage-01');

  assert.throws(() => validateSelectedStage(null), RunStateError);
  assert.throws(() => validateSelectedStage({ ...validStage, name: '' }), RunStateError);
  assert.throws(() => validateSelectedStage({ ...validStage, selector: '' }), RunStateError);
  assert.throws(() => validateSelectedStage({ ...validStage, status: 'unknown' }), RunStateError);
  assert.throws(() => validateSelectedStage({ ...validStage, manifest: null }), RunStateError);
});

test('validateCommandObservation asserts required observation fields and enums', () => {
  const validObs = {
    observation_id: 'obs-1',
    session_id: 'sess-1',
    tool_id: 'bash',
    tool_call_id: 'tc-1',
    sequence: 1,
    timestamp: new Date().toISOString(),
    source: 'acp',
    command: 'npm test',
    normalized_command: 'npm test',
    command_confidence: 'high',
    status: 'completed',
    exit_code: 0,
    stage: 'stage-01',
    attempt: 1,
    run_id: 'run-1',
    quality_epoch_id: 'ep-1',
    cwd: '/path'
  };
  assert.equal(validateCommandObservation(validObs).command, 'npm test');

  assert.throws(() => validateCommandObservation(null), RunStateError);
  assert.throws(
    () => validateCommandObservation({ ...validObs, observation_id: '' }),
    RunStateError
  );
  assert.throws(() => validateCommandObservation({ ...validObs, session_id: '' }), RunStateError);
  assert.throws(() => validateCommandObservation({ ...validObs, tool_id: '' }), RunStateError);
  assert.throws(() => validateCommandObservation({ ...validObs, tool_call_id: '' }), RunStateError);
  assert.throws(
    () => validateCommandObservation({ ...validObs, sequence: 'not a number' }),
    RunStateError
  );
  assert.throws(() => validateCommandObservation({ ...validObs, timestamp: 123 }), RunStateError);
  assert.throws(
    () => validateCommandObservation({ ...validObs, source: 'unknown' }),
    RunStateError
  );
  assert.throws(() => validateCommandObservation({ ...validObs, command: 123 }), RunStateError);
  assert.throws(
    () => validateCommandObservation({ ...validObs, normalized_command: 123 }),
    RunStateError
  );
  assert.throws(
    () => validateCommandObservation({ ...validObs, command_confidence: 'unknown' }),
    RunStateError
  );
  assert.throws(
    () => validateCommandObservation({ ...validObs, status: 'unknown' }),
    RunStateError
  );
  assert.throws(() => validateCommandObservation({ ...validObs, exit_code: '0' }), RunStateError);
});

test('validateStageRuntimeState validates optional properties when present', () => {
  const fullRuntime = {
    version: 1,
    phase: 'quality',
    attempt: 2,
    plan_status: 'APPROVE',
    plan_sha256: 'sha-plan',
    spec_sha256: 'sha-spec',
    reviewer_carryover: 'carryover text',
    executor_session_id: 'sess-exec',
    cursor_session_id: 'sess-cursor',
    evidence_file: '/path/evidence.json',
    patch_fingerprint: 'sha-patch',
    reviewer_feedback: 'feedback',
    commit_sha: 'commit-123',
    updated_at: '2026-09-16T12:00:00Z'
  };
  const validated = validateStageRuntimeState(fullRuntime);
  assert.equal(validated.phase, 'quality');
  assert.equal(validated.attempt, 2);
  assert.equal(validated.plan_status, 'APPROVE');
  assert.equal(validated.plan_sha256, 'sha-plan');
  assert.equal(validated.spec_sha256, 'sha-spec');
  assert.equal(validated.reviewer_carryover, 'carryover text');
  assert.equal(validated.executor_session_id, 'sess-exec');
  assert.equal(validated.cursor_session_id, 'sess-cursor');
  assert.equal(validated.evidence_file, '/path/evidence.json');
  assert.equal(validated.patch_fingerprint, 'sha-patch');
  assert.equal(validated.reviewer_feedback, 'feedback');
  assert.equal(validated.commit_sha, 'commit-123');
  assert.equal(validated.updated_at, '2026-09-16T12:00:00Z');
});

test('validateRunState validates all optional properties and stash handling', () => {
  const fullRun = {
    ...createValidRunState(),
    branch_created_at: '2026-09-16T10:00:00Z',
    feature: 'feature-name',
    executor_label: 'Cursor Agent',
    reviewer_label: 'Codex Agent',
    current_stage_index: 0,
    current_phase: 'implementation',
    pre_run_stash: { label: 'stash-1', commit: 'abc123' },
    error: 'some error',
    blocked_stage: 'stage-01',
    completed_at: '2026-09-16T11:00:00Z',
    interrupted_at: '2026-09-16T10:30:00Z',
    updated_at: '2026-09-16T10:35:00Z'
  };
  const validated = validateRunState(fullRun);
  assert.equal(validated.feature, 'feature-name');
  assert.equal(validated.executor_label, 'Cursor Agent');
  assert.equal(validated.reviewer_label, 'Codex Agent');
  assert.equal(validated.current_phase, 'implementation');
  assert.deepEqual(validated.pre_run_stash, { label: 'stash-1', commit: 'abc123' });
  assert.equal(validated.error, 'some error');
  assert.equal(validated.blocked_stage, 'stage-01');

  // Stash null
  const runWithNullStash = { ...fullRun, pre_run_stash: null };
  assert.equal(validateRunState(runWithNullStash).pre_run_stash, null);
});
