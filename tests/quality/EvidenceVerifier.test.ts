/**
 * @fileoverview Unit tests for EvidenceVerifier in src/quality/EvidenceVerifier.ts.
 * Validates command normalization, matching, ACP observation corroboration, and failure detection.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  verifyEvidenceAgainstObserved,
  normalizeCommand,
  commandMatches,
  validateEvidence
} from '../../src/quality/EvidenceVerifier.js';
import type { ExecutionEvidence } from '../../src/types.js';

const evidence: ExecutionEvidence = {
  stage: 'stage-01',
  attempt: 1,
  status: 'PASS',
  quality_command: 'npm run check',
  quality_exit_code: 0,
  git_diff_check_exit_code: 0,
  focused_tests: [],
  quality_summary: 'ok',
  changed_files: [],
  unresolved: []
};

test('matching ACP command exits corroborate evidence', () => {
  const r = verifyEvidenceAgainstObserved(evidence, [
    { command: 'npm run check', exit_code: 0, status: 'completed', tool_id: '1' },
    { command: 'git diff --check', exit_code: 0, status: 'completed', tool_id: '2' }
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.issues.length, 0);
});

test('fabricated green evidence is rejected', () => {
  const r = verifyEvidenceAgainstObserved(evidence, [
    { command: 'npm run check', exit_code: 1, status: 'completed', tool_id: '1' },
    { command: 'git diff --check', exit_code: 0, status: 'completed', tool_id: '2' }
  ]);
  assert.equal(r.ok, false);
  assert.match(r.issues.join(' '), /mismatch/i);
});

test('missing quality command is rejected with diagnostic listing observed commands', () => {
  const r = verifyEvidenceAgainstObserved(evidence, [
    { command: 'git status', exit_code: 0, status: 'completed', tool_id: '1' },
    { command: 'git diff --check', exit_code: 0, status: 'completed', tool_id: '2' }
  ]);
  assert.equal(r.ok, false);
  assert.match(r.issues.join(' '), /Quality command was not observed/);
  assert.match(r.issues.join(' '), /Observed 2 command\(s\)/);
});

test('wrapper command normalization matches shell prefixes and quotes', () => {
  assert.equal(normalizeCommand('bash -c "npm run check"'), 'npm run check');
  assert.equal(normalizeCommand("sh -c 'npm run check'"), 'npm run check');
  assert.equal(normalizeCommand('CI=true npm run check'), 'npm run check');
  assert.equal(normalizeCommand('  `npm run check`  '), 'npm run check');

  const r = verifyEvidenceAgainstObserved(evidence, [
    { command: 'bash -c "npm run check"', exit_code: 0, status: 'completed', tool_id: '1' },
    { command: 'git diff --check', exit_code: 0, status: 'completed', tool_id: '2' }
  ]);
  assert.equal(r.ok, true);
});

test('chained command matching recognizes components of compound command', () => {
  assert.equal(commandMatches('npm run check && git diff --check', 'npm run check'), true);
  assert.equal(commandMatches('npm run check && git diff --check', 'git diff --check'), true);

  const r = verifyEvidenceAgainstObserved(evidence, [
    {
      command: 'npm run check && git diff --check',
      exit_code: 0,
      status: 'completed',
      tool_id: '1'
    }
  ]);
  assert.equal(r.ok, true);
});

test('sequence ordering fails if file mutation happened after quality command', () => {
  const r = verifyEvidenceAgainstObserved(
    evidence,
    [
      { command: 'npm run check', exit_code: 0, status: 'completed', tool_id: '1', sequence: 5 },
      { command: 'git diff --check', exit_code: 0, status: 'completed', tool_id: '2', sequence: 6 }
    ],
    {
      last_mutation_sequence: 10
    }
  );
  assert.equal(r.ok, false);
  assert.match(r.issues.join(' '), /Quality command ran before file edits were made/);
});

test('authoritative git diff check failure in context causes rejection', () => {
  const r = verifyEvidenceAgainstObserved(
    evidence,
    [
      { command: 'npm run check', exit_code: 0, status: 'completed', tool_id: '1' },
      { command: 'git diff --check', exit_code: 0, status: 'completed', tool_id: '2' }
    ],
    {
      orchestrator_diff_check_ok: false
    }
  );
  assert.equal(r.ok, false);
  assert.match(r.issues.join(' '), /Authoritative git diff check failed/);
});

test('patch fingerprint mismatch in context causes rejection', () => {
  const evidenceWithFingerprint = {
    ...evidence,
    patch_fingerprint: 'sha256-abc123'
  };
  const r = verifyEvidenceAgainstObserved(
    evidenceWithFingerprint,
    [
      { command: 'npm run check', exit_code: 0, status: 'completed', tool_id: '1' },
      { command: 'git diff --check', exit_code: 0, status: 'completed', tool_id: '2' }
    ],
    {
      expected_patch_fingerprint: 'sha256-def456'
    }
  );
  assert.equal(r.ok, false);
  assert.match(r.issues.join(' '), /Evidence patch fingerprint mismatch/);
});

test('validateEvidence asserts schema and required fields of evidence.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-val-'));
  try {
    const missing = validateEvidence(path.join(tmpDir, 'missing.json'), 'stage-01', 1);
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'evidence.json missing');

    const corruptFile = path.join(tmpDir, 'corrupt.json');
    fs.writeFileSync(corruptFile, '{ invalid json');
    const corrupt = validateEvidence(corruptFile, 'stage-01', 1);
    assert.equal(corrupt.ok, false);
    assert.equal(corrupt.reason, 'evidence.json invalid JSON');

    const nonObjFile = path.join(tmpDir, 'nonobj.json');
    fs.writeFileSync(nonObjFile, '"just a string"');
    const nonObj = validateEvidence(nonObjFile, 'stage-01', 1);
    assert.equal(nonObj.ok, false);
    assert.equal(nonObj.reason, 'evidence.json missing/invalid required fields');

    const validFile = path.join(tmpDir, 'valid.json');
    fs.writeFileSync(validFile, JSON.stringify(evidence));
    const valid = validateEvidence(validFile, 'stage-01', 1);
    assert.equal(valid.ok, true);
    assert.equal(valid.e?.stage, 'stage-01');

    // validateEvidence with optional attempt omitted
    const validNoAttempt = validateEvidence(validFile, 'stage-01');
    assert.equal(validNoAttempt.ok, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('verifyEvidenceAgainstObserved covers edge cases: null exits, mismatch, directory checks', () => {
  // 1. Observed quality command with null exit code
  const rNullQ = verifyEvidenceAgainstObserved(evidence, [
    { command: 'npm run check', exit_code: null, status: 'in_progress', tool_id: '1' },
    { command: 'git diff --check', exit_code: 0, status: 'completed', tool_id: '2' }
  ]);
  assert.equal(rNullQ.ok, false);
  assert.ok(rNullQ.issues.some((i) => i.includes('has no exit code')));

  // 2. Observed quality exit mismatch
  const rExitMismatch = verifyEvidenceAgainstObserved(evidence, [
    { command: 'npm run check', exit_code: 1, status: 'completed', tool_id: '1' },
    { command: 'git diff --check', exit_code: 0, status: 'completed', tool_id: '2' }
  ]);
  assert.equal(rExitMismatch.ok, false);
  assert.ok(rExitMismatch.issues.some((i) => i.includes('Quality exit mismatch')));

  // 3. Observed git diff --check with null exit code
  const rNullD = verifyEvidenceAgainstObserved(evidence, [
    { command: 'npm run check', exit_code: 0, status: 'completed', tool_id: '1' },
    { command: 'git diff --check', exit_code: null, status: 'in_progress', tool_id: '2' }
  ]);
  assert.equal(rNullD.ok, false);
  assert.ok(rNullD.issues.some((i) => i.includes('git diff --check has no exit code')));

  // 4. Observed git diff --check exit mismatch
  const rDiffMismatch = verifyEvidenceAgainstObserved(evidence, [
    { command: 'npm run check', exit_code: 0, status: 'completed', tool_id: '1' },
    { command: 'git diff --check', exit_code: 1, status: 'completed', tool_id: '2' }
  ]);
  assert.equal(rDiffMismatch.ok, false);
  assert.ok(rDiffMismatch.issues.some((i) => i.includes('git diff --check exit mismatch')));

  // 5. Wrong directory check
  const rWrongDir = verifyEvidenceAgainstObserved(
    evidence,
    [
      {
        command: 'npm run check',
        exit_code: 0,
        status: 'completed',
        tool_id: '1',
        cwd: '/wrong/path'
      },
      { command: 'git diff --check', exit_code: 0, status: 'completed', tool_id: '2' }
    ],
    { workspace: '/expected/path' }
  );
  assert.equal(rWrongDir.ok, false);
  assert.ok(rWrongDir.issues.some((i) => i.includes('wrong directory')));
});
