/**
 * @fileoverview Deterministic integration tests for Orchestrator stage execution flows.
 *
 * Exercises end-to-end orchestrator coordination in isolated temporary Git repositories using
 * scripted fake executor and reviewer harnesses. Validates:
 * 1. Successful stage execution and commit generation.
 * 2. Reviewer rework feedback loop and subsequent approval.
 * 3. Interruption and resume with approved plan reuse.
 * 4. Recovery resume-point determination (REVIEW vs QUALITY).
 * 5. High-volume permission requests without stage termination.
 * 6. Plan review budget exhaustion and graceful consolidation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { Orchestrator } from '../../src/orchestrator/Orchestrator.js';
import { EventBus } from '../../src/ui/EventBus.js';
import { HarnessRegistry } from '../../src/harness/registry.js';
import { GitRepository } from '../../src/git/GitRepository.js';
import { RecoveryManager } from '../../src/orchestrator/RecoveryManager.js';
import { RunStateStore } from '../../src/state/RunStateStore.js';
import { removeTree, sha256Text } from '../../src/core/fs.js';
import { CONFIG } from '../../src/core/config.js';
import type { ExecutorSession, FinalReviewInput } from '../../src/harness/types.js';
import type {
  CommandObservation,
  FinalVerdict,
  ExecutionEvidence,
  UiEvent
} from '../../src/types.js';

/**
 * Creates an isolated temporary Git repository configured for testing.
 */
function createTestRepo(): string {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-integ-repo-'));
  execSync('git init -b main', { cwd: repoDir, stdio: 'ignore' });
  execSync('git config user.name "Harness Test"', { cwd: repoDir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: repoDir, stdio: 'ignore' });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# Initial Repository\n');
  execSync('git add README.md && git commit -m "initial commit"', {
    cwd: repoDir,
    stdio: 'ignore'
  });
  const infoDir = path.join(repoDir, '.git', 'info');
  fs.mkdirSync(infoDir, { recursive: true });
  fs.writeFileSync(path.join(infoDir, 'exclude'), '.ai-orchestrator/\n');
  return repoDir;
}

/**
 * Creates a valid stage specification directory in the target repository.
 */
function createStageSource(targetDir: string, stageName = 'stage-01-core'): string {
  const stagesDir = path.join(targetDir, 'stages');
  const stageDir = path.join(stagesDir, stageName);
  fs.mkdirSync(stageDir, { recursive: true });

  fs.writeFileSync(
    path.join(stageDir, 'functional-spec.md'),
    '# Functional Specification\n\n## Requirements\n- Must implement core feature.\n'
  );
  fs.writeFileSync(
    path.join(stageDir, 'technical-spec.md'),
    '# Technical Specification\n\nArchitecture and quality instructions.\n'
  );
  fs.writeFileSync(
    path.join(stageDir, 'prompt.md'),
    '# Implementation Prompt\n\nExecute the stage requirements.\n'
  );

  return stagesDir;
}

/**
 * Helper to generate fully-scoped passing command observations for tests.
 */
function createPassingObservations(params: {
  sessionId: string;
  stage: string;
  attempt: number;
  runId?: string;
  qualityEpoch?: string;
  workspace?: string;
  command?: string;
}): CommandObservation[] {
  return [
    {
      observation_id: `obs-q-${params.stage}-${params.attempt}`,
      session_id: params.sessionId,
      stage: params.stage,
      attempt: params.attempt,
      run_id: params.runId,
      cwd: params.workspace,
      tool_id: 'tool-quality',
      tool_call_id: 'tool-quality',
      sequence: 1,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: params.command || 'npm test',
      normalized_command: params.command || 'npm test',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      quality_epoch_id: params.qualityEpoch
    },
    {
      observation_id: `obs-d-${params.stage}-${params.attempt}`,
      session_id: params.sessionId,
      stage: params.stage,
      attempt: params.attempt,
      run_id: params.runId,
      cwd: params.workspace,
      tool_id: 'tool-diff',
      tool_call_id: 'tool-diff',
      sequence: 2,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'git diff --check',
      normalized_command: 'git diff --check',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0,
      quality_epoch_id: params.qualityEpoch
    }
  ];
}

