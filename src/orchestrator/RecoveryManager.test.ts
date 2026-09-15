import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { RecoveryManager } from './RecoveryManager.js';
import { RunStateStore } from '../state/RunStateStore.js';
import { GitRepository } from '../git/GitRepository.js';

test('RecoveryManager resets recovered stage to attempt 1 with corroborated evidence', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-test-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Test\n');
    execSync('git add readme.md && git commit -m "initial"', { cwd: tmpDir });

    const git = new GitRepository(tmpDir);
    const store = new RunStateStore();
    const runId = 'test-recovery-run-1';
    const stageName = 'stage-01-feature';

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
            sha256: {},
          },
        },
      ],
      executor_harness: 'cursor',
      reviewer_harness: 'codex',
      quality_cmd: 'npm run check',
      current_stage_index: 0,
    });

    // Write stage-state.json at attempt 3 failed
    store.saveStage(runId, stageName, {
      phase: 'quality',
      attempt: 3,
      reviewer_feedback: 'Fix findings',
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
    };
    fs.writeFileSync(path.join(stageDir, 'evidence.json'), JSON.stringify(evidence, null, 2));

    // Write ACP log with passing checks
    const acpLines = [
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Run","status":"completed","rawInput":{"command":"npm run check"},"rawOutput":{"exit_code":0}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t2","title":"Run","status":"completed","rawInput":{"command":"git diff --check"},"rawOutput":{"exit_code":0}}}}',
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
