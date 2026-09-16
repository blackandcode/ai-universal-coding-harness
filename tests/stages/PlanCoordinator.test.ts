/**
 * @fileoverview Unit tests for PlanCoordinator.
 * Tests plan review iterations, caching, duplicate detection, budget exhaustion handling, and carryover notes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONFIG, DEFAULT_CONFIG } from '../../src/core/config.js';
import { PlanCoordinator } from '../../src/stages/PlanCoordinator.js';
import type { ReviewerHarness, PlanDecision } from '../../src/harness/types.js';
import type { RunStateStore } from '../../src/state/RunStateStore.js';
import type { SelectedStage, StageRuntimeState, PlanReviewVerdict } from '../../src/types.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-plan-'));
  let state: StageRuntimeState = { version: 1, phase: 'pending' };
  let calls = 0;
  const store = {
    stageDir: () => root,
    loadStage: () => state,
    saveStage: (_r: string, _s: string, p: Partial<StageRuntimeState>) => {
      state = { ...state, ...p };
      return state;
    },
    appendHuman: () => {}
  } as unknown as RunStateStore;

  const reviewer = {
    info: { id: 'test-reviewer', label: 'Test Reviewer', role: 'reviewer', model: 'test' },
    preflight: async () => ({ ok: true, details: [] }),
    answerQuestions: async () => ({ verdict: 'ANSWER' }),
    decidePermission: async () => ({ verdict: 'ALLOW' }),
    reviewImplementation: async () => ({ verdict: 'APPROVE', summary: 'ok' }),
    reviewPlan: async (
      _input: unknown,
      opts?: { finalConsolidation?: boolean }
    ): Promise<PlanReviewVerdict> => {
      calls++;
      return {
        verdict: opts?.finalConsolidation ? 'BLOCKED' : 'REPLAN',
        summary: 'Consolidated review',
        missing_items: ['A', 'B'],
        feedback_for_cursor: 'Apply all A and B'
      };
    }
  } as unknown as ReviewerHarness;

  const stage: SelectedStage = {
    name: 'stage-06-test',
    selector: '06',
    status: 'pending',
    manifest: {
      name: 'stage-06-test',
      selector: '06',
      source: '/stages',
      relative_path: 'stage-06-test',
      sha256: { 'functional-spec.md': 'a', 'technical-spec.md': 'b', 'prompt.md': 'c' }
    }
  };

  return {
    root,
    store,
    reviewer,
    stage,
    get calls() {
      return calls;
    }
  };
}

test('duplicate REPLAN hash returns needs_revision before duplicate consolidation', async () => {
  const f = fixture();
  const p = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'all frozen specs',
    reviewer: f.reviewer,
    store: f.store
  });
  const plan = 'Identical plan text for duplicate detection.';
  const first = await p.submit(plan);
  assert.equal(first.accepted, false);
  const second = await p.submit(plan);
  assert.equal(second.outcome, 'needs_revision');
  assert.equal(second.accepted, false);
  assert.ok(second.feedback);
});

test('three regular reviews plus one final consolidation always proceeds', async () => {
  const origMaxPlanReviews = CONFIG.maxPlanReviews;
  const origFinalPlanReview = CONFIG.finalPlanReview;
  CONFIG.maxPlanReviews = DEFAULT_CONFIG.maxPlanReviews;
  CONFIG.finalPlanReview = DEFAULT_CONFIG.finalPlanReview;
  try {
    const f = fixture();
    const p = new PlanCoordinator({
      runId: 'r',
      stage: f.stage,
      stageContext: 'all frozen specs',
      reviewer: f.reviewer,
      store: f.store
    });
    let d: PlanDecision | null = null;
    for (let i = 1; i <= 4; i++) {
      d = await p.submit(`complete plan revision ${i}`);
    }
    assert.equal(f.calls, 4);
    assert.ok(d);
    assert.equal(d.accepted, true);
    assert.equal(d.outcome, 'accepted_with_notes');
    assert.match(d.status || '', /APPROVE/);
    assert.ok(fs.existsSync(path.join(f.root, 'approved-plan.md')));
  } finally {
    CONFIG.maxPlanReviews = origMaxPlanReviews;
    CONFIG.finalPlanReview = origFinalPlanReview;
  }
});

test('review budget is advisory and never produces a blocked plan state', async () => {
  const f = fixture();
  const p = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: f.reviewer,
    store: f.store
  });
  let d: PlanDecision | null = null;
  for (let i = 0; i < 5; i++) {
    d = await p.submit(`plan ${i} with full scope`);
    if (d.accepted) break;
  }
  assert.ok(d);
  assert.equal(d.accepted, true);
  assert.notEqual(d.verdict?.verdict, 'BLOCKED');
});

test('approved plan is reusable only when plan and spec hashes still match', async () => {
  const f = fixture();
  const first = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: {
      reviewPlan: async (): Promise<PlanReviewVerdict> => ({
        verdict: 'APPROVE',
        summary: 'ok',
        missing_items: [],
        feedback_for_cursor: ''
      })
    } as unknown as ReviewerHarness,
    store: f.store
  });
  const result = await first.submit('complete stable plan');
  assert.equal(result.accepted, true);
  assert.equal(result.outcome, 'accepted');

  const second = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: f.reviewer,
    store: f.store
  });
  assert.equal(second.reusable()?.plan, 'complete stable plan');

  fs.writeFileSync(path.join(f.root, 'approved-plan.md'), 'tampered plan\n');
  const third = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: f.reviewer,
    store: f.store
  });
  assert.equal(third.reusable(), null);
});

test('duplicate plan submission converges and carries over feedback', async () => {
  const f = fixture();
  const p = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: f.reviewer,
    store: f.store
  });

  const d1 = await p.submit('identical plan candidate');
  assert.equal(d1.accepted, false);
  assert.equal(d1.outcome, 'needs_revision');

  const d2 = await p.submit('identical plan candidate');
  assert.equal(d2.accepted, false);
  assert.equal(d2.outcome, 'needs_revision');

  // Third identical submission triggers duplicate convergence
  const d3 = await p.submit('identical plan candidate');
  assert.equal(d3.accepted, true);
  assert.equal(d3.outcome, 'accepted_with_notes');
  assert.ok(d3.carryover.length > 0);
});

test('empty plan submission is rejected immediately', async () => {
  const f = fixture();
  const p = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: f.reviewer,
    store: f.store
  });

  const res = await p.submit('   ');
  assert.equal(res.accepted, false);
  assert.equal(res.outcome, 'needs_revision');
  assert.equal(res.feedback, 'Plan is empty.');
});

test('PlanCoordinator: forceAccept creates approved plan with carryover', () => {
  const f = fixture();
  const p = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: f.reviewer,
    store: f.store
  });

  const acceptedPlan = p.forceAccept('emergency plan');
  assert.equal(acceptedPlan, 'emergency plan');
  assert.ok(fs.existsSync(path.join(f.root, 'PLAN.md')));
});

test('PlanCoordinator: accepts identical cached plan when reviewer already approved', async () => {
  const f = fixture();
  const reviewer = {
    reviewPlan: async (): Promise<PlanReviewVerdict> => ({
      verdict: 'APPROVE',
      summary: 'ok',
      missing_items: [],
      feedback_for_cursor: ''
    })
  } as unknown as ReviewerHarness;
  const p = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer,
    store: f.store
  });

  const first = await p.submit('stable approved plan text');
  assert.equal(first.accepted, true);

  const resubmit = await p.submit('stable approved plan text');
  assert.equal(resubmit.accepted, true);
  assert.equal(resubmit.outcome, 'accepted');
});

test('PlanCoordinator: final consolidation reviewer failure falls back to autonomous approval', async () => {
  const f = fixture();
  let calls = 0;
  const reviewer = {
    reviewPlan: async (
      _input: unknown,
      opts?: { finalConsolidation?: boolean }
    ): Promise<PlanReviewVerdict> => {
      calls++;
      if (opts?.finalConsolidation) {
        throw new Error('reviewer offline');
      }
      return {
        verdict: 'REPLAN',
        summary: 'needs work',
        missing_items: ['x'],
        feedback_for_cursor: 'fix x'
      };
    }
  } as unknown as ReviewerHarness;

  const p = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer,
    store: f.store
  });

  let decision: PlanDecision | null = null;
  for (let i = 0; i < 5; i++) {
    decision = await p.submit(`plan iteration ${i}`);
    if (decision.accepted) break;
  }
  assert.ok(decision?.accepted);
  assert.ok(calls >= 4);
});

test('PlanCoordinator: reusable returns null when spec digest changes', async () => {
  const f = fixture();
  const reviewer = {
    reviewPlan: async (): Promise<PlanReviewVerdict> => ({
      verdict: 'APPROVE',
      summary: 'ok',
      missing_items: [],
      feedback_for_cursor: ''
    })
  } as unknown as ReviewerHarness;
  const p = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer,
    store: f.store
  });
  await p.submit('digest-bound plan');

  const changedStage: SelectedStage = {
    ...f.stage,
    manifest: {
      ...f.stage.manifest,
      sha256: { ...f.stage.manifest.sha256, 'functional-spec.md': 'changed' }
    }
  };
  const p2 = new PlanCoordinator({
    runId: 'r',
    stage: changedStage,
    stageContext: 'specs',
    reviewer,
    store: f.store
  });
  assert.equal(p2.reusable(), null);
});

test('PlanCoordinator: forceAccept with empty plan uses default template', () => {
  const f = fixture();
  const p = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: f.reviewer,
    store: f.store
  });
  const plan = p.forceAccept('   ');
  assert.ok(plan.includes('functional-spec.md'));
  assert.ok(fs.existsSync(path.join(f.root, 'approved-plan.md')));
});