test('orchestrator integration: successful stage produces approved commit on AI branch', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-feature');
  const eventLog = path.join(repoDir, '.ai-orchestrator', 'test-events.jsonl');
  const events = new EventBus(eventLog);

  try {
    const registry = new HarnessRegistry();
    let currentAttempt = 0;

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        const observations: CommandObservation[] = [];

        return {
          id: 'test-session-1',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          observedCommands: () => observations,
          prompt: async (promptText) => {
            if (promptText.includes('Work in PLAN mode')) {
              await opts.callbacks.onPlan('Comprehensive test implementation plan.', {});
              return { text: 'Plan submitted.', result: {} };
            }

            currentAttempt++;
            // Implementation mode: write code change
            fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'Feature implementation\n');

            // Record passing quality observations
            observations.push({
              observation_id: `obs-quality-${currentAttempt}`,
              session_id: 'test-session-1',
              stage: 'stage-01-feature',
              attempt: currentAttempt,
              run_id: opts.runId,
              tool_id: 'tool-quality',
              tool_call_id: 'tool-quality',
              sequence: 1,
              timestamp: new Date().toISOString(),
              source: 'acp',
              command: 'npm test',
              normalized_command: 'npm test',
              command_confidence: 'high',
              status: 'completed',
              exit_code: 0,
              quality_epoch_id: qualityEpoch
            });
            observations.push({
              observation_id: `obs-diff-${currentAttempt}`,
              session_id: 'test-session-1',
              stage: 'stage-01-feature',
              attempt: currentAttempt,
              run_id: opts.runId,
              tool_id: 'tool-diff',
              tool_call_id: 'tool-diff',
              sequence: 2,
              timestamp: new Date().toISOString(),
              source: 'acp',
              command: 'git diff --check',
              normalized_command: 'git diff --check',
              command_confidence: 'high',
              status: 'completed',
              exit_code: 0,
              quality_epoch_id: qualityEpoch
            });

            // Write runtime evidence
            const runtimeDir = path.join(
              repoDir,
              '.ai-orchestrator',
              'stage-runtime',
              'stage-01-feature'
            );
            fs.mkdirSync(runtimeDir, { recursive: true });
            const evidence: ExecutionEvidence = {
              stage: 'stage-01-feature',
              attempt: currentAttempt,
              status: 'PASS',
              quality_command: 'npm test',
              quality_exit_code: 0,
              git_diff_check_exit_code: 0,
              focused_tests: [],
              quality_summary: 'All checks green.',
              changed_files: ['feature.txt'],
              unresolved: []
            };
            fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), JSON.stringify(evidence));

            return { text: 'Implementation finished.', result: {} };
          },
          stop: async () => {}
        };
      }
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'Plan is sound and complete.',
        missing_items: [],
        feedback_for_cursor: ''
      }),
      answerQuestions: async () => ({ verdict: 'ANSWER', rationale: 'OK', answers: [] }),
      decidePermission: async () => ({ verdict: 'ALLOW', reason: 'Safe' }),
      reviewImplementation: async (): Promise<FinalVerdict> => ({
        verdict: 'APPROVE',
        summary: 'Implementation satisfies all requirements.'
      })
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    const finalState = await orchestrator.run(state);

    const git = new GitRepository(repoDir);
    assert.equal(finalState.status, 'completed');
    assert.equal(finalState.stages[0].status, 'completed');

    // Assert commit was created with stage name
    const logOut = execSync('git log -1 --pretty=format:"%s%n%b"', {
      cwd: repoDir,
      encoding: 'utf8'
    });
    assert.ok(logOut.includes('stage-01-feature'));
    assert.ok(logOut.includes('AI-Orchestrator-Run:'));
    assert.ok(logOut.includes('Stage-Spec-SHA256:'));
    assert.equal(git.currentBranch(), state.branch);

    // Running run again when all stages are already completed immediately returns completed state
    const rerunState = await orchestrator.run(finalState);
    assert.equal(rerunState.status, 'completed');
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: reviewer rework triggers rerun and approval on attempt 2', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-rework');
  const eventLog = path.join(repoDir, '.ai-orchestrator', 'rework-events.jsonl');
  const events = new EventBus(eventLog);

  try {
    const registry = new HarnessRegistry();
    let currentAttempt = 0;
    let reviewerCalls = 0;

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        const observations: CommandObservation[] = [];

        return {
          id: 'rework-session',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          observedCommands: () => observations,
          prompt: async (promptText) => {
            if (promptText.includes('Work in PLAN mode')) {
              await opts.callbacks.onPlan('Initial plan', {});
              return { text: 'Plan OK', result: {} };
            }

            currentAttempt++;
            fs.writeFileSync(
              path.join(repoDir, 'output.txt'),
              `Content attempt ${currentAttempt}\n`
            );

            observations.push(
              ...createPassingObservations({
                sessionId: 'rework-session',
                stage: 'stage-01-rework',
                attempt: currentAttempt,
                runId: opts.runId,
                qualityEpoch,
                workspace: opts.workspace
              })
            );

            const runtimeDir = path.join(
              repoDir,
              '.ai-orchestrator',
              'stage-runtime',
              'stage-01-rework'
            );
            fs.mkdirSync(runtimeDir, { recursive: true });
            const evidence: ExecutionEvidence = {
              stage: 'stage-01-rework',
              attempt: currentAttempt,
              status: 'PASS',
              quality_command: 'npm test',
              quality_exit_code: 0,
              git_diff_check_exit_code: 0,
              focused_tests: [],
              quality_summary: `Attempt ${currentAttempt} verified.`,
              changed_files: ['output.txt'],
              unresolved: []
            };
            fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), JSON.stringify(evidence));

            return { text: `Attempt ${currentAttempt} done`, result: {} };
          },
          stop: async () => {}
        };
      }
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'Plan ok',
        missing_items: [],
        feedback_for_cursor: ''
      }),
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [], rationale: 'OK' }),
      decidePermission: async () => ({ verdict: 'ALLOW', reason: 'Safe' }),
      reviewImplementation: async (): Promise<FinalVerdict> => {
        reviewerCalls++;
        if (reviewerCalls === 1) {
          return {
            verdict: 'NEEDS_CONTEXT',
            summary: 'Need context on output.txt',
            requested_paths: ['output.txt']
          };
        }
        if (reviewerCalls === 2) {
          return {
            verdict: 'REWORK',
            summary: 'Need additional error handling.',
            rework_instructions: 'Add error handling for null input.',
            findings: [
              {
                severity: 'high',
                area: 'safety',
                finding: 'Missing null check',
                required_fix: 'Add null guard'
              }
            ]
          };
        }
        return {
          verdict: 'APPROVE',
          summary: 'Rework completed satisfactorily.'
        };
      }
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    const finalState = await orchestrator.run(state);

    assert.equal(currentAttempt, 2);
    assert.equal(reviewerCalls, 3);
    assert.equal(finalState.status, 'completed');
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: resume flow reuses approved plan without planning phase', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-resume');
  const eventLog = path.join(repoDir, '.ai-orchestrator', 'resume-events.jsonl');
  const events = new EventBus(eventLog);

  try {
    let planCalls = 0;
    const registry = new HarnessRegistry();

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => ({
        id: 'session-resume',
        setMode: async () => {},
        observedCommands: () => [],
        prompt: async (promptText) => {
          if (promptText.includes('Work in PLAN mode')) {
            planCalls++;
            await opts.callbacks.onPlan('Approved plan text', {});
            // Simulate interruption right after planning
            throw new Error('SIMULATED_INTERRUPTION_AFTER_PLAN');
          }
          return { text: 'Unreached on first run', result: {} };
        },
        stop: async () => {}
      })
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'Plan approved',
        missing_items: [],
        feedback_for_cursor: ''
      }),
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [], rationale: 'OK' }),
      decidePermission: async () => ({ verdict: 'ALLOW', reason: 'Safe' }),
      reviewImplementation: async () => ({ verdict: 'APPROVE', summary: 'OK' })
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    // Run 1: will fail with SIMULATED_INTERRUPTION_AFTER_PLAN
    await assert.rejects(async () => orchestrator.run(state), /SIMULATED_INTERRUPTION_AFTER_PLAN/);
    assert.equal(planCalls, 1);

    // Verify stage blocked state after error
    const blockedState = orchestrator.store.load(state.run_id);
    assert.equal(blockedState.status, 'failed');
    assert.equal(blockedState.blocked_stage, 'stage-01-resume');
    assert.match(blockedState.error || '', /SIMULATED_INTERRUPTION_AFTER_PLAN/);

    // Run 2: resume should reuse the approved plan without invoking plan mode prompt
    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        const observations: CommandObservation[] = [];

        return {
          id: 'session-resume-2',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          observedCommands: () => observations,
          prompt: async (promptText) => {
            if (promptText.includes('Work in PLAN mode')) {
              planCalls++;
              return { text: 'Should not happen', result: {} };
            }

            fs.writeFileSync(path.join(repoDir, 'resumed.txt'), 'Done\n');
            observations.push(
              ...createPassingObservations({
                sessionId: 'session-resume-2',
                stage: 'stage-01-resume',
                attempt: 1,
                runId: opts?.runId,
                qualityEpoch,
                workspace: opts?.workspace
              })
            );

            const runtimeDir = path.join(
              repoDir,
              '.ai-orchestrator',
              'stage-runtime',
              'stage-01-resume'
            );
            fs.mkdirSync(runtimeDir, { recursive: true });
            const evidence: ExecutionEvidence = {
              stage: 'stage-01-resume',
              attempt: 1,
              status: 'PASS',
              quality_command: 'npm test',
              quality_exit_code: 0,
              git_diff_check_exit_code: 0,
              focused_tests: [],
              quality_summary: 'Resumed gate passes.',
              changed_files: ['resumed.txt'],
              unresolved: []
            };
            fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), JSON.stringify(evidence));

            return { text: 'Done', result: {} };
          },
          stop: async () => {}
        };
      }
    }));

    const resumedState = orchestrator.store.load(state.run_id);
    const finalState = await orchestrator.run(resumedState);

    // Plan calls remained 1: planning was completely skipped upon resume!
    assert.equal(planCalls, 1);
    assert.equal(finalState.status, 'completed');
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: recovery selects REVIEW for valid evidence and QUALITY for stale evidence', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-recovery');
  const store = new RunStateStore(path.join(repoDir, '.ai-orchestrator', 'runs'));
  const runId = 'recovery-test-run';
  const stageName = 'stage-01-recovery';
  const stageRunDir = store.stageDir(runId, stageName);
  fs.mkdirSync(stageRunDir, { recursive: true });

  try {
    const git = new GitRepository(repoDir);
    // Write a modification
    fs.writeFileSync(path.join(repoDir, 'recovered.txt'), 'content\n');
    const patchFingerprint = git.patchFingerprint();
    const testEpoch = 'epoch-recovery-integ-1';

    // 1. Valid corroborated evidence matching patch fingerprint
    const validEvidence: ExecutionEvidence = {
      stage: stageName,
      attempt: 1,
      status: 'PASS',
      quality_command: 'npm test',
      quality_exit_code: 0,
      git_diff_check_exit_code: 0,
      focused_tests: [],
      quality_summary: 'Corroborated green',
      changed_files: ['recovered.txt'],
      unresolved: [],
      patch_fingerprint: patchFingerprint,
      quality_epoch_id: testEpoch
    };
    const evidencePath = path.join(stageRunDir, 'evidence-attempt-1.json');
    fs.writeFileSync(evidencePath, JSON.stringify(validEvidence));

    const acp = [
      `EPOCH {"record_type":"quality_epoch_started","quality_epoch_id":"${testEpoch}","stage":"${stageName}","attempt":1,"run_id":"${runId}","sequence":0,"timestamp":"${new Date().toISOString()}"}`,
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Run","status":"completed","rawInput":{"command":"npm test"},"rawOutput":{"exit_code":0}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t2","title":"Run","status":"completed","rawInput":{"command":"git diff --check"},"rawOutput":{"exit_code":0}}}}'
    ];
    fs.writeFileSync(path.join(stageRunDir, 'executor-acp.jsonl'), acp.join('\n') + '\n');

    store.save({
      version: 1,
      run_id: runId,
      created_at: new Date().toISOString(),
      status: 'failed',
      workspace: repoDir,
      base_ref: 'HEAD',
      base_commit: git.head(),
      branch: 'ai-harness/recovery-test',
      branch_created: true,
      original_branch: 'main',
      original_head: git.head(),
      stage_source: stagesDir,
      feature: null,
      stages: [
        {
          name: stageName,
          selector: '01',
          status: 'failed',
          manifest: {
            name: stageName,
            selector: '01',
            source: stagesDir,
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
      patch_fingerprint: patchFingerprint
    });

    const recoveryMgr = new RecoveryManager(repoDir, store, git);
    const planReview = await recoveryMgr.recover({ runId, stageName, apply: false });
    assert.equal(planReview.resumePhase, 'review');

    // 2. Modify repository to change patch fingerprint -> evidence becomes stale!
    fs.appendFileSync(path.join(repoDir, 'recovered.txt'), 'extra line\n');
    const planQuality = await recoveryMgr.recover({ runId, stageName, apply: false });
    assert.equal(planQuality.resumePhase, 'quality');
  } finally {
    removeTree(repoDir);
  }
});

