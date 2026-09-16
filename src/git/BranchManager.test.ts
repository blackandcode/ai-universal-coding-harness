/**
 * @fileoverview Unit tests for BranchManager.
 * Tests dedicated AI branch creation, branch reconciliation across crashes, stash isolation, and active branch assertions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BranchManager } from './BranchManager.js';
import { GitRepository } from './GitRepository.js';
import { GitLifecycleError } from '../errors.js';
import type { RunState } from '../types.js';

function createMockGit(overrides: Partial<GitRepository> = {}): GitRepository {
  return {
    branchExists: () => false,
    currentBranch: () => 'main',
    isDirty: () => false,
    findStash: () => '',
    stash: () => '',
    switch: () => {},
    createBranch: () => {},
    ...overrides,
  } as unknown as GitRepository;
}

function createDummyRunState(overrides: Partial<RunState> = {}): RunState {
  return {
    version: 1,
    run_id: 'test-run-123',
    created_at: new Date().toISOString(),
    status: 'created',
    workspace: '/test',
    base_ref: 'HEAD',
    base_commit: 'abc1234',
    original_branch: 'main',
    original_head: 'abc1234',
    branch: 'ai-harness/test-run-123-s01',
    branch_created: false,
    stage_source: '/stages',
    stages: [],
    executor_harness: 'cursor',
    reviewer_harness: 'codex',
    quality_cmd: 'npm test',
    ...overrides,
  };
}

test('BranchManager reconciles branch state when branch already exists', () => {
  let savedState: RunState | null = null;
  const mockGit = createMockGit({
    branchExists: (b) => b === 'ai-harness/test-run-123-s01',
    currentBranch: () => 'main',
  });

  const bm = new BranchManager(mockGit, (s) => {
    savedState = s;
  });

  const state = createDummyRunState();
  bm.reconcile(state);

  const res1 = savedState as RunState | null;
  assert.equal(res1?.branch_created, true);
  assert.ok(res1?.branch_created_at);
});

test('BranchManager stashes dirty workspace before creating branch', () => {
  let stashedLabel = '';
  let branchCreated = '';
  let branchBase = '';
  let savedState: RunState | null = null;

  const mockGit = createMockGit({
    branchExists: () => false,
    currentBranch: () => 'main',
    isDirty: () => true,
    stash: (label) => {
      stashedLabel = label;
      return 'stash-commit-sha';
    },
    createBranch: (name, base) => {
      branchCreated = name;
      branchBase = base;
    },
  });

  const bm = new BranchManager(mockGit, (s) => {
    savedState = s;
  });

  const state = createDummyRunState();
  bm.ensureCreated(state);

  const res2 = savedState as RunState | null;
  assert.equal(stashedLabel, `ai-orchestrator-pre-run-${state.run_id}`);
  assert.equal(res2?.pre_run_stash?.commit, 'stash-commit-sha');
  assert.equal(branchCreated, state.branch);
  assert.equal(branchBase, state.base_commit);
  assert.equal(res2?.branch_created, true);
});

test('BranchManager assertActive throws GitLifecycleError when dirty on wrong branch', () => {
  const mockGit = createMockGit({
    currentBranch: () => 'other-branch',
    isDirty: () => true,
  });

  const bm = new BranchManager(mockGit, () => {});
  const state = createDummyRunState();

  assert.throws(() => bm.assertActive(state), GitLifecycleError);
});

test('BranchManager assertActive switches back to AI branch when clean', () => {
  let switchedTo = '';
  const mockGit = createMockGit({
    currentBranch: () => 'other-branch',
    isDirty: () => false,
    switch: (b) => {
      switchedTo = b;
    },
  });

  const bm = new BranchManager(mockGit, () => {});
  const state = createDummyRunState();

  bm.assertActive(state);
  assert.equal(switchedTo, state.branch);
});

test('BranchManager reconcile recovers existing pre-run stash', () => {
  let savedState: RunState | null = null;
  const mockGit = createMockGit({
    branchExists: () => true,
    currentBranch: () => 'main',
    findStash: (label) => (label.includes('test-run-123') ? 'recovered-stash-commit' : ''),
  });

  const bm = new BranchManager(mockGit, (s) => {
    savedState = s;
  });
  const state = createDummyRunState();
  bm.reconcile(state);

  const res = savedState as RunState | null;
  assert.equal(res?.pre_run_stash?.commit, 'recovered-stash-commit');
});
