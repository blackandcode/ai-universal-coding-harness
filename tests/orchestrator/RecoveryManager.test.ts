/**
 * @fileoverview Unit tests for RecoveryManager in src/orchestrator/RecoveryManager.ts.
 * Validates recovery analysis, state reset to attempt 1, corroborated evidence handling,
 * and error handling for missing runs, invalid stages, and corrupted state files.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { RecoveryManager } from '../../src/orchestrator/RecoveryManager.js';
import { RunStateStore } from '../../src/state/RunStateStore.js';
import { GitRepository } from '../../src/git/GitRepository.js';

test('RecoveryManager resets recovered stage to attempt 1 with corroborated evidence', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-test-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.ai-orchestrator/\n');
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Test\n');
    execSync('git add .gitignore readme.md && git commit -m "initial"', { cwd: tmpDir });

    const git = new GitRepository(tmpDir);
    const store = new RunStateStore();
    const runId = 'test-recovery-run-1';
    const stageName = 'stage-01-feature';
    const patchFp = git.patchFingerprint();
    const testEpoch = 'epoch-rm-1';

    const stageDir = store.stageDir(runId, stageName);
    fs.mkdirSync(stageDir, { recursive: true });

    // Write run.json
    store.save({
      version: 1,
      run_id: runId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'failed',
      workspace: tmpDir,
      base_ref: 'HEAD',
      base_commit: git.head(),
      branch: 'ai-harness/test-branch',
      branch_created: true,
      original_branch: 'main',
      original_head: git.head(),
      stage_source: 'test',
      feature: null,
      stages: [
        {
          name: stageName,
          selector: '01',
          status: 'failed',
          manifest: {
            name: stageName,
            selector: '01',
            source: 'test',
            relative_path: stageName,
            sha256: {}
          }
        }
      ],
      executor_harness: 'cursor',
      reviewer_harness: 'codex',
      quality_cmd: 'npm run check',
      current_stage_index: 0
    });

    // Write stage-state.json at attempt 3 failed
    store.saveStage(runId, stageName, {
      phase: 'quality',
      attempt: 3,
      reviewer_feedback: 'Fix findings'
    });

    // Write evidence.json in stageDir
    const evidence = {
      stage: stageName,
      attempt: 3,
      status: 'PASS',
      quality_command: 'npm run check',
      quality_exit_code: 0,
      git_diff_check_exit_code: 0,
      focused_tests: [],
      quality_summary: 'All checks passed',
      changed_files: [],
      unresolved: [],
      patch_fingerprint: patchFp,
      quality_epoch_id: testEpoch
    };
    fs.writeFileSync(path.join(stageDir, 'evidence.json'), JSON.stringify(evidence, null, 2));

    // Write ACP log with passing checks
    const acpLines = [
      `EPOCH {"record_type":"quality_epoch_started","quality_epoch_id":"${testEpoch}","stage":"${stageName}","attempt":3,"run_id":"${runId}","sequence":0,"timestamp":"${new Date().toISOString()}"}`,
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Run","status":"completed","rawInput":{"command":"npm run check"},"rawOutput":{"exit_code":0}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t2","title":"Run","status":"completed","rawInput":{"command":"git diff --check"},"rawOutput":{"exit_code":0}}}}'
    ];
    fs.writeFileSync(path.join(stageDir, 'executor-acp.jsonl'), acpLines.join('\n') + '\n');

    const rm = new RecoveryManager(tmpDir, store, git);

    // Dry-run
    const dryResult = await rm.recover({ runId, stageName, apply: false });
    assert.equal(dryResult.ok, true);
    assert.equal(dryResult.dryRun, true);

    // Apply
    const applyResult = await rm.recover({ runId, stageName, apply: true });
    assert.equal(applyResult.ok, true);
    assert.equal(applyResult.dryRun, false);

    // Verify stage state is reset to attempt 1 with phase review (evidence corroborated) or quality
    const recoveredStage = store.loadStage(runId, stageName);
    assert.ok(recoveredStage.phase === 'quality' || recoveredStage.phase === 'review');
    assert.equal(recoveredStage.attempt, 1);
    assert.ok(recoveredStage.evidence_file?.endsWith('evidence-attempt-1.json'));

    // Verify evidence in file has attempt 1
    const savedEvidence = JSON.parse(fs.readFileSync(recoveredStage.evidence_file!, 'utf8'));
    assert.equal(savedEvidence.attempt, 1);
    assert.equal(savedEvidence.status, 'PASS');

    // Verify run status transitioned to running
    const recoveredRun = store.load(runId);
    assert.equal(recoveredRun.status, 'running');
    assert.equal(recoveredRun.stages[0].status, 'running');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('RecoveryManager error cases: missing run, invalid stage, and corrupted run file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-err-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Test\n');
    execSync('git add readme.md && git commit -m "initial"', { cwd: tmpDir });

    const git = new GitRepository(tmpDir);
    const store = new RunStateStore(path.join(tmpDir, '.ai-orchestrator', 'runs'));
    const rm = new RecoveryManager(tmpDir, store, git);

    // 1. No run found
    const noRun = await rm.recover({});
    assert.equal(noRun.ok, false);
    assert.equal(noRun.error, 'No run found.');

    // 2. Corrupted run state
    const corruptId = 'corrupt-run-id';
    const corruptDir = store.runDir(corruptId);
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(path.join(corruptDir, 'run.json'), 'invalid json');
    const loadErr = await rm.recover({ runId: corruptId });
    assert.equal(loadErr.ok, false);
    assert.match(loadErr.error || '', /Failed to load run/);

    // 3. Stage cannot be determined
    const emptyRunId = 'empty-stages-run';
    store.save({
      version: 1,
      run_id: emptyRunId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'completed',
      workspace: tmpDir,
      base_ref: 'HEAD',
      base_commit: 'abc',
      branch: 'ai-harness/test',
      branch_created: true,
      original_branch: 'main',
      original_head: 'abc',
      stage_source: 'test',
      feature: null,
      stages: [],
      executor_harness: 'cursor',
      reviewer_harness: 'codex',
      quality_cmd: 'npm test'
    });
    const noStage = await rm.recover({ runId: emptyRunId, stageName: 'nonexistent-stage' });
    assert.equal(noStage.ok, false);
    assert.equal(noStage.error, 'Could not determine stage to recover.');

    // 4. Recovery dry-run without evidence resumes at quality
    const stageName = 'stage-01';
    const stageDir = store.stageDir(emptyRunId, stageName);
    fs.mkdirSync(stageDir, { recursive: true });
    store.save({
      version: 1,
      run_id: emptyRunId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'failed',
      workspace: tmpDir,
      base_ref: 'HEAD',
      base_commit: git.head(),
      branch: 'ai-harness/test',
      branch_created: true,
      original_branch: 'main',
      original_head: git.head(),
      stage_source: 'test',
      feature: null,
      stages: [
        {
          name: stageName,
          selector: '01',
          status: 'failed',
          manifest: {
            name: stageName,
            selector: '01',
            source: 'test',
            relative_path: stageName,
            sha256: {}
          }
        }
      ],
      executor_harness: 'cursor',
      reviewer_harness: 'codex',
      quality_cmd: 'npm test',
      current_stage_index: 0
    });

    const dryRunRes = await rm.recover({ runId: emptyRunId, apply: false });
    assert.equal(dryRunRes.ok, true);
    assert.equal(dryRunRes.dryRun, true);
    assert.equal(dryRunRes.resumePhase, 'quality');

    // Apply mode without evidence
    const applyRes = await rm.recover({ runId: emptyRunId, apply: true });
    assert.equal(applyRes.ok, true);
    assert.equal(applyRes.dryRun, false);
    assert.equal(applyRes.resumePhase, 'quality');

    // 5. Discovery of evidence-attempt-N.json when evidence.json is not present
    const attemptFile = path.join(stageDir, 'evidence-attempt-2.json');
    fs.writeFileSync(
      attemptFile,
      JSON.stringify({
        stage: stageName,
        attempt: 2,
        status: 'FAIL',
        quality_command: 'npm test',
        quality_exit_code: 1,
        git_diff_check_exit_code: 0,
        changed_files: [],
        unresolved: []
      })
    );
    const discoveredRes = await rm.recover({ runId: emptyRunId, apply: false });
    assert.equal(discoveredRes.ok, true);
    assert.equal(discoveredRes.resumePhase, 'quality');

    // 6. Stage determination edge cases
    // a. Failed load
    const failLoadRes = await rm.recover({ runId: 'non-existent-run-xyz', apply: false });
    assert.equal(failLoadRes.ok, false);
    assert.ok(failLoadRes.error?.includes('Failed to load run'));

    // b. Stage index determination when opts.stageName is omitted
    const state = store.load(emptyRunId);
    state.stages[0].status = 'failed';
    store.save(state);
    const inferredFailedRes = await rm.recover({ runId: emptyRunId, apply: false });
    assert.equal(inferredFailedRes.ok, true);
    assert.equal(inferredFailedRes.stageIndex, 0);

    // c. Stage index determination via current_stage_index
    state.stages[0].status = 'pending';
    state.current_stage_index = 0;
    store.save(state);
    const inferredCurrentRes = await rm.recover({ runId: emptyRunId, apply: false });
    assert.equal(inferredCurrentRes.ok, true);
    assert.equal(inferredCurrentRes.stageIndex, 0);

    // d. No stage found
    state.stages = [];
    state.current_stage_index = undefined;
    store.save(state);
    const noStageRes = await rm.recover({ runId: emptyRunId, apply: false });
    assert.equal(noStageRes.ok, false);
    assert.ok(noStageRes.error?.includes('Could not determine stage to recover'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