test('orchestrator integration: permission volume resilience with 25+ requests', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-perms');
  const eventLog = path.join(repoDir, '.ai-orchestrator', 'perm-events.jsonl');
  const events = new EventBus(eventLog);

  try {
    const registry = new HarnessRegistry();
    let permissionsRequested = 0;

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        const observations: CommandObservation[] = [];

        return {
          id: 'perm-session',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          observedCommands: () => observations,
          prompt: async (promptText) => {
            if (promptText.includes('Work in PLAN mode')) {
              await opts.callbacks.onPlan('Plan with permissions', {});
              return { text: 'Plan ok', result: {} };
            }

            // Request 25 distinct command execution permissions
            for (let i = 1; i <= 25; i++) {
              permissionsRequested++;
              await opts.callbacks.onPermission(
                {
                  command: `echo test_${i}`,
                  raw: { command: `echo test_${i}` }
                },
                {}
              );
            }

            fs.writeFileSync(path.join(repoDir, 'perm-done.txt'), 'Completed permissions\n');
            observations.push(
              ...createPassingObservations({
                sessionId: 'perm-session',
                stage: 'stage-01-perms',
                attempt: 1,
                runId: opts.runId,
                qualityEpoch,
                workspace: opts.workspace
              })
            );

            const runtimeDir = path.join(
              repoDir,
              '.ai-orchestrator',
              'stage-runtime',
              'stage-01-perms'
            );
            fs.mkdirSync(runtimeDir, { recursive: true });
            const evidence: ExecutionEvidence = {
              stage: 'stage-01-perms',
              attempt: 1,
              status: 'PASS',
              quality_command: 'npm test',
              quality_exit_code: 0,
              git_diff_check_exit_code: 0,
              focused_tests: [],
              quality_summary: 'Permissions test ok',
              changed_files: ['perm-done.txt'],
              unresolved: []
            };
            fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), JSON.stringify(evidence));

            return { text: 'Done', result: {} };
          },
          stop: async () => {}
        };
      }
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'OK',
        missing_items: [],
        feedback_for_cursor: ''
      }),
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [], rationale: 'OK' }),
      decidePermission: async () => ({ verdict: 'ALLOW', reason: 'Safe test command' }),
      reviewImplementation: async () => ({ verdict: 'APPROVE', summary: 'OK' })
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    const finalState = await orchestrator.run(state);

    assert.equal(permissionsRequested, 25);
    assert.equal(finalState.status, 'completed');
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: plan review budget exhaustion consolidates into executable plan', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-budget');
  const eventLog = path.join(repoDir, '.ai-orchestrator', 'budget-events.jsonl');
  const events = new EventBus(eventLog);

  try {
    const registry = new HarnessRegistry();
    let planReviewPasses = 0;

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        const observations: CommandObservation[] = [];

        return {
          id: 'budget-session',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          observedCommands: () => observations,
          prompt: async (promptText) => {
            if (promptText.includes('Work in PLAN mode')) {
              // Submit plans that reviewer rejects repeatedly
              await opts.callbacks.onPlan(`Plan proposal attempt ${planReviewPasses + 1}`, {});
              return { text: 'Submitted plan', result: {} };
            }

            // In implementation mode:
            fs.writeFileSync(
              path.join(repoDir, 'budget-done.txt'),
              'Completed under consolidated plan\n'
            );
            observations.push(
              ...createPassingObservations({
                sessionId: 'budget-session',
                stage: 'stage-01-budget',
                attempt: 1,
                runId: opts.runId,
                qualityEpoch,
                workspace: opts.workspace
              })
            );

            const runtimeDir = path.join(
              repoDir,
              '.ai-orchestrator',
              'stage-runtime',
              'stage-01-budget'
            );
            fs.mkdirSync(runtimeDir, { recursive: true });
            const evidence: ExecutionEvidence = {
              stage: 'stage-01-budget',
              attempt: 1,
              status: 'PASS',
              quality_command: 'npm test',
              quality_exit_code: 0,
              git_diff_check_exit_code: 0,
              focused_tests: [],
              quality_summary: 'Consolidated plan implementation verified.',
              changed_files: ['budget-done.txt'],
              unresolved: []
            };
            fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), JSON.stringify(evidence));

            return { text: 'Done', result: {} };
          },
          stop: async () => {}
        };
      }
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async (_input, opts) => {
        planReviewPasses++;
        if (opts?.finalConsolidation) {
          return {
            verdict: 'APPROVE',
            summary: 'Final consolidation accepted with carryover notes.',
            missing_items: [],
            feedback_for_cursor: 'Ensure non-functional requirements are kept.'
          };
        }
        return {
          verdict: 'REPLAN',
          summary: `Plan needs further iteration pass ${planReviewPasses}.`,
          missing_items: ['Missing comprehensive error handling'],
          feedback_for_cursor: 'Please expand edge case handling.'
        };
      },
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [], rationale: 'OK' }),
      decidePermission: async () => ({ verdict: 'ALLOW', reason: 'Safe' }),
      reviewImplementation: async () => ({ verdict: 'APPROVE', summary: 'OK' })
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    const finalState = await orchestrator.run(state);

    // Assert that budget exhaustion did not block stage and execution proceeded to completion
    assert.ok(planReviewPasses >= 3, `Expected at least 3 plan reviews, got ${planReviewPasses}`);
    assert.equal(finalState.status, 'completed');
    assert.equal(finalState.stages[0].status, 'completed');
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: handles executor question and reviewer context request', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-question');
  const events = new EventBus(path.join(repoDir, 'events.jsonl'), true);

  try {
    const registry = new HarnessRegistry();
    let questionAnswered = false;
    let contextRequested = false;

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        const stageName = 'stage-01-question';
        const runtimeDir = path.join(repoDir, '.ai-orchestrator', 'stage-runtime', stageName);
        fs.mkdirSync(runtimeDir, { recursive: true });

        const session: ExecutorSession = {
          id: 'test-session-question',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          prompt: async (text) => {
            if (text.includes('Work in PLAN mode')) {
              await opts.callbacks.onPlan('1. Comprehensive plan with DB choice\n', {});
              return { text: 'Plan submitted', result: {} };
            }

            // Ask question during implementation
            const qResult = await opts.callbacks.onQuestion({
              title: 'Database selection',
              questions: [
                {
                  id: 'db-type',
                  prompt: 'Which database engine to use?',
                  options: [
                    { id: 'postgres', label: 'PostgreSQL' },
                    { id: 'sqlite', label: 'SQLite' }
                  ]
                }
              ]
            });
            if (qResult.answers.length > 0) {
              questionAnswered = true;
            }

            // Make repository edit
            fs.writeFileSync(path.join(repoDir, 'db.txt'), 'postgres engine selected\n');

            // Write green evidence
            const evidence: ExecutionEvidence = {
              stage: stageName,
              attempt: 1,
              status: 'PASS',
              quality_command: 'npm test',
              quality_exit_code: 0,
              git_diff_check_exit_code: 0,
              focused_tests: [],
              quality_summary: 'All checks passed',
              changed_files: ['db.txt'],
              unresolved: []
            };
            fs.writeFileSync(
              path.join(runtimeDir, 'evidence.json'),
              JSON.stringify(evidence, null, 2)
            );

            return { text: 'Implementation finished', result: {} };
          },
          stop: async () => {},
          observedCommands: () =>
            createPassingObservations({
              sessionId: 'test-session-question',
              stage: stageName,
              attempt: 1,
              runId: opts.runId,
              qualityEpoch,
              workspace: opts.workspace
            })
        };
        return session;
      }
    }));

    let reviewCall = 0;
    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'Plan approved',
        missing_items: [],
        feedback_for_cursor: ''
      }),
      answerQuestions: async () => ({
        verdict: 'ANSWER',
        answers: [{ question_id: 'db-type', selected_option_ids: ['postgres'] }],
        rationale: 'PostgreSQL preferred for persistence requirements'
      }),
      decidePermission: async () => ({ verdict: 'ALLOW', reason: 'Safe' }),
      reviewImplementation: async (payload: FinalReviewInput) => {
        reviewCall++;
        if (reviewCall === 1) {
          contextRequested = true;
          return {
            verdict: 'NEEDS_CONTEXT',
            summary: 'Need context on README.md',
            requested_paths: ['README.md']
          };
        }
        assert.ok(payload.requested_context_diff !== undefined);
        return { verdict: 'APPROVE', summary: 'Implementation approved after context review' };
      }
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    const finalState = await orchestrator.run(state);

    assert.equal(questionAnswered, true, 'Question should have been answered');
    assert.equal(contextRequested, true, 'Reviewer should have requested extra context');
    assert.equal(finalState.status, 'completed');
    assert.equal(finalState.stages[0].status, 'completed');
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: reuses stored approved plan without replanning', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-reuse-plan');
  const eventLog = path.join(repoDir, '.ai-orchestrator', 'reuse-plan-events.jsonl');
  const events = new EventBus(eventLog);
  const store = new RunStateStore(path.join(repoDir, '.ai-orchestrator', 'runs'));

  try {
    const registry = new HarnessRegistry();
    let planPrompts = 0;

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        const observations: CommandObservation[] = [];
        return {
          id: 'reuse-plan-session',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          observedCommands: () => observations,
          prompt: async (promptText) => {
            if (promptText.includes('Work in PLAN mode')) {
              planPrompts++;
              await opts.callbacks.onPlan('should-not-be-used', {});
            }
            const runtimeDir = path.join(
              repoDir,
              '.ai-orchestrator',
              'stage-runtime',
              'stage-01-reuse-plan'
            );
            fs.mkdirSync(runtimeDir, { recursive: true });
            fs.writeFileSync(
              path.join(runtimeDir, 'evidence.json'),
              JSON.stringify({
                stage: 'stage-01-reuse-plan',
                attempt: 1,
                status: 'PASS',
                quality_command: 'npm test',
                quality_exit_code: 0,
                git_diff_check_exit_code: 0,
                focused_tests: [],
                quality_summary: 'ok',
                changed_files: [],
                unresolved: []
              })
            );
            observations.push(
              ...createPassingObservations({
                sessionId: 'reuse-plan-session',
                stage: 'stage-01-reuse-plan',
                attempt: 1,
                runId: opts.runId,
                qualityEpoch,
                workspace: opts.workspace
              })
            );
            fs.writeFileSync(path.join(repoDir, 'done.txt'), 'ok\n');
            return { text: 'done', result: {} };
          },
          stop: async () => {}
        };
      }
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => {
        throw new Error('reviewPlan should not run when plan is reused');
      },
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
      decidePermission: async () => ({ verdict: 'ALLOW', reason: 'ok' }),
      reviewImplementation: async () => ({ verdict: 'APPROVE', summary: 'ok' })
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    const stageName = state.stages[0].name;
    const cachedPlan = 'Previously approved complete plan for reuse.';
    const stageDir = store.stageDir(state.run_id, stageName);
    fs.mkdirSync(stageDir, { recursive: true });
    fs.writeFileSync(path.join(stageDir, 'approved-plan.md'), `${cachedPlan}\n`);
    store.saveStage(state.run_id, stageName, {
      phase: 'implementation',
      plan_status: 'APPROVED',
      plan_sha256: sha256Text(cachedPlan),
      spec_sha256: sha256Text(JSON.stringify(state.stages[0].manifest.sha256 || {}))
    });

    const finalState = await orchestrator.run(state);
    assert.equal(finalState.status, 'completed');
    assert.equal(planPrompts, 0);
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: prepareFrozenInputs sets up read-only stage inputs', () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-frozen');
  const events = new EventBus(path.join(repoDir, 'events.jsonl'), true);

  try {
    const orchestrator = new Orchestrator(events, { workspace: repoDir });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      qualityCmd: 'npm test'
    });

    orchestrator.prepareFrozenInputs(state);

    const frozenInput = path.join(
      repoDir,
      '.ai-orchestrator',
      'stage-input',
      'stage-01-frozen',
      'prompt.md'
    );
    assert.ok(fs.existsSync(frozenInput));
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: reviewer fallback failover on usage limit enables completion and persists metadata', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-failover');
  const eventLog = path.join(repoDir, '.ai-orchestrator', 'failover-events.jsonl');
  const events = new EventBus(eventLog);

  try {
    const registry = new HarnessRegistry();
    let fallbackEmitted = false;
    events.emitter.on('event', (e: UiEvent) => {
      if (e.type === 'reviewer.fallback') {
        fallbackEmitted = true;
      }
    });

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        const stageName = 'stage-01-failover';
        const runtimeDir = path.join(repoDir, '.ai-orchestrator', 'stage-runtime', stageName);
        fs.mkdirSync(runtimeDir, { recursive: true });

        const session: ExecutorSession = {
          id: 'test-session-failover',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          prompt: async (text) => {
            if (text.includes('Work in PLAN mode')) {
              await opts.callbacks.onPlan('1. Comprehensive plan with failover\n', {});
              return { text: 'Plan submitted', result: {} };
            }

            // Make repository edit
            fs.writeFileSync(path.join(repoDir, 'failover-feature.txt'), 'Feature implemented\n');

            // Write green evidence
            const evidence: ExecutionEvidence = {
              stage: stageName,
              attempt: 1,
              status: 'PASS',
              quality_command: 'npm test',
              quality_exit_code: 0,
              git_diff_check_exit_code: 0,
              focused_tests: [],
              quality_summary: 'All checks passed',
              changed_files: ['failover-feature.txt'],
              unresolved: []
            };
            fs.writeFileSync(
              path.join(runtimeDir, 'evidence.json'),
              JSON.stringify(evidence, null, 2)
            );

            return { text: 'Implementation finished', result: {} };
          },
          stop: async () => {},
          observedCommands: () =>
            createPassingObservations({
              sessionId: 'test-session-failover',
              stage: stageName,
              attempt: 1,
              runId: opts.runId,
              qualityEpoch,
              workspace: opts.workspace
            })
        };
        return session;
      }
    }));

    // Primary reviewer: plan review succeeds, but final review hits usage limit
    registry.registerReviewer('primary-rev', () => ({
      info: {
        id: 'primary-rev',
        label: 'Primary Reviewer',
        role: 'reviewer',
        model: 'gpt-6-astra'
      },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'Plan approved',
        missing_items: []
      }),
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
      decidePermission: async () => ({ verdict: 'ALLOW' }),
      reviewImplementation: async () => {
        throw new Error(
          "You've hit your usage limit. Upgrade to Pro or visit settings to purchase more credits"
        );
      }
    }));

    // Fallback reviewer: succeeds on final review
    registry.registerReviewer('fallback-rev', () => ({
      info: {
        id: 'fallback-rev',
        label: 'Fallback Reviewer',
        role: 'reviewer',
        model: 'gemini-3.8-flash'
      },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'Fallback plan OK',
        missing_items: []
      }),
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
      decidePermission: async () => ({ verdict: 'ALLOW' }),
      reviewImplementation: async () => ({
        verdict: 'APPROVE',
        summary: 'Fallback review approved implementation'
      })
    }));

    // Temporarily configure CONFIG.reviewer for this test
    const origReviewer = CONFIG.reviewer;
    CONFIG.reviewer = {
      primary: { harness: 'primary-rev', model: 'gpt-6-astra' },
      fallback: {
        enabled: true,
        harness: 'fallback-rev',
        model: 'gemini-3.8-flash',
        triggers: ['usage_limit', 'rate_limit', 'quota_exhausted', 'process_crash']
      },
      largeDiff: { thresholdChars: 300000, harness: 'fallback-rev', model: 'gemini-3.8-flash' },
      permission: { harness: 'fallback-rev', model: 'composer-2.5-fast' }
    };

    try {
      const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
      const state = orchestrator.createRun({
        stageSource: stagesDir,
        selectors: ['01'],
        executorHarness: 'test-exec',
        reviewerHarness: 'primary-rev',
        qualityCmd: 'npm test'
      });

      const finalState = await orchestrator.run(state);

      assert.equal(finalState.status, 'completed');
      assert.equal(finalState.stages[0].status, 'completed');
      assert.equal(fallbackEmitted, true, 'reviewer.fallback event should have been emitted');

      // Verify verdict artifact contains _orchestrator_meta provenance
      const reviewJsonPath = path.join(
        repoDir,
        '.ai-orchestrator',
        'runs',
        state.run_id,
        'stages',
        'stage-01-failover',
        'review-attempt-1.json'
      );
      assert.ok(fs.existsSync(reviewJsonPath));
      const parsedReview = JSON.parse(fs.readFileSync(reviewJsonPath, 'utf8'));
      assert.equal(parsedReview.verdict, 'APPROVE');
      assert.ok(parsedReview._orchestrator_meta);
      assert.equal(parsedReview._orchestrator_meta.trigger, 'usage_limit');
      assert.equal(parsedReview._orchestrator_meta.executed_by, 'fallback-rev:gemini-3.8-flash');
      assert.equal(parsedReview._orchestrator_meta.fallback_from, 'primary-rev:gpt-6-astra');
    } finally {
      CONFIG.reviewer = origReviewer;
    }
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: non-green quality evidence skips reviewer and retries implementation', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-quality-retry');
  const eventLog = path.join(repoDir, '.ai-orchestrator', 'quality-retry-events.jsonl');
  const events = new EventBus(eventLog);

  try {
    const registry = new HarnessRegistry();
    let implPrompts = 0;
    let reviewerCalls = 0;

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        const observations: CommandObservation[] = [];
        return {
          id: 'quality-retry-session',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          observedCommands: () => observations,
          prompt: async (promptText) => {
            if (promptText.includes('Work in PLAN mode')) {
              await opts.callbacks.onPlan('Quality retry plan', {});
              return { text: 'Plan ok', result: {} };
            }
            implPrompts++;
            const runtimeDir = path.join(
              repoDir,
              '.ai-orchestrator',
              'stage-runtime',
              'stage-01-quality-retry'
            );
            fs.mkdirSync(runtimeDir, { recursive: true });
            const evidence: ExecutionEvidence = {
              stage: 'stage-01-quality-retry',
              attempt: implPrompts,
              status: implPrompts === 1 ? 'FAIL' : 'PASS',
              quality_command: 'npm test',
              quality_exit_code: implPrompts === 1 ? 1 : 0,
              git_diff_check_exit_code: 0,
              focused_tests: [],
              quality_summary: implPrompts === 1 ? 'Tests failed' : 'Tests passed',
              changed_files: ['feature.txt'],
              unresolved: []
            };
            fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), JSON.stringify(evidence));
            if (implPrompts === 1) {
              observations.push(
                {
                  observation_id: `obs-q-${implPrompts}`,
                  session_id: 'quality-retry-session',
                  stage: 'stage-01-quality-retry',
                  attempt: 1,
                  run_id: opts.runId,
                  cwd: opts.workspace,
                  tool_id: 'tool-q',
                  tool_call_id: 'tool-q',
                  sequence: implPrompts * 2 - 1,
                  timestamp: new Date().toISOString(),
                  source: 'acp',
                  command: 'npm test',
                  normalized_command: 'npm test',
                  command_confidence: 'high',
                  status: 'completed',
                  exit_code: 1,
                  quality_epoch_id: qualityEpoch
                },
                {
                  observation_id: `obs-d-${implPrompts}`,
                  session_id: 'quality-retry-session',
                  stage: 'stage-01-quality-retry',
                  attempt: 1,
                  run_id: opts.runId,
                  cwd: opts.workspace,
                  tool_id: 'tool-d',
                  tool_call_id: 'tool-d',
                  sequence: implPrompts * 2,
                  timestamp: new Date().toISOString(),
                  source: 'acp',
                  command: 'git diff --check',
                  normalized_command: 'git diff --check',
                  command_confidence: 'high',
                  status: 'completed',
                  exit_code: 0,
                  quality_epoch_id: qualityEpoch
                }
              );
            } else {
              observations.push(
                ...createPassingObservations({
                  sessionId: 'quality-retry-session',
                  stage: 'stage-01-quality-retry',
                  attempt: 2,
                  runId: opts.runId,
                  qualityEpoch,
                  workspace: opts.workspace
                })
              );
            }
            if (implPrompts === 2) {
              fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'implemented\n');
            }
            return { text: `attempt ${implPrompts}`, result: {} };
          },
          stop: async () => {}
        };
      }
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'ok',
        missing_items: [],
        feedback_for_cursor: ''
      }),
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
      decidePermission: async () => ({ verdict: 'ALLOW', reason: 'ok' }),
      reviewImplementation: async () => {
        reviewerCalls++;
        return { verdict: 'APPROVE', summary: 'Approved after quality retry' };
      }
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    const finalState = await orchestrator.run(state);
    assert.equal(finalState.status, 'completed');
    assert.equal(implPrompts, 2);
    assert.equal(reviewerCalls, 1);
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: bounded review diff truncates oversized patch text', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-big-diff');
  const eventLog = path.join(repoDir, '.ai-orchestrator', 'big-diff-events.jsonl');
  const events = new EventBus(eventLog);
  const origMax = CONFIG.maxDiffChars;

  try {
    CONFIG.maxDiffChars = 300;
    fs.writeFileSync(path.join(repoDir, 'large.txt'), 'line\n'.repeat(400));
    execSync('git add large.txt && git commit -m "add large file"', {
      cwd: repoDir,
      stdio: 'ignore'
    });

    const registry = new HarnessRegistry();
    let capturedDiff = '';
    let capturedTruncated = false;

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        const observations: CommandObservation[] = [];
        return {
          id: 'big-diff-session',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          observedCommands: () => observations,
          prompt: async (promptText) => {
            if (promptText.includes('Work in PLAN mode')) {
              await opts.callbacks.onPlan('Big diff plan', {});
              return { text: 'Plan ok', result: {} };
            }
            const runtimeDir = path.join(
              repoDir,
              '.ai-orchestrator',
              'stage-runtime',
              'stage-01-big-diff'
            );
            fs.mkdirSync(runtimeDir, { recursive: true });
            const evidence: ExecutionEvidence = {
              stage: 'stage-01-big-diff',
              attempt: 1,
              status: 'PASS',
              quality_command: 'npm test',
              quality_exit_code: 0,
              git_diff_check_exit_code: 0,
              focused_tests: [],
              quality_summary: 'ok',
              changed_files: ['large.txt'],
              unresolved: []
            };
            fs.writeFileSync(path.join(repoDir, 'large.txt'), `${'x'.repeat(5000)}\n`);
            fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), JSON.stringify(evidence));
            observations.push(
              ...createPassingObservations({
                sessionId: 'big-diff-session',
                stage: 'stage-01-big-diff',
                attempt: 1,
                runId: opts.runId,
                qualityEpoch,
                workspace: opts.workspace
              })
            );
            return { text: 'done', result: {} };
          },
          stop: async () => {}
        };
      }
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'ok',
        missing_items: [],
        feedback_for_cursor: ''
      }),
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
      decidePermission: async () => ({ verdict: 'ALLOW', reason: 'ok' }),
      reviewImplementation: async (payload: {
        diff?: string;
        diff_metrics?: { truncated?: boolean };
      }) => {
        capturedDiff = payload.diff || '';
        capturedTruncated = Boolean(payload.diff_metrics?.truncated);
        return { verdict: 'APPROVE', summary: 'ok' };
      }
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    await orchestrator.run(state);
    assert.equal(capturedTruncated, true);
    assert.ok(capturedDiff.includes('diff truncated') || capturedDiff.length > CONFIG.maxDiffChars);
  } finally {
    CONFIG.maxDiffChars = origMax;
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: accepts plan submitted only via prompt text fallback', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-plan-text');
  const events = new EventBus(path.join(repoDir, '.ai-orchestrator', 'plan-text-events.jsonl'));

  try {
    const registry = new HarnessRegistry();
    let planSubmitCalls = 0;

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        return {
          id: 'plan-text-session',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          observedCommands: () =>
            createPassingObservations({
              sessionId: 'plan-text-session',
              stage: 'stage-01-plan-text',
              attempt: 1,
              runId: opts.runId,
              qualityEpoch,
              workspace: opts.workspace
            }),
          prompt: async (promptText) => {
            if (promptText.includes('Work in PLAN mode')) {
              return {
                text: '1. Implement frozen requirements for stage-01-plan-text with full tests.\n',
                result: {}
              };
            }
            const stageName = 'stage-01-plan-text';
            fs.writeFileSync(path.join(repoDir, 'plan-text-feature.txt'), 'ok\n');
            const runtimeDir = path.join(repoDir, '.ai-orchestrator', 'stage-runtime', stageName);
            fs.mkdirSync(runtimeDir, { recursive: true });
            const evidence: ExecutionEvidence = {
              stage: stageName,
              attempt: 1,
              status: 'PASS',
              quality_command: 'npm test',
              quality_exit_code: 0,
              git_diff_check_exit_code: 0,
              focused_tests: [],
              quality_summary: 'ok',
              changed_files: ['plan-text-feature.txt'],
              unresolved: []
            };
            fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), JSON.stringify(evidence));
            return { text: 'done', result: {} };
          },
          stop: async () => {}
        };
      }
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => {
        planSubmitCalls++;
        return { verdict: 'APPROVE', summary: 'Plan ok', missing_items: [] };
      },
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
      decidePermission: async () => ({ verdict: 'ALLOW', reason: 'ok' }),
      reviewImplementation: async () => ({ verdict: 'APPROVE', summary: 'ok' })
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    const finalState = await orchestrator.run(state);
    assert.equal(finalState.status, 'completed');
    assert.ok(planSubmitCalls >= 1, 'plan text should flow through planCoord.submit');
    const stageDir = path.join(
      repoDir,
      '.ai-orchestrator',
      'runs',
      state.run_id,
      'stages',
      'stage-01-plan-text'
    );
    assert.ok(fs.existsSync(path.join(stageDir, 'PLAN_REVIEW_HISTORY.md')));
    assert.ok(fs.existsSync(path.join(stageDir, 'DECISIONS.md')));
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: exhausts maxExecutionAttempts when reviewer never approves', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-max-attempts');
  const events = new EventBus(path.join(repoDir, '.ai-orchestrator', 'max-attempts-events.jsonl'));
  const origMax = CONFIG.maxExecutionAttempts;

  try {
    CONFIG.maxExecutionAttempts = 2;
    const registry = new HarnessRegistry();
    let implAttempts = 0;

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        return {
          id: 'max-attempts-session',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          observedCommands: () =>
            createPassingObservations({
              sessionId: 'max-attempts-session',
              stage: 'stage-01-max-attempts',
              attempt: implAttempts,
              runId: opts.runId,
              qualityEpoch,
              workspace: opts.workspace
            }),
          prompt: async (promptText) => {
            if (promptText.includes('Work in PLAN mode')) {
              await opts.callbacks.onPlan('Complete plan for max attempts stage.', {});
              return { text: 'plan', result: {} };
            }
            implAttempts++;
            const stageName = 'stage-01-max-attempts';
            fs.writeFileSync(path.join(repoDir, `attempt-${implAttempts}.txt`), 'x\n');
            const runtimeDir = path.join(repoDir, '.ai-orchestrator', 'stage-runtime', stageName);
            fs.mkdirSync(runtimeDir, { recursive: true });
            const evidence: ExecutionEvidence = {
              stage: stageName,
              attempt: implAttempts,
              status: 'PASS',
              quality_command: 'npm test',
              quality_exit_code: 0,
              git_diff_check_exit_code: 0,
              focused_tests: [],
              quality_summary: 'ok',
              changed_files: [`attempt-${implAttempts}.txt`],
              unresolved: []
            };
            fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), JSON.stringify(evidence));
            return { text: 'impl', result: {} };
          },
          stop: async () => {}
        };
      }
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({ verdict: 'APPROVE', summary: 'ok', missing_items: [] }),
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
      decidePermission: async () => ({ verdict: 'ALLOW', reason: 'ok' }),
      reviewImplementation: async () => ({
        verdict: 'REWORK',
        summary: 'Never satisfied',
        rework_instructions: 'Try again'
      })
    }));

    const store = new RunStateStore(path.join(repoDir, '.ai-orchestrator', 'runs'));
    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    await assert.rejects(() => orchestrator.run(state), /execution attempts/i);
    const finalState = store.load(state.run_id);
    assert.equal(implAttempts, 2);
    assert.equal(finalState.status, 'failed');
    assert.match(finalState.error || '', /execution attempts/i);
    assert.equal(finalState.blocked_stage, 'stage-01-max-attempts');
  } finally {
    CONFIG.maxExecutionAttempts = origMax;
    events.close();
    removeTree(repoDir);
  }
});

