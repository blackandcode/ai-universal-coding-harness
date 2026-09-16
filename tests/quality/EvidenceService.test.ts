/**
 * @fileoverview Unit tests for EvidenceService in src/quality/EvidenceService.ts.
 *
 * Validates runtime evidence validation, cache clearing, evidence corroboration against
 * observed ACP command execution traces, disk artifact persistence, and evidence reusability
 * checks across resumed execution runs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EvidenceService } from '../../src/quality/EvidenceService.js';
import type { ExecutionEvidence, CommandObservation, StageRuntimeState } from '../../src/types.js';

test('EvidenceService: validateRuntimeEvidence and clearRuntimeEvidence', () => {
  const tmpRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-svc-test-'));
  const service = new EvidenceService(tmpRuntimeRoot);
  const stageName = 'stage-test-evidence-svc';
  const stageDir = path.join(tmpRuntimeRoot, stageName);
  fs.mkdirSync(stageDir, { recursive: true });

  try {
    const invalidRes = service.validateRuntimeEvidence(stageName, 1);
    assert.equal(invalidRes.ok, false);

    const evidenceData: ExecutionEvidence = {
      stage: stageName,
      attempt: 1,
      status: 'PASS',
      quality_command: 'npm test',
      quality_exit_code: 0,
      git_diff_check_exit_code: 0,
      focused_tests: [],
      quality_summary: 'All tests passed.',
      changed_files: ['file.ts'],
      unresolved: []
    };

    fs.writeFileSync(path.join(stageDir, 'evidence.json'), JSON.stringify(evidenceData));
    const validRes = service.validateRuntimeEvidence(stageName, 1);
    assert.equal(validRes.ok, true);
    assert.equal(validRes.e?.status, 'PASS');

    service.clearRuntimeEvidence(stageName);
    assert.equal(fs.existsSync(path.join(stageDir, 'evidence.json')), false);
  } finally {
    fs.rmSync(tmpRuntimeRoot, { recursive: true, force: true });
  }
});

test('EvidenceService: corroborate validates matching observations and patch fingerprint', () => {
  const service = new EvidenceService();
  const stageName = 'stage-corroborate-svc';
  const attempt = 1;

  const evidence: ExecutionEvidence = {
    stage: stageName,
    attempt,
    status: 'PASS',
    quality_command: 'npm run test:unit',
    quality_exit_code: 0,
    git_diff_check_exit_code: 0,
    focused_tests: [],
    quality_summary: 'OK',
    changed_files: [],
    unresolved: []
  };

  const observations: CommandObservation[] = [
    {
      observation_id: 'obs-1',
      session_id: 'sess-1',
      tool_id: 'tool-1',
      tool_call_id: 'tool-1',
      sequence: 1,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'npm run test:unit',
      normalized_command: 'npm run test:unit',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      quality_epoch_id: 'epoch-1'
    },
    {
      observation_id: 'obs-2',
      session_id: 'sess-1',
      tool_id: 'tool-2',
      tool_call_id: 'tool-2',
      sequence: 2,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'git diff --check',
      normalized_command: 'git diff --check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      quality_epoch_id: 'epoch-1'
    }
  ];

  const corroboration = service.corroborate(evidence, observations, {
    stage: stageName,
    attempt,
    quality_epoch_id: 'epoch-1',
    expected_patch_fingerprint: 'patch-fp-123',
    last_mutation_sequence: 0,
    orchestrator_diff_check_ok: true
  });

  assert.equal(corroboration.ok, true);
  assert.equal(corroboration.evidence?.patch_fingerprint, 'patch-fp-123');
  assert.equal(corroboration.issues.length, 0);

  // Missing command fails corroboration
  const failingCorroboration = service.corroborate(evidence, [], {
    stage: stageName,
    attempt,
    expected_patch_fingerprint: 'patch-fp-123',
    last_mutation_sequence: 0,
    orchestrator_diff_check_ok: true
  });
  assert.equal(failingCorroboration.ok, false);
  assert.ok(failingCorroboration.issues.length > 0);
});

test('EvidenceService: saveCorroboratedEvidence writes json and markdown files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-save-'));
  try {
    const service = new EvidenceService();
    const evidence: ExecutionEvidence = {
      stage: 'stage-01',
      attempt: 2,
      status: 'PASS',
      quality_command: 'npm test',
      quality_exit_code: 0,
      git_diff_check_exit_code: 0,
      focused_tests: [],
      quality_summary: 'Passes',
      changed_files: [],
      unresolved: []
    };

    const savedJson = service.saveCorroboratedEvidence(tmpDir, evidence, 2);
    assert.ok(fs.existsSync(savedJson));
    assert.ok(fs.existsSync(path.join(tmpDir, 'evidence-attempt-2.md')));

    const parsed = JSON.parse(fs.readFileSync(savedJson, 'utf8'));
    assert.equal(parsed.attempt, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('EvidenceService: checkReusableEvidence validates cached evidence validity', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-reusable-'));
  try {
    const service = new EvidenceService();
    const evidenceFile = path.join(tmpDir, 'evidence-attempt-1.json');
    const evidence: ExecutionEvidence = {
      stage: 'stage-01',
      attempt: 1,
      status: 'PASS',
      quality_command: 'npm test',
      quality_exit_code: 0,
      git_diff_check_exit_code: 0,
      focused_tests: [],
      quality_summary: 'OK',
      changed_files: [],
      unresolved: []
    };
    fs.writeFileSync(evidenceFile, JSON.stringify(evidence));

    const validState: StageRuntimeState = {
      version: 1,
      phase: 'review',
      evidence_file: evidenceFile,
      patch_fingerprint: 'fp-match-123'
    };

    const reusable = service.checkReusableEvidence(validState, 'fp-match-123');
    assert.equal(reusable?.ok, true);
    assert.equal(reusable?.resumed, true);
    assert.equal(reusable?.e.status, 'PASS');

    // Mismatched patch fingerprint cannot be reused
    const staleReusable = service.checkReusableEvidence(validState, 'fp-different');
    assert.equal(staleReusable, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
