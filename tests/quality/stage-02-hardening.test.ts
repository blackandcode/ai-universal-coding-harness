/**
 * @fileoverview Exhaustive regression test suite for Stage 02: Evidence, State and Recovery Trust Hardening.
 *
 * Implements all 17 explicit regression tests mandated by Stage 02 specifications:
 * 1. wrong quality epoch rejected
 * 2. missing quality epoch rejected in scoped verification
 * 3. wrong session rejected
 * 4. missing session rejected when context requires one
 * 5. wrong run id rejected
 * 6. old-attempt observation rejected even if command/exit match
 * 7. corrupt reusable evidence rejected
 * 8. reusable FAIL evidence rejected
 * 9. reusable evidence with non-zero exit rejected
 * 10. reusable evidence with unresolved items rejected
 * 11. resumed evidence with failed corroboration routes to QUALITY
 * 12. recovery with missing patch fingerprint routes to QUALITY
 * 13. recovery with wrong epoch routes to QUALITY
 * 14. raw replay reconstructs epoch boundaries
 * 15. corrupt stage-state file throws RunStateError
 * 16. nested invalid RunState.stages[] is rejected
 * 17. missing stage-state file still returns intentional pending default
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

import {
  verifyEvidenceAgainstObserved,
  validateCorroboratedEvidence
} from '../../src/quality/EvidenceVerifier.js';
import { RunStateStore, RunStateError, validateRunState } from '../../src/state/RunStateStore.js';
import { RecoveryManager } from '../../src/orchestrator/RecoveryManager.js';
import { GitRepository } from '../../src/git/GitRepository.js';
import { parseAcpEvents } from '../../src/harness/cursor/CursorExecutorHarness.js';
import type { ExecutionEvidence, CommandObservation } from '../../src/types.js';

function createTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage02-hardening-git-'));
  execSync('git init -b main', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Harness Test"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, '.gitignore'), '.ai-orchestrator/\n');
  fs.writeFileSync(path.join(dir, 'README.md'), '# Test\n');
  execSync('git add .gitignore README.md && git commit -m "init"', { cwd: dir, stdio: 'ignore' });
  return dir;
}

function mkObs(partial: Partial<CommandObservation> & { command: string }): CommandObservation {
  return {
    observation_id: partial.observation_id || `obs-${Math.random().toString(36).slice(2)}`,
    session_id: partial.session_id !== undefined ? partial.session_id : 's1',
    tool_id: partial.tool_id || 'bash',
    tool_call_id: partial.tool_call_id || 'tc',
    sequence: partial.sequence ?? 1,
    timestamp: partial.timestamp || new Date().toISOString(),
    source: partial.source || 'acp',
    command: partial.command,
    normalized_command: partial.normalized_command || partial.command,
    command_confidence: partial.command_confidence || 'high',
    status: partial.status || 'completed',
    exit_code: partial.exit_code ?? 0,
    stage: partial.stage,
    attempt: partial.attempt,
    run_id: partial.run_id,
    quality_epoch_id: partial.quality_epoch_id,
    cwd: partial.cwd
  };
}

const basePassEvidence: ExecutionEvidence = {
  stage: 'stage-01',
  attempt: 2,
  status: 'PASS',
  quality_command: 'npm test',
  quality_exit_code: 0,
  git_diff_check_exit_code: 0,
  focused_tests: [],
  quality_summary: 'All checks passed',
  changed_files: ['file.txt'],
  unresolved: [],
  patch_fingerprint: 'fp-target-123',
  quality_epoch_id: 'epoch-target-456'
};

// 1. wrong quality epoch rejected
test('Stage 02 Regression: 1. wrong quality epoch rejected', () => {
  const commands: CommandObservation[] = [
    mkObs({
      command: 'npm test',
      stage: 'stage-01',
      attempt: 2,
      run_id: 'run-1',
      quality_epoch_id: 'epoch-wrong-789'
    }),
    mkObs({
      command: 'git diff --check',
      stage: 'stage-01',
      attempt: 2,
      run_id: 'run-1',
      quality_epoch_id: 'epoch-target-456'
    })
  ];

  const result = verifyEvidenceAgainstObserved(basePassEvidence, commands, {
    stage: 'stage-01',
    attempt: 2,
    runId: 'run-1',
    sessionId: 's1',
    qualityEpochId: 'epoch-target-456'
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.includes('Quality command was not observed')));
  assert.ok(result.issues.some((i) => i.includes('epoch-wrong-789')));
});

// 2. missing quality epoch rejected in scoped verification
test('Stage 02 Regression: 2. missing quality epoch rejected in scoped verification', () => {
  const commands: CommandObservation[] = [
    mkObs({
      command: 'npm test',
      stage: 'stage-01',
      attempt: 2,
      run_id: 'run-1'
      // missing quality_epoch_id
    }),
    mkObs({
      command: 'git diff --check',
      stage: 'stage-01',
      attempt: 2,
      run_id: 'run-1',
      quality_epoch_id: 'epoch-target-456'
    })
  ];

  const result = verifyEvidenceAgainstObserved(basePassEvidence, commands, {
    stage: 'stage-01',
    attempt: 2,
    qualityEpochId: 'epoch-target-456'
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.includes('lacks quality_epoch_id')));
});

// 3. wrong session rejected
test('Stage 02 Regression: 3. wrong session rejected', () => {
  const commands: CommandObservation[] = [
    mkObs({
      command: 'npm test',
      session_id: 's-other',
      stage: 'stage-01',
      attempt: 2,
      run_id: 'run-1',
      quality_epoch_id: 'epoch-target-456'
    }),
    mkObs({
      command: 'git diff --check',
      session_id: 's-active',
      stage: 'stage-01',
      attempt: 2,
      run_id: 'run-1',
      quality_epoch_id: 'epoch-target-456'
    })
  ];

  const result = verifyEvidenceAgainstObserved(basePassEvidence, commands, {
    stage: 'stage-01',
    attempt: 2,
    sessionId: 's-active',
    qualityEpochId: 'epoch-target-456'
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((i) =>
      i.includes('Observation session_id "s-other" does not match expected "s-active"')
    )
  );
});

// 4. missing session rejected when context requires one
test('Stage 02 Regression: 4. missing session rejected when context requires one', () => {
  const commands: CommandObservation[] = [
    mkObs({
      command: 'npm test',
      session_id: '',
      stage: 'stage-01',
      attempt: 2,
      quality_epoch_id: 'epoch-target-456'
    }),
    mkObs({
      command: 'git diff --check',
      session_id: 's-active',
      stage: 'stage-01',
      attempt: 2,
      quality_epoch_id: 'epoch-target-456'
    })
  ];

  const result = verifyEvidenceAgainstObserved(basePassEvidence, commands, {
    stage: 'stage-01',
    attempt: 2,
    sessionId: 's-active',
    qualityEpochId: 'epoch-target-456'
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.includes('Observation lacks session_id')));
});

// 5. wrong run id rejected
test('Stage 02 Regression: 5. wrong run id rejected', () => {
  const commands: CommandObservation[] = [
    mkObs({
      command: 'npm test',
      session_id: 's1',
      run_id: 'run-other',
      stage: 'stage-01',
      attempt: 2,
      quality_epoch_id: 'epoch-target-456'
    }),
    mkObs({
      command: 'git diff --check',
      session_id: 's1',
      run_id: 'run-active',
      stage: 'stage-01',
      attempt: 2,
      quality_epoch_id: 'epoch-target-456'
    })
  ];

  const result = verifyEvidenceAgainstObserved(basePassEvidence, commands, {
    stage: 'stage-01',
    attempt: 2,
    runId: 'run-active',
    qualityEpochId: 'epoch-target-456'
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((i) =>
      i.includes('Observation run_id "run-other" does not match expected "run-active"')
    )
  );
});

// 6. old-attempt observation rejected even if command/exit match
test('Stage 02 Regression: 6. old-attempt observation rejected even if command/exit match', () => {
  const commands: CommandObservation[] = [
    mkObs({
      command: 'npm test',
      session_id: 's1',
      run_id: 'run-active',
      stage: 'stage-01',
      attempt: 1, // Prior attempt!
      quality_epoch_id: 'epoch-target-456'
    }),
    mkObs({
      command: 'git diff --check',
      session_id: 's1',
      run_id: 'run-active',
      stage: 'stage-01',
      attempt: 2,
      quality_epoch_id: 'epoch-target-456'
    })
  ];

  const result = verifyEvidenceAgainstObserved(basePassEvidence, commands, {
    stage: 'stage-01',
    attempt: 2,
    runId: 'run-active',
    qualityEpochId: 'epoch-target-456'
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((i) => i.includes('Observation attempt 1 does not match expected attempt 2'))
  );
});

// 7. corrupt reusable evidence rejected
test('Stage 02 Regression: 7. corrupt reusable evidence rejected', () => {
  const invalidJsonString = '{ "stage": "stage-01", corrupt';
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(invalidJsonString);
  } catch {
    parsed = invalidJsonString;
  }
  const result = validateCorroboratedEvidence(parsed);
  assert.equal(result.ok, false);

  const nonObjResult = validateCorroboratedEvidence(42);
  assert.equal(nonObjResult.ok, false);
  assert.match(nonObjResult.reason, /evidence\.json missing\/invalid required fields/);
});

// 8. reusable FAIL evidence rejected
test('Stage 02 Regression: 8. reusable FAIL evidence rejected', () => {
  const failEvidence: ExecutionEvidence = {
    ...basePassEvidence,
    status: 'FAIL'
  };
  const result = validateCorroboratedEvidence(failEvidence);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Corroborated evidence status must be "PASS"/);
});

// 9. reusable evidence with non-zero exit rejected
test('Stage 02 Regression: 9. reusable evidence with non-zero exit rejected', () => {
  const badQualityExit: ExecutionEvidence = {
    ...basePassEvidence,
    quality_exit_code: 1
  };
  const result1 = validateCorroboratedEvidence(badQualityExit);
  assert.equal(result1.ok, false);
  assert.match(result1.reason, /Corroborated evidence quality_exit_code must be 0/);

  const badDiffExit: ExecutionEvidence = {
    ...basePassEvidence,
    git_diff_check_exit_code: 1
  };
  const result2 = validateCorroboratedEvidence(badDiffExit);
  assert.equal(result2.ok, false);
  assert.match(result2.reason, /Corroborated evidence git_diff_check_exit_code must be 0/);
});

// 10. reusable evidence with unresolved items rejected
test('Stage 02 Regression: 10. reusable evidence with unresolved items rejected', () => {
  const unresolvedEvidence: ExecutionEvidence = {
    ...basePassEvidence,
    unresolved: ['Fix remaining flake in login test']
  };
  const result = validateCorroboratedEvidence(unresolvedEvidence);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Corroborated evidence has 1 unresolved item\(s\)/);
});

// 11. resumed evidence with failed corroboration routes to QUALITY
test('Stage 02 Regression: 11. resumed evidence with failed corroboration routes to QUALITY', async () => {
  const repoDir = createTempGitRepo();
  try {
    const git = new GitRepository(repoDir);
    const store = new RunStateStore(path.join(repoDir, '.ai-orchestrator', 'runs'));
    const runId = 'run-failed-corrob-resume';
    const stageName = 'stage-01';
    const stageDir = store.stageDir(runId, stageName);
    fs.mkdirSync(stageDir, { recursive: true });

    fs.writeFileSync(path.join(repoDir, 'code.txt'), 'edit\n');
    const patchFp = git.patchFingerprint();
    const epochId = 'epoch-resume-failed';

    const evidence: ExecutionEvidence = {
      ...basePassEvidence,
      patch_fingerprint: patchFp,
      quality_epoch_id: epochId
    };
    const evidencePath = path.join(stageDir, 'evidence-attempt-1.json');
    fs.writeFileSync(evidencePath, JSON.stringify(evidence));

    // ACP log with command failure (exit code 1) -> corroboration fails!
    const acp = [
      `EPOCH {"record_type":"quality_epoch_started","quality_epoch_id":"${epochId}","stage":"${stageName}","attempt":1,"run_id":"${runId}","sequence":0,"timestamp":"${new Date().toISOString()}"}`,
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Run","status":"completed","rawInput":{"command":"npm test"},"rawOutput":{"exit_code":1}}}}'
    ];
    fs.writeFileSync(path.join(stageDir, 'executor-acp.jsonl'), acp.join('\n') + '\n');

    store.save({
      version: 1,
      run_id: runId,
      created_at: new Date().toISOString(),
      status: 'failed',
      workspace: repoDir,
      base_ref: 'HEAD',
      base_commit: git.head(),
      branch: 'ai-harness/test-11',
      branch_created: true,
      original_branch: 'main',
      original_head: git.head(),
      stage_source: 'stages',
      feature: null,
      stages: [
        {
          name: stageName,
          selector: '01',
          status: 'failed',
          manifest: {
            name: stageName,
            selector: '01',
            source: 'stages',
            relative_path: stageName,
            sha256: {}
          }
        }
      ],
      executor_harness: 'cursor',
      reviewer_harness: 'codex',
      quality_cmd: 'npm test'
    });

    store.saveStage(runId, stageName, {
      phase: 'implementation',
      attempt: 1,
      evidence_file: evidencePath,
      patch_fingerprint: patchFp
    });

    const recovery = new RecoveryManager(repoDir, store, git);
    const plan = await recovery.recover({ runId, stageName, apply: false });

    // Because corroboration failed (npm test exit code was 1 in ACP), must route to quality!
    assert.equal(plan.resumePhase, 'quality');
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

// 12. recovery with missing patch fingerprint routes to QUALITY
test('Stage 02 Regression: 12. recovery with missing patch fingerprint routes to QUALITY', async () => {
  const repoDir = createTempGitRepo();
  try {
    const git = new GitRepository(repoDir);
    const store = new RunStateStore(path.join(repoDir, '.ai-orchestrator', 'runs'));
    const runId = 'run-missing-fp';
    const stageName = 'stage-01';
    const stageDir = store.stageDir(runId, stageName);
    fs.mkdirSync(stageDir, { recursive: true });

    fs.writeFileSync(path.join(repoDir, 'code.txt'), 'edit\n');
    const epochId = 'epoch-fp-test';

    // Evidence missing patch_fingerprint
    const evidence: ExecutionEvidence = {
      ...basePassEvidence,
      quality_epoch_id: epochId,
      patch_fingerprint: undefined
    };
    const evidencePath = path.join(stageDir, 'evidence-attempt-1.json');
    fs.writeFileSync(evidencePath, JSON.stringify(evidence));

    const acp = [
      `EPOCH {"record_type":"quality_epoch_started","quality_epoch_id":"${epochId}","stage":"${stageName}","attempt":1,"run_id":"${runId}","sequence":0,"timestamp":"${new Date().toISOString()}"}`,
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Run","status":"completed","rawInput":{"command":"npm test"},"rawOutput":{"exit_code":0}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t2","title":"Run","status":"completed","rawInput":{"command":"git diff --check"},"rawOutput":{"exit_code":0}}}}'
    ];
    fs.writeFileSync(path.join(stageDir, 'executor-acp.jsonl'), acp.join('\n') + '\n');

    store.save({
      version: 1,
      run_id: runId,
      created_at: new Date().toISOString(),
      status: 'failed',
      workspace: repoDir,
      base_ref: 'HEAD',
      base_commit: git.head(),
      branch: 'ai-harness/test-12',
      branch_created: true,
      original_branch: 'main',
      original_head: git.head(),
      stage_source: 'stages',
      feature: null,
      stages: [
        {
          name: stageName,
          selector: '01',
          status: 'failed',
          manifest: {
            name: stageName,
            selector: '01',
            source: 'stages',
            relative_path: stageName,
            sha256: {}
          }
        }
      ],
      executor_harness: 'cursor',
      reviewer_harness: 'codex',
      quality_cmd: 'npm test'
    });

    store.saveStage(runId, stageName, {
      phase: 'implementation',
      attempt: 1,
      evidence_file: evidencePath
    });

    const recovery = new RecoveryManager(repoDir, store, git);
    const plan = await recovery.recover({ runId, stageName, apply: false });

    assert.equal(plan.resumePhase, 'quality');
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

// 13. recovery with wrong epoch routes to QUALITY
test('Stage 02 Regression: 13. recovery with wrong epoch routes to QUALITY', async () => {
  const repoDir = createTempGitRepo();
  try {
    const git = new GitRepository(repoDir);
    const store = new RunStateStore(path.join(repoDir, '.ai-orchestrator', 'runs'));
    const runId = 'run-wrong-epoch';
    const stageName = 'stage-01';
    const stageDir = store.stageDir(runId, stageName);
    fs.mkdirSync(stageDir, { recursive: true });

    fs.writeFileSync(path.join(repoDir, 'code.txt'), 'edit\n');
    const patchFp = git.patchFingerprint();

    // Evidence declared with epoch A
    const evidence: ExecutionEvidence = {
      ...basePassEvidence,
      patch_fingerprint: patchFp,
      quality_epoch_id: 'epoch-declared-A'
    };
    const evidencePath = path.join(stageDir, 'evidence-attempt-1.json');
    fs.writeFileSync(evidencePath, JSON.stringify(evidence));

    // ACP log recorded under epoch B
    const acp = [
      `EPOCH {"record_type":"quality_epoch_started","quality_epoch_id":"epoch-logged-B","stage":"${stageName}","attempt":1,"run_id":"${runId}","sequence":0,"timestamp":"${new Date().toISOString()}"}`,
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Run","status":"completed","rawInput":{"command":"npm test"},"rawOutput":{"exit_code":0}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t2","title":"Run","status":"completed","rawInput":{"command":"git diff --check"},"rawOutput":{"exit_code":0}}}}'
    ];
    fs.writeFileSync(path.join(stageDir, 'executor-acp.jsonl'), acp.join('\n') + '\n');

    store.save({
      version: 1,
      run_id: runId,
      created_at: new Date().toISOString(),
      status: 'failed',
      workspace: repoDir,
      base_ref: 'HEAD',
      base_commit: git.head(),
      branch: 'ai-harness/test-13',
      branch_created: true,
      original_branch: 'main',
      original_head: git.head(),
      stage_source: 'stages',
      feature: null,
      stages: [
        {
          name: stageName,
          selector: '01',
          status: 'failed',
          manifest: {
            name: stageName,
            selector: '01',
            source: 'stages',
            relative_path: stageName,
            sha256: {}
          }
        }
      ],
      executor_harness: 'cursor',
      reviewer_harness: 'codex',
      quality_cmd: 'npm test'
    });

    store.saveStage(runId, stageName, {
      phase: 'implementation',
      attempt: 1,
      evidence_file: evidencePath,
      patch_fingerprint: patchFp
    });

    const recovery = new RecoveryManager(repoDir, store, git);
    const plan = await recovery.recover({ runId, stageName, apply: false });

    assert.equal(plan.resumePhase, 'quality');
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

// 14. raw replay reconstructs epoch boundaries
test('Stage 02 Regression: 14. raw replay reconstructs epoch boundaries', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-replay-'));
  try {
    const acpFile = path.join(tmpDir, 'executor-acp.jsonl');
    const acpLines = [
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"pre1","title":"Run","status":"completed","rawInput":{"command":"echo pre"},"rawOutput":{"exit_code":0}}}}',
      'EPOCH {"record_type":"quality_epoch_started","quality_epoch_id":"epoch-recon-1","stage":"stage-recon","attempt":3,"run_id":"run-recon","sequence":10,"timestamp":"2026-09-16T12:00:00.000Z"}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Run","status":"completed","rawInput":{"command":"npm test"},"rawOutput":{"exit_code":0}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t2","title":"Run","status":"completed","rawInput":{"command":"git diff --check"},"rawOutput":{"exit_code":0}}}}'
    ];
    fs.writeFileSync(acpFile, acpLines.join('\n') + '\n');

    const obs = parseAcpEvents(acpFile, { workspace: tmpDir });

    assert.equal(obs.length, 3);
    // Pre-epoch command should NOT have epoch-recon-1
    assert.equal(obs[0].command, 'echo pre');
    assert.equal(obs[0].quality_epoch_id, undefined);

    // Post-epoch commands MUST have reconstructed epoch and metadata
    assert.equal(obs[1].command, 'npm test');
    assert.equal(obs[1].quality_epoch_id, 'epoch-recon-1');
    assert.equal(obs[1].stage, 'stage-recon');
    assert.equal(obs[1].attempt, 3);
    assert.equal(obs[1].run_id, 'run-recon');

    assert.equal(obs[2].command, 'git diff --check');
    assert.equal(obs[2].quality_epoch_id, 'epoch-recon-1');
    assert.equal(obs[2].stage, 'stage-recon');
    assert.equal(obs[2].attempt, 3);
    assert.equal(obs[2].run_id, 'run-recon');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// 15. corrupt stage-state file throws RunStateError
test('Stage 02 Regression: 15. corrupt stage-state file throws RunStateError', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-corrupt-'));
  try {
    const store = new RunStateStore(tmpDir);
    const stageDir = store.stageDir('run-1', 'stage-01');
    fs.mkdirSync(stageDir, { recursive: true });
    fs.writeFileSync(path.join(stageDir, 'stage-state.json'), '{ corrupt json');

    assert.throws(() => store.loadStage('run-1', 'stage-01'), RunStateError);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// 16. nested invalid RunState.stages[] is rejected
test('Stage 02 Regression: 16. nested invalid RunState.stages[] is rejected', () => {
  const validBase: unknown = {
    version: 1,
    run_id: 'test-run',
    created_at: new Date().toISOString(),
    status: 'running',
    workspace: '/test',
    base_ref: 'HEAD',
    base_commit: 'abc',
    branch: 'ai-harness/test',
    branch_created: true,
    original_branch: 'main',
    original_head: 'abc',
    stage_source: 'stages',
    feature: null,
    stages: [
      {
        name: 'stage-01',
        selector: '01',
        status: 'invalid_status_enum', // Invalid status!
        manifest: {
          name: 'stage-01',
          selector: '01',
          source: 'stages',
          relative_path: 'stage-01',
          sha256: {}
        }
      }
    ],
    executor_harness: 'cursor',
    reviewer_harness: 'codex',
    quality_cmd: 'npm test'
  };

  assert.throws(() => validateRunState(validBase), RunStateError);

  const missingManifest: unknown = {
    ...(validBase as Record<string, unknown>),
    stages: [
      {
        name: 'stage-01',
        selector: '01',
        status: 'pending'
        // Missing manifest!
      }
    ]
  };

  assert.throws(() => validateRunState(missingManifest), RunStateError);
});

// 17. missing stage-state file still returns intentional pending default
test('Stage 02 Regression: 17. missing stage-state file still returns intentional pending default', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-missing-'));
  try {
    const store = new RunStateStore(tmpDir);
    const stageState = store.loadStage('run-1', 'stage-missing');

    assert.equal(stageState.phase, 'pending');
    assert.equal(stageState.version, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