test('Orchestrator: cancel delegates to active executor session', async () => {
  const repoDir = createTestRepo();
  const events = new EventBus(path.join(repoDir, 'events.jsonl'), true);
  try {
    const orchestrator = new Orchestrator(events, { workspace: repoDir });
    // When no active executor
    await orchestrator.cancel();

    // With active executor
    let cancelCalled = false;
    (
      orchestrator as unknown as { activeExecutor: { cancel: () => Promise<void> } }
    ).activeExecutor = {
      cancel: async () => {
        cancelCalled = true;
      }
    };
    await orchestrator.cancel();
    assert.equal(cancelCalled, true);

    // With active executor throwing error
    (
      orchestrator as unknown as { activeExecutor: { cancel: () => Promise<void> } }
    ).activeExecutor = {
      cancel: async () => {
        throw new Error('cancel failed');
      }
    };
    await orchestrator.cancel();
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: retries implementation when execution evidence is missing or invalid', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-retry-evidence');
  const eventLog = path.join(repoDir, '.ai-orchestrator', 'test-events.jsonl');
  const events = new EventBus(eventLog);

  try {
    const registry = new HarnessRegistry();
    let currentAttempt = 0;

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        const observations: CommandObservation[] = [];

        return {
          id: 'test-session-retry',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          observedCommands: () => observations,
          prompt: async (promptText) => {
            if (promptText.includes('Work in PLAN mode')) {
              await opts.callbacks.onPlan('Approved plan for retry evidence.', {});
              return { text: 'Plan submitted.', result: {} };
            }

            currentAttempt++;
            fs.writeFileSync(path.join(repoDir, 'attempt.txt'), `Attempt ${currentAttempt}\n`);

            const runtimeDir = path.join(
              repoDir,
              '.ai-orchestrator',
              'stage-runtime',
              'stage-01-retry-evidence'
            );
            fs.mkdirSync(runtimeDir, { recursive: true });

            if (currentAttempt === 1) {
              // Attempt 1: write invalid evidence
              fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), '{ invalid json');
            } else {
              // Attempt 2: valid evidence + observations
              observations.push(
                ...createPassingObservations({
                  sessionId: 'test-session-retry',
                  stage: 'stage-01-retry-evidence',
                  attempt: currentAttempt,
                  runId: opts.runId,
                  qualityEpoch,
                  workspace: opts.workspace
                })
              );
              const evidence: ExecutionEvidence = {
                stage: 'stage-01-retry-evidence',
                attempt: currentAttempt,
                status: 'PASS',
                quality_command: 'npm test',
                quality_exit_code: 0,
                git_diff_check_exit_code: 0,
                focused_tests: [],
                quality_summary: 'All checks green on attempt 2.',
                changed_files: ['attempt.txt'],
                unresolved: []
              };
              fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), JSON.stringify(evidence));
            }

            return { text: 'Done', result: {} };
          },
          stop: async () => {}
        };
      }
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'Plan approved.',
        missing_items: []
      }),
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
      decidePermission: async () => ({ verdict: 'ALLOW' }),
      reviewImplementation: async () => ({
        verdict: 'APPROVE',
        summary: 'Implementation approved on attempt 2.'
      })
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    const finalState = await orchestrator.run(state);
    assert.equal(currentAttempt, 2);
    assert.equal(finalState.status, 'completed');
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: retries implementation when evidence corroboration fails', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-retry-corroboration');
  const eventLog = path.join(repoDir, '.ai-orchestrator', 'test-events.jsonl');
  const events = new EventBus(eventLog);

  try {
    const registry = new HarnessRegistry();
    let currentAttempt = 0;

    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async (opts) => {
        let qualityEpoch = '';
        const observations: CommandObservation[] = [];

        return {
          id: 'test-session-corrob',
          setMode: async () => {},
          setQualityEpoch: (epoch) => {
            qualityEpoch = epoch;
          },
          observedCommands: () => observations,
          prompt: async (promptText) => {
            if (promptText.includes('Work in PLAN mode')) {
              await opts.callbacks.onPlan('Approved plan for corrob test.', {});
              return { text: 'Plan submitted.', result: {} };
            }

            currentAttempt++;
            fs.writeFileSync(path.join(repoDir, 'corrob.txt'), `Attempt ${currentAttempt}\n`);

            const runtimeDir = path.join(
              repoDir,
              '.ai-orchestrator',
              'stage-runtime',
              'stage-01-retry-corroboration'
            );
            fs.mkdirSync(runtimeDir, { recursive: true });

            if (currentAttempt === 1) {
              // Attempt 1: valid evidence JSON, but no observations in session -> corroboration fails!
              const evidence: ExecutionEvidence = {
                stage: 'stage-01-retry-corroboration',
                attempt: 1,
                status: 'PASS',
                quality_command: 'npm test',
                quality_exit_code: 0,
                git_diff_check_exit_code: 0,
                focused_tests: [],
                quality_summary: 'Uncorroborated checks.',
                changed_files: ['corrob.txt'],
                unresolved: []
              };
              fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), JSON.stringify(evidence));
            } else {
              // Attempt 2: valid evidence + matching observations
              observations.push(
                ...createPassingObservations({
                  sessionId: 'test-session-corrob',
                  stage: 'stage-01-retry-corroboration',
                  attempt: currentAttempt,
                  runId: opts.runId,
                  qualityEpoch,
                  workspace: opts.workspace
                })
              );
              const evidence: ExecutionEvidence = {
                stage: 'stage-01-retry-corroboration',
                attempt: currentAttempt,
                status: 'PASS',
                quality_command: 'npm test',
                quality_exit_code: 0,
                git_diff_check_exit_code: 0,
                focused_tests: [],
                quality_summary: 'All checks green on attempt 2.',
                changed_files: ['corrob.txt'],
                unresolved: []
              };
              fs.writeFileSync(path.join(runtimeDir, 'evidence.json'), JSON.stringify(evidence));
            }

            return { text: 'Done', result: {} };
          },
          stop: async () => {}
        };
      }
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'Plan approved.',
        missing_items: []
      }),
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
      decidePermission: async () => ({ verdict: 'ALLOW' }),
      reviewImplementation: async () => ({
        verdict: 'APPROVE',
        summary: 'Implementation approved on attempt 2.'
      })
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    const finalState = await orchestrator.run(state);
    assert.equal(currentAttempt, 2);
    assert.equal(finalState.status, 'completed');
  } finally {
    events.close();
    removeTree(repoDir);
  }
});

