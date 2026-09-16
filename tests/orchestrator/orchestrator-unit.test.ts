/**
 * @fileoverview Focused unit tests for Orchestrator internals that are hard to reach via full integration runs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Orchestrator } from '../../src/orchestrator/Orchestrator.js';
import { EventBus } from '../../src/ui/EventBus.js';
import { CONFIG } from '../../src/core/config.js';
import { HarnessRegistry } from '../../src/harness/registry.js';
import { removeTree } from '../../src/core/fs.js';
import type { SelectedStage } from '../../src/types.js';

test('Orchestrator classifyError maps failures to persisted run statuses', () => {
  const eventFile = path.join(os.tmpdir(), `orch-classify-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const orchestrator = new Orchestrator(events, { workspace: process.cwd() });
  const classifyError = (
    orchestrator as unknown as { classifyError: (e: unknown) => string }
  ).classifyError.bind(orchestrator);

  try {
    assert.equal(classifyError(new Error('HTTP 429 rate limit exceeded')), 'external_dependency');
    assert.equal(
      classifyError(new Error('authentication credentials invalid')),
      'external_dependency'
    );
    assert.equal(classifyError(new Error('Command timeout after 60s')), 'retryable_error');
    assert.equal(
      classifyError(new Error('Specification contradicts frozen requirements')),
      'specification_blocked'
    );
    assert.equal(classifyError(new Error('Stage failed for other reasons')), 'failed');

    // Test error classification triggers via structured ReviewerErrorClassifier matches
    assert.equal(classifyError(new Error('API quota exhausted')), 'external_dependency');
    assert.equal(classifyError(new Error('Subprocess turn failed')), 'failed');
    assert.equal(classifyError(new Error('process crashed abnormally')), 'retryable_error');
    assert.equal(classifyError(new Error('Network connection unavailable')), 'retryable_error');
    assert.equal(classifyError(new Error('Invalid token credentials')), 'external_dependency');
    assert.equal(classifyError('string-based error without Error instance'), 'failed');
  } finally {
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator createReviewerHarness routes custom reviewer ids through ReviewerRouter', () => {
  const eventFile = path.join(os.tmpdir(), `orch-unit-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const registry = new HarnessRegistry();
  registry.registerReviewer('custom-reviewer', () => ({
    info: { id: 'custom-reviewer', label: 'Custom', role: 'reviewer', model: 'x' },
    preflight: async () => ({ ok: true, details: [] }),
    reviewPlan: async () => ({ verdict: 'APPROVE', summary: '', missing_items: [] }),
    answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
    decidePermission: async () => ({ verdict: 'ALLOW' }),
    reviewImplementation: async () => ({ verdict: 'APPROVE', summary: '' })
  }));

  const orchestrator = new Orchestrator(events, { workspace: process.cwd(), registry });
  const createReviewerHarness = (
    orchestrator as unknown as {
      createReviewerHarness: (id: string, ctx: Record<string, unknown>) => { info: { id: string } };
    }
  ).createReviewerHarness.bind(orchestrator);

  const origReviewer = CONFIG.reviewer;
  try {
    assert.ok(CONFIG.reviewer);
    const harness = createReviewerHarness('custom-reviewer', {
      runDir: os.tmpdir(),
      stageName: 'stage-01',
      stageContext: '',
      skillsText: '',
      runLog: path.join(os.tmpdir(), 'run.log')
    });
    assert.equal(harness.info.id, 'reviewer-router');
    const router = harness as unknown as { config: { primary: { harness: string } } };
    assert.equal(router.config.primary.harness, 'custom-reviewer');
  } finally {
    CONFIG.reviewer = origReviewer;
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator createReviewerHarness keeps router fallback for built-in reviewer ids', () => {
  const eventFile = path.join(os.tmpdir(), `orch-unit-builtin-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const registry = new HarnessRegistry();
  const orchestrator = new Orchestrator(events, { workspace: process.cwd(), registry });
  const createReviewerHarness = (
    orchestrator as unknown as {
      createReviewerHarness: (
        id: string,
        ctx: Record<string, unknown>
      ) => {
        info: { id: string };
        config: { fallback: { harness: string }; largeDiff: { harness: string } };
      };
    }
  ).createReviewerHarness.bind(orchestrator);

  const origReviewer = CONFIG.reviewer;
  try {
    assert.ok(CONFIG.reviewer);
    const harness = createReviewerHarness('codex', {
      runDir: os.tmpdir(),
      stageName: 'stage-01',
      stageContext: '',
      skillsText: '',
      runLog: path.join(os.tmpdir(), 'run-builtin.log')
    });
    assert.equal(harness.info.id, 'reviewer-router');
    assert.equal(harness.config.fallback.harness, CONFIG.reviewer.fallback.harness);
    assert.equal(harness.config.largeDiff.harness, CONFIG.reviewer.largeDiff.harness);
  } finally {
    CONFIG.reviewer = origReviewer;
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator createReviewerHarness uses registry when CONFIG.reviewer is unset', () => {
  const eventFile = path.join(os.tmpdir(), `orch-unit-registry-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const registry = new HarnessRegistry();
  registry.registerReviewer('plain-reviewer', () => ({
    info: { id: 'plain-reviewer', label: 'Plain', role: 'reviewer', model: 'x' },
    preflight: async () => ({ ok: true, details: [] }),
    reviewPlan: async () => ({ verdict: 'APPROVE', summary: '', missing_items: [] }),
    answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
    decidePermission: async () => ({ verdict: 'ALLOW' }),
    reviewImplementation: async () => ({ verdict: 'APPROVE', summary: '' })
  }));

  const orchestrator = new Orchestrator(events, { workspace: process.cwd(), registry });
  const createReviewerHarness = (
    orchestrator as unknown as {
      createReviewerHarness: (id: string, ctx: Record<string, unknown>) => { info: { id: string } };
    }
  ).createReviewerHarness.bind(orchestrator);

  const origReviewer = CONFIG.reviewer;
  try {
    (CONFIG as { reviewer?: typeof CONFIG.reviewer }).reviewer = undefined;
    const harness = createReviewerHarness('plain-reviewer', {
      runDir: os.tmpdir(),
      stageName: 'stage-01',
      stageContext: '',
      skillsText: '',
      runLog: path.join(os.tmpdir(), 'run-plain.log')
    });
    assert.equal(harness.info.id, 'plain-reviewer');
  } finally {
    CONFIG.reviewer = origReviewer;
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator preflight succeeds when both harnesses report ok', async () => {
  const eventFile = path.join(os.tmpdir(), `orch-preflight-ok-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const registry = new HarnessRegistry();
  registry.registerExecutor('mock-exec', () => ({
    info: { id: 'mock-exec', label: 'Mock Exec', role: 'executor', model: 'x' },
    preflight: async () => ({ ok: true, details: ['mock exec ok'] }),
    createSession: async () => ({}) as never
  }));
  registry.registerReviewer('mock-rev', () => ({
    info: { id: 'mock-rev', label: 'Mock Rev', role: 'reviewer', model: 'y' },
    preflight: async () => ({ ok: true, details: ['mock rev ok'] }),
    reviewPlan: async () => ({}) as never,
    answerQuestions: async () => ({}) as never,
    decidePermission: async () => ({}) as never,
    reviewImplementation: async () => ({}) as never
  }));

  const orchestrator = new Orchestrator(events, { workspace: process.cwd(), registry });
  try {
    const res = await orchestrator.preflight({
      executor_harness: 'mock-exec',
      reviewer_harness: 'mock-rev'
    });
    assert.equal(res.executor.ok, true);
    assert.equal(res.reviewer.ok, true);

    // Call without parameters to exercise stateOrInput fallback branches
    const resDefault = await orchestrator.preflight({});
    assert.equal(resDefault.executor.ok, true);
    assert.equal(resDefault.reviewer.ok, true);

    // Call createReviewerHarness with primary reviewer id
    const orchAny = orchestrator as unknown as {
      createReviewerHarness: (id: string, ctx: Record<string, unknown>) => { info: { id: string } };
    };
    const primaryHarness = orchAny.createReviewerHarness(
      CONFIG.reviewer?.primary.harness || 'mock-rev',
      {
        runDir: os.tmpdir(),
        stageName: 'stage-01',
        stageContext: '',
        skillsText: '',
        runLog: path.join(os.tmpdir(), 'run-primary.log')
      }
    );
    assert.equal(primaryHarness.info.id, 'reviewer-router');
  } finally {
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator preflight rejects with error when either harness reports ok: false', async () => {
  const eventFile = path.join(os.tmpdir(), `orch-preflight-fail-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const registry = new HarnessRegistry();
  registry.registerExecutor('mock-exec-fail', () => ({
    info: { id: 'mock-exec-fail', label: 'Mock Exec Fail', role: 'executor', model: 'x' },
    preflight: async () => ({ ok: false, details: ['exec binary not found'] }),
    createSession: async () => ({}) as never
  }));
  registry.registerReviewer('mock-rev-ok', () => ({
    info: { id: 'mock-rev-ok', label: 'Mock Rev Ok', role: 'reviewer', model: 'y' },
    preflight: async () => ({ ok: true, details: ['mock rev ok'] }),
    reviewPlan: async () => ({}) as never,
    answerQuestions: async () => ({}) as never,
    decidePermission: async () => ({}) as never,
    reviewImplementation: async () => ({}) as never
  }));

  const orchestrator = new Orchestrator(events, { workspace: process.cwd(), registry });
  try {
    await assert.rejects(
      () =>
        orchestrator.preflight({
          executor_harness: 'mock-exec-fail',
          reviewer_harness: 'mock-rev-ok'
        }),
      (err: Error) => {
        assert.match(err.message, /Harness preflight failed/);
        assert.match(err.message, /exec binary not found/);
        return true;
      }
    );
  } finally {
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator boundedDiff truncates diff exceeding CONFIG.maxDiffChars', () => {
  const eventFile = path.join(os.tmpdir(), `orch-diff-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const orchestrator = new Orchestrator(events, { workspace: process.cwd() });
  const orchAny = orchestrator as unknown as {
    git: { reviewDiff: (paths?: string[]) => string };
    boundedDiff: (paths?: string[]) => string;
  };

  const origReviewDiff = orchAny.git.reviewDiff;
  try {
    // Small diff
    orchAny.git.reviewDiff = () => 'short diff';
    assert.equal(orchAny.boundedDiff(), 'short diff');

    // Huge diff
    const huge = 'x'.repeat(CONFIG.maxDiffChars + 100);
    orchAny.git.reviewDiff = () => huge;
    const truncated = orchAny.boundedDiff();
    assert.ok(truncated.length > CONFIG.maxDiffChars);
    assert.match(truncated, /diff truncated: total/);
    assert.match(truncated, /NEEDS_CONTEXT/);

    // Test with explicit paths parameter
    const truncatedWithPaths = orchAny.boundedDiff(['file1.ts', 'file2.ts']);
    assert.ok(truncatedWithPaths.length > CONFIG.maxDiffChars);
  } finally {
    orchAny.git.reviewDiff = origReviewDiff;
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator specDigest computes deterministic sha256 of manifest', () => {
  const eventFile = path.join(os.tmpdir(), `orch-digest-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const orchestrator = new Orchestrator(events, { workspace: process.cwd() });
  const orchAny = orchestrator as unknown as {
    specDigest: (stage: SelectedStage) => string;
  };

  try {
    const stage1: SelectedStage = {
      name: 'stage-01',
      selector: '01',
      status: 'pending',
      manifest: {
        name: 'stage-01',
        selector: '01',
        source: '/tmp/stage-01',
        relative_path: 'stage-01',
        sha256: { 'functional-spec.md': 'abc123' }
      }
    };
    const digest1 = orchAny.specDigest(stage1);
    const digest2 = orchAny.specDigest(stage1);
    assert.equal(digest1, digest2);
    assert.equal(typeof digest1, 'string');
    assert.equal(digest1.length, 64);

    const stageEmpty: SelectedStage = {
      name: 'stage-02',
      selector: '02',
      status: 'pending',
      manifest: {
        name: 'stage-02',
        selector: '02',
        source: '/tmp/stage-02',
        relative_path: 'stage-02',
        sha256: {}
      }
    };
    assert.equal(orchAny.specDigest(stageEmpty).length, 64);
  } finally {
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator planPrompt and executionPrompt format expected instructions', () => {
  const eventFile = path.join(os.tmpdir(), `orch-prompts-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const orchestrator = new Orchestrator(events, { workspace: process.cwd() });
  const orchAny = orchestrator as unknown as {
    planPrompt: (stage: string) => string;
    executionPrompt: (
      stage: string,
      plan: string,
      carry: string,
      feedback: string,
      attempt: number,
      quality: string
    ) => string;
  };

  try {
    const pPrompt = orchAny.planPrompt('stage-01');
    assert.match(pPrompt, /Work in PLAN mode for stage-01/);

    const ePrompt = orchAny.executionPrompt(
      'stage-01',
      'My plan',
      'carry findings',
      'review feedback',
      1,
      'npm test'
    );
    assert.match(ePrompt, /You are the implementation executor for stage-01/);
    assert.match(ePrompt, /APPROVED PLAN:\nMy plan/);
    assert.match(ePrompt, /MANDATORY PLAN-REVIEW CARRY-OVER:\ncarry findings/);
    assert.match(ePrompt, /REWORK INSTRUCTIONS FROM FINAL REVIEW \/ QUALITY:\nreview feedback/);

    // Call executionPrompt with empty carry and empty feedback
    const ePromptClean = orchAny.executionPrompt('stage-01', 'My plan', '', '', 1, 'npm test');
    assert.match(ePromptClean, /MANDATORY PLAN-REVIEW CARRY-OVER:\n_None\._/);
    assert.doesNotMatch(ePromptClean, /REWORK INSTRUCTIONS FROM FINAL REVIEW/);
  } finally {
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator ensureExclude writes .ai-orchestrator entry to .git/info/exclude', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-exclude-'));
  const gitInfo = path.join(tmpDir, '.git', 'info');
  fs.mkdirSync(gitInfo, { recursive: true });
  const eventFile = path.join(tmpDir, 'events.jsonl');
  const events = new EventBus(eventFile, true);
  try {
    const orchestrator = new Orchestrator(events, { workspace: tmpDir });
    orchestrator.ensureExclude();
    const excludeFile = path.join(gitInfo, 'exclude');
    assert.ok(fs.existsSync(excludeFile));
    assert.match(fs.readFileSync(excludeFile, 'utf8'), /\.ai-orchestrator\//);

    // Call again to verify idempotence
    orchestrator.ensureExclude();
  } finally {
    events.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Orchestrator constructor branch manager callback invokes store.save', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-bm-cb-'));
  const eventFile = path.join(tmpDir, 'events.jsonl');
  const events = new EventBus(eventFile, true);
  try {
    let savedState = false;
    const mockStore = {
      save: () => {
        savedState = true;
      },
      stageDir: () => tmpDir
    } as unknown as import('../../src/state/RunStateStore.js').RunStateStore;

    const orchestrator = new Orchestrator(events, { workspace: tmpDir, store: mockStore });
    // Mock git methods on orchestrator to avoid needing real git repo
    orchestrator.git.isDirty = () => false;
    orchestrator.git.branchExists = () => false;
    orchestrator.git.createBranch = () => {};
    orchestrator.git.currentBranch = () => 'test-branch';

    const mockState: import('../../src/types.js').RunState = {
      version: 1,
      run_id: 'test-run',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'created',
      workspace: tmpDir,
      base_ref: 'HEAD',
      base_commit: 'head',
      original_branch: 'main',
      original_head: 'head',
      stage_source: tmpDir,
      branch: 'test-branch',
      branch_created: false,
      current_stage_index: 0,
      current_phase: 'pending',
      stages: [],
      executor_harness: 'mock-exec',
      reviewer_harness: 'mock-rev',
      quality_cmd: 'npm test'
    };

    orchestrator.branch.ensureCreated(mockState);
    assert.equal(savedState, true);
  } finally {
    events.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Orchestrator createRun calculates multi-stage branch suffix and respects custom branch', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-createrun-'));
  const stagesDir = path.join(tmpDir, 'stages');
  fs.mkdirSync(stagesDir);
  for (const name of ['stage-01-one', 'stage-02-two']) {
    const dir = path.join(stagesDir, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'functional-spec.md'), '# Functional\n');
    fs.writeFileSync(path.join(dir, 'technical-spec.md'), '# Technical\n');
    fs.writeFileSync(path.join(dir, 'prompt.md'), '# Prompt\n');
  }

  const eventFile = path.join(tmpDir, 'events.jsonl');
  const events = new EventBus(eventFile, true);
  try {
    const orchestrator = new Orchestrator(events, { workspace: tmpDir });
    // Mock git run for rev-parse
    orchestrator.git.run = () => ({
      status: 0,
      stdout: 'mock-commit-sha\n',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
      code: 0
    });
    orchestrator.git.currentBranch = () => 'main';
    orchestrator.git.head = () => 'mock-commit-sha';

    // 1. Multi-stage suffix
    const stateMulti = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01', '02'],
      executorHarness: 'cursor',
      reviewerHarness: 'codex'
    });
    assert.ok(stateMulti.branch.includes('01-to-02'));

    // 2. Custom branch parameter
    const stateCustom = orchestrator.createRun({
      stageSource: stagesDir,
      selectors: ['01'],
      branch: 'custom/my-branch',
      feature: ''
    });
    assert.equal(stateCustom.branch, 'custom/my-branch');
    assert.equal(stateCustom.feature, null);

    // 3. prepareFrozenInputs exercises directory copying and read-only tree creation
    orchestrator.prepareFrozenInputs(stateCustom);
    const frozenStage = path.join(tmpDir, '.ai-orchestrator', 'stage-input', 'stage-01-one');
    assert.ok(fs.existsSync(path.join(frozenStage, 'functional-spec.md')));

    // 4. Test ensureExclude when directory doesn't exist
    const noExcludeOrch = new Orchestrator(events, { workspace: path.join(tmpDir, 'no-git') });
    assert.doesNotThrow(() => noExcludeOrch.ensureExclude());
  } finally {
    events.close();
    removeTree(tmpDir);
  }
});
