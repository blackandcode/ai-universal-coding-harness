/**
 * @fileoverview Unit tests for EvidenceVerifier in src/quality/EvidenceVerifier.ts.
 * Validates command normalization, matching, ACP observation corroboration, and failure detection.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyEvidenceAgainstObserved,
  normalizeCommand,
  commandMatches
} from '../../src/quality/EvidenceVerifier.js';

const evidence: any = {
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
