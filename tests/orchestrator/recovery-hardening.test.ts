/**
 * @fileoverview Unit and regression tests for RecoveryManager hardening.
 *
 * Validates deterministic recovery resume-point selection (REVIEW vs QUALITY),
 * observation journal reconstruction from ACP logs, dry-run safety (no mutations),
 * and atomic backup generation.
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

test('recovery hardening: dry-run mode creates no backups and makes no mutations', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-dryrun-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Initial\n');
    execSync('git add readme.md && git commit -m "initial"', { cwd: tmpDir });

    const git = new GitRepository(tmpDir);
    const store = new RunStateStore(path.join(tmpDir, '.ai-orchestrator', 'runs'));
    const runId = 'test-dry-run-1';
    const stageName = 'stage-01';
    const stageDir = store.stageDir(runId, stageName);
    fs.mkdirSync(stageDir, { recursive: true });

    store.save({
      version: 1,
      run_id: runId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'failed',
      workspace: tmpDir,
      base_ref: 'HEAD',
      base_commit: git.head(),
      branch: 'ai-harness/test-dry',
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

    store.saveStage(runId, stageName, { phase: 'quality', attempt: 1 });

    const evidence = {
      stage: stageName,
      attempt: 1,
      status: 'PASS',
      quality_command: 'npm test',
      quality_exit_code: 0,
      git_diff_check_exit_code: 0,
      focused_tests: [],
      quality_summary: 'pass',
      changed_files: [],
      unresolved: []
    };
    fs.writeFileSync(path.join(stageDir, 'evidence.json'), JSON.stringify(evidence));

    const acp = [
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Run","status":"completed","rawInput":{"command":"npm test"},"rawOutput":{"exit_code":0}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t2","title":"Run","status":"completed","rawInput":{"command":"git diff --check"},"rawOutput":{"exit_code":0}}}}'
    ];
    fs.writeFileSync(path.join(stageDir, 'executor-acp.jsonl'), acp.join('\n') + '\n');

    const rm = new RecoveryManager(tmpDir, store, git);
    const dryRes = await rm.recover({ runId, stageName, apply: false });

    assert.equal(dryRes.ok, true);
    assert.equal(dryRes.dryRun, true);

    // Verify NO backups exist
    const runDirFiles = fs.readdirSync(store.runDir(runId));
    assert.equal(
      runDirFiles.some((f) => f.includes('backup')),
      false,
      'Dry-run must not create run backups'
    );

    const stageDirFiles = fs.readdirSync(stageDir);
    assert.equal(
      stageDirFiles.some((f) => f.includes('backup')),
      false,
      'Dry-run must not create stage backups'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('recovery hardening: missing observation journal is automatically reconstructed from ACP log on apply', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-rebuild-journal-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Initial\n');
    execSync('git add readme.md && git commit -m "initial"', { cwd: tmpDir });

    const git = new GitRepository(tmpDir);
    const store = new RunStateStore(path.join(tmpDir, '.ai-orchestrator', 'runs'));
    const runId = 'test-rebuild-1';
    const stageName = 'stage-01';
    const stageDir = store.stageDir(runId, stageName);
    fs.mkdirSync(stageDir, { recursive: true });

    store.save({
      version: 1,
      run_id: runId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'failed',
      workspace: tmpDir,
      base_ref: 'HEAD',
      base_commit: git.head(),
      branch: 'ai-harness/test-rebuild',
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

    store.saveStage(runId, stageName, { phase: 'quality', attempt: 1 });

    const evidence = {
      stage: stageName,
      attempt: 1,
      status: 'PASS',
      quality_command: 'npm run check',
      quality_exit_code: 0,
      git_diff_check_exit_code: 0,
      focused_tests: [],
      quality_summary: 'pass',
      changed_files: [],
      unresolved: []
    };
    fs.writeFileSync(path.join(stageDir, 'evidence.json'), JSON.stringify(evidence));

    const acp = [
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Run","status":"completed","rawInput":{"command":"npm run check"},"rawOutput":{"exit_code":0}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t2","title":"Run","status":"completed","rawInput":{"command":"git diff --check"},"rawOutput":{"exit_code":0}}}}'
    ];
    fs.writeFileSync(path.join(stageDir, 'executor-acp.jsonl'), acp.join('\n') + '\n');

    const journalPath = path.join(stageDir, 'executor-observations.jsonl');
    assert.equal(fs.existsSync(journalPath), false, 'Journal must not exist initially');

    const rm = new RecoveryManager(tmpDir, store, git);
    const applyRes = await rm.recover({ runId, stageName, apply: true });

    assert.equal(applyRes.ok, true);
    assert.equal(applyRes.resumePhase, 'review');
    assert.equal(
      fs.existsSync(journalPath),
      true,
      'Journal must be reconstructed after recovery apply'
    );
    const journalContent = fs.readFileSync(journalPath, 'utf8');
    assert.match(journalContent, /npm run check/);
    assert.match(journalContent, /git diff --check/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('recovery hardening: recovers to QUALITY when evidence is uncorroborated or missing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-uncorroborated-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Initial\n');
    execSync('git add readme.md && git commit -m "initial"', { cwd: tmpDir });

    const git = new GitRepository(tmpDir);
    const store = new RunStateStore(path.join(tmpDir, '.ai-orchestrator', 'runs'));
    const runId = 'test-rebuild-quality-1';
    const stageName = 'stage-01';
    const stageDir = store.stageDir(runId, stageName);
    fs.mkdirSync(stageDir, { recursive: true });

    store.save({
      version: 1,
      run_id: runId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'failed',
      workspace: tmpDir,
      base_ref: 'HEAD',
      base_commit: git.head(),
      branch: 'ai-harness/test-quality',
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

    store.saveStage(runId, stageName, { phase: 'implementation', attempt: 1 });

    // Stale or missing quality pass
    const rm = new RecoveryManager(tmpDir, store, git);
    const applyRes = await rm.recover({ runId, stageName, apply: true });

    assert.equal(applyRes.ok, true);
    assert.equal(applyRes.resumePhase, 'quality');

    const recovered = store.loadStage(runId, stageName);
    assert.equal(recovered.phase, 'quality');
    assert.equal(recovered.attempt, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
