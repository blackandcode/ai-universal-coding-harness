/**
 * @fileoverview Evidence integrity and quality corroboration regression tests.
 *
 * Validates that old attempts, post-verification file edits, missing or uncorroborated
 * quality commands, late failures, patch fingerprint mismatches, and untracked files
 * prevent false positive verification.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyEvidenceAgainstObserved,
  commandMatches
} from '../../src/quality/EvidenceVerifier.js';
import type { ExecutionEvidence, CommandObservation } from '../../src/types.js';

const baseEvidence: ExecutionEvidence = {
  stage: 'stage-03',
  attempt: 2,
  status: 'PASS',
  quality_command: 'npm run check',
  quality_exit_code: 0,
  git_diff_check_exit_code: 0,
  focused_tests: [],
  quality_summary: 'All unit and verification suites pass.',
  changed_files: ['src/core/fs.ts'],
  unresolved: [],
  patch_fingerprint: 'fp-valid-attempt-2'
};

test('evidence integrity: current attempt pass is accepted', () => {
  const commands: CommandObservation[] = [
    {
      observation_id: 'obs-1',
      session_id: 'sess-1',
      tool_id: 'tool-1',
      tool_call_id: 'tool-1',
      sequence: 10,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'npm run check',
      normalized_command: 'npm run check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      stage: 'stage-03',
      attempt: 2
    },
    {
      observation_id: 'obs-2',
      session_id: 'sess-1',
      tool_id: 'tool-2',
      tool_call_id: 'tool-2',
      sequence: 11,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'git diff --check',
      normalized_command: 'git diff --check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      stage: 'stage-03',
      attempt: 2
    }
  ];

  const r = verifyEvidenceAgainstObserved(baseEvidence, commands, {
    stage: 'stage-03',
    attempt: 2,
    expected_patch_fingerprint: 'fp-valid-attempt-2',
    last_mutation_sequence: 8,
    orchestrator_diff_check_ok: true
  });

  assert.equal(r.ok, true);
  assert.equal(r.issues.length, 0);
});

test('evidence integrity: old attempt pass is rejected when attempting attempt 2', () => {
  const commands: CommandObservation[] = [
    {
      observation_id: 'obs-old-1',
      session_id: 'sess-1',
      tool_id: 'tool-1',
      tool_call_id: 'tool-1',
      sequence: 5,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'npm run check',
      normalized_command: 'npm run check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      stage: 'stage-03',
      attempt: 1 // Prior attempt!
    },
    {
      observation_id: 'obs-old-2',
      session_id: 'sess-1',
      tool_id: 'tool-2',
      tool_call_id: 'tool-2',
      sequence: 6,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'git diff --check',
      normalized_command: 'git diff --check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      stage: 'stage-03',
      attempt: 1
    }
  ];

  const r = verifyEvidenceAgainstObserved(baseEvidence, commands, {
    stage: 'stage-03',
    attempt: 2 // Current attempt requires attempt 2 observations
  });

  assert.equal(r.ok, false);
  assert.match(r.issues.join(' '), /Quality command was not observed/);
});

test('evidence integrity: pass followed by later repository mutation is rejected', () => {
  const commands: CommandObservation[] = [
    {
      observation_id: 'obs-1',
      session_id: 'sess-1',
      tool_id: 'tool-1',
      tool_call_id: 'tool-1',
      sequence: 15,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'npm run check',
      normalized_command: 'npm run check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      stage: 'stage-03',
      attempt: 2
    },
    {
      observation_id: 'obs-2',
      session_id: 'sess-1',
      tool_id: 'tool-2',
      tool_call_id: 'tool-2',
      sequence: 16,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'git diff --check',
      normalized_command: 'git diff --check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      stage: 'stage-03',
      attempt: 2
    }
  ];

  // A file edit took place at sequence 20 (after sequence 15 and 16)
  const r = verifyEvidenceAgainstObserved(baseEvidence, commands, {
    stage: 'stage-03',
    attempt: 2,
    last_mutation_sequence: 20
  });

  assert.equal(r.ok, false);
  assert.match(r.issues.join(' '), /Quality command ran before file edits were made/);
  assert.match(r.issues.join(' '), /git diff --check ran before file edits were made/);
});

test('evidence integrity: latest failing command beats earlier pass', () => {
  const commands: CommandObservation[] = [
    {
      observation_id: 'obs-1',
      session_id: 'sess-1',
      tool_id: 'tool-1',
      tool_call_id: 'tool-1',
      sequence: 10,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'npm run check',
      normalized_command: 'npm run check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      stage: 'stage-03',
      attempt: 2
    },
    {
      observation_id: 'obs-2',
      session_id: 'sess-1',
      tool_id: 'tool-2',
      tool_call_id: 'tool-2',
      sequence: 12,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'npm run check',
      normalized_command: 'npm run check',
      command_confidence: 'high',
      status: 'failed',
      exit_code: 1, // Latest execution failed!
      stage: 'stage-03',
      attempt: 2
    },
    {
      observation_id: 'obs-3',
      session_id: 'sess-1',
      tool_id: 'tool-3',
      tool_call_id: 'tool-3',
      sequence: 13,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'git diff --check',
      normalized_command: 'git diff --check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      stage: 'stage-03',
      attempt: 2
    }
  ];

  const r = verifyEvidenceAgainstObserved(baseEvidence, commands, {
    stage: 'stage-03',
    attempt: 2
  });

  assert.equal(r.ok, false);
  assert.match(r.issues.join(' '), /Quality exit mismatch: evidence=0, ACP=1/);
});

test('evidence integrity: broker source cannot silently substitute executor quality proof', () => {
  const commands: CommandObservation[] = [
    {
      observation_id: 'obs-broker-1',
      session_id: 'sess-1',
      tool_id: 'tool-1',
      tool_call_id: 'tool-1',
      sequence: 10,
      timestamp: new Date().toISOString(),
      source: 'broker', // Autonomous permission broker, NOT acp executor session!
      command: 'npm run check',
      normalized_command: 'npm run check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      stage: 'stage-03',
      attempt: 2
    },
    {
      observation_id: 'obs-2',
      session_id: 'sess-1',
      tool_id: 'tool-2',
      tool_call_id: 'tool-2',
      sequence: 11,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'git diff --check',
      normalized_command: 'git diff --check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      stage: 'stage-03',
      attempt: 2
    }
  ];

  const r = verifyEvidenceAgainstObserved(baseEvidence, commands, {
    stage: 'stage-03',
    attempt: 2
  });

  // When broker sources are disallowed for quality evidence
  assert.equal(r.ok, false);
  assert.match(r.issues.join(' '), /Quality command was not observed in Cursor ACP/);
});

test('evidence integrity: wrapper matching rejects substring false positives like echo commands', () => {
  assert.equal(commandMatches('echo "npm run check"', 'npm run check'), false);
  assert.equal(commandMatches('cat package.json | grep "npm run check"', 'npm run check'), false);
  assert.equal(commandMatches('echo npm run check', 'npm run check'), false);

  // But genuine shell wrappers match:
  assert.equal(commandMatches('bash -c "npm run check"', 'npm run check'), true);
  assert.equal(commandMatches('sh -c "npm run check"', 'npm run check'), true);
  assert.equal(commandMatches('cmd /c "npm run check"', 'npm run check'), true);
  assert.equal(commandMatches('powershell -Command "npm run check"', 'npm run check'), true);
});

test('evidence integrity: wrong working directory is rejected when cwd is available', () => {
  const commands: CommandObservation[] = [
    {
      observation_id: 'obs-cwd-1',
      session_id: 'sess-1',
      tool_id: 'tool-1',
      tool_call_id: 'tool-1',
      sequence: 10,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'npm run check',
      normalized_command: 'npm run check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      cwd: '/different/workspace/directory',
      stage: 'stage-03',
      attempt: 2
    },
    {
      observation_id: 'obs-2',
      session_id: 'sess-1',
      tool_id: 'tool-2',
      tool_call_id: 'tool-2',
      sequence: 11,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'git diff --check',
      normalized_command: 'git diff --check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      cwd: '/expected/workspace/target',
      stage: 'stage-03',
      attempt: 2
    }
  ];

  const r = verifyEvidenceAgainstObserved(baseEvidence, commands, {
    stage: 'stage-03',
    attempt: 2,
    workspace: '/expected/workspace/target'
  });

  assert.equal(r.ok, false);
  assert.match(r.issues.join(' '), /Quality command executed in wrong directory/);
});