test('orchestrator integration: reuses corroborated evidence on resume without prompting executor', async () => {
  const repoDir = createTestRepo();
  const stagesDir = createStageSource(repoDir, 'stage-01-resumed-ev');
  const eventLog = path.join(repoDir, '.ai-orchestrator', 'test-events.jsonl');
  const events = new EventBus(eventLog);

  try {
    const git = new GitRepository(repoDir);
    const store = new RunStateStore(path.join(repoDir, '.ai-orchestrator', 'runs'));
    let executorPromptCalls = 0;
    const testEpoch = 'epoch-resumed-test';

    const registry = new HarnessRegistry();
    registry.registerExecutor('test-exec', () => ({
      info: { id: 'test-exec', label: 'Test Executor', role: 'executor', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      createSession: async () => ({
        id: 'sess-resumed',
        setMode: async () => {},
        observedCommands: () =>
          createPassingObservations({
            sessionId: 'sess-resumed',
            stage: 'stage-01-resumed-ev',
            attempt: 1,
            runId: state.run_id,
            qualityEpoch: testEpoch,
            workspace: repoDir
          }),
        prompt: async () => {
          executorPromptCalls++;
          return { text: 'Done', result: {} };
        },
        stop: async () => {}
      })
    }));

    registry.registerReviewer('test-rev', () => ({
      info: { id: 'test-rev', label: 'Test Reviewer', role: 'reviewer', model: 'fake' },
      preflight: async () => ({ ok: true, details: [] }),
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'Plan approved.',
        missing_items: []
      }),
      answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
      decidePermission: async () => ({ verdict: 'ALLOW' }),
      reviewImplementation: async () => ({
        verdict: 'APPROVE',
        summary: 'Resumed implementation approved.'
      })
    }));

    const orchestrator = new Orchestrator(events, { workspace: repoDir, registry });
    const state = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      executorHarness: 'test-exec',
      reviewerHarness: 'test-rev',
      qualityCmd: 'npm test'
    });

    // Make a file change on the branch
    const branch = state.branch;
    git.createBranch(branch, 'HEAD');
    fs.writeFileSync(path.join(repoDir, 'resumed.txt'), 'resumed content\n');
    const patchFp = git.patchFingerprint();

    // Prepare stage runtime directory with corroborated evidence matching patchFp
    const stageRunDir = store.stageDir(state.run_id, 'stage-01-resumed-ev');
    fs.mkdirSync(stageRunDir, { recursive: true });
    const evidence: ExecutionEvidence = {
      stage: 'stage-01-resumed-ev',
      attempt: 1,
      status: 'PASS',
      quality_command: 'npm test',
      quality_exit_code: 0,
      git_diff_check_exit_code: 0,
      focused_tests: [],
      quality_summary: 'Corroborated green',
      changed_files: ['resumed.txt'],
      unresolved: [],
      patch_fingerprint: patchFp,
      quality_epoch_id: testEpoch
    };
    const evidencePath = path.join(stageRunDir, 'evidence-attempt-1.json');
    fs.writeFileSync(evidencePath, JSON.stringify(evidence));

    // Save stage state with approved plan and evidence file
    const approvedPlanText = 'Pre-approved plan';
    fs.writeFileSync(path.join(stageRunDir, 'approved-plan.md'), approvedPlanText + '\n');
    const planSha = sha256Text(approvedPlanText);
    const specSha = sha256Text(JSON.stringify(state.stages[0].manifest.sha256 || {}));

    store.saveStage(state.run_id, 'stage-01-resumed-ev', {
      phase: 'quality',
      attempt: 1,
      plan_status: 'APPROVE',
      plan_sha256: planSha,
      spec_sha256: specSha,
      evidence_file: evidencePath,
      patch_fingerprint: patchFp,
      executor_session_id: 'sess-resumed'
    });

    const finalState = await orchestrator.run(state);
    assert.equal(finalState.status, 'completed');
    assert.equal(executorPromptCalls, 0);

    // With active executor throwing error
    (
      orchestrator as unknown as { activeExecutor: { cancel: () => Promise<void> } }
    ).activeExecutor = {
      cancel: async () => {
        throw new Error('cancel failed');
      }
    };
    await orchestrator.cancel();
  } finally {
    events.close();
    removeTree(repoDir);
  }
});
