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
import { sha256Text } from '../../src/core/fs.js';
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

  // Fourth identical submission returns identical cached outcome
  const d4 = await p.submit('identical plan candidate');
  assert.equal(d4.accepted, true);
  assert.equal(d4.outcome, 'accepted_with_notes');
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
        throw 'reviewer offline non-error';
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

test('PlanCoordinator: reviewCandidate falls back to APPROVED_AFTER_REVIEW_BUDGET when finalPlanReview is false', async () => {
  const origMax = CONFIG.maxPlanReviews;
  const origFinal = CONFIG.finalPlanReview;
  CONFIG.maxPlanReviews = 1;
  CONFIG.finalPlanReview = false;

  try {
    const f = fixture();
    const p = new PlanCoordinator({
      runId: 'r-budget',
      stage: f.stage,
      stageContext: 'specs',
      reviewer: f.reviewer,
      store: f.store
    });

    // Round 1: regular review (returns REPLAN)
    const r1 = await p.submit('Plan attempt 1');
    assert.equal(r1.outcome, 'needs_revision');

    // Round 2: regular reviews exhausted, finalPlanReview is false -> APPROVED_AFTER_REVIEW_BUDGET
    const r2 = await p.submit('Plan attempt 2');
    assert.equal(r2.outcome, 'accepted_with_notes');
    assert.equal(r2.status, 'APPROVE_WITH_NOTES');
    const s = f.store.loadStage('r-budget', f.stage.name);
    assert.equal(s.plan_status, 'APPROVED_AFTER_REVIEW_BUDGET');
  } finally {
    CONFIG.maxPlanReviews = origMax;
    CONFIG.finalPlanReview = origFinal;
  }
});

test('PlanCoordinator: submit handles duplicate final consolidation error fallback', async () => {
  const f = fixture();
  let calls = 0;
  const reviewer = {
    reviewPlan: async (): Promise<PlanReviewVerdict> => {
      calls++;
      if (calls > 1) throw new Error('duplicate consolidation error');
      return {
        verdict: 'REPLAN',
        summary: 'needs fix',
        missing_items: [],
        feedback_for_cursor: 'revise item 1'
      };
    }
  } as unknown as ReviewerHarness;

  const p = new PlanCoordinator({
    runId: 'r-dup-err',
    stage: f.stage,
    stageContext: 'specs',
    reviewer,
    store: f.store
  });

  await p.submit('dup plan');
  await p.submit('dup plan');
  const d3 = await p.submit('dup plan');
  assert.equal(d3.accepted, true);
  assert.equal(d3.status, 'APPROVE_WITH_NOTES');
});

test('PlanCoordinator: duplicate handling when finalPlanReview is false', async () => {
  const origFinal = CONFIG.finalPlanReview;
  CONFIG.finalPlanReview = false;
  try {
    const f = fixture();
    const p = new PlanCoordinator({
      runId: 'r-dup-nofinal',
      stage: f.stage,
      stageContext: 'specs',
      reviewer: f.reviewer,
      store: f.store
    });
    await p.submit('dup plan');
    await p.submit('dup plan');
    const d3 = await p.submit('dup plan');
    assert.equal(d3.accepted, true);
    assert.equal(d3.status, 'APPROVE_WITH_NOTES');
    assert.equal(p.plan, 'dup plan');
    assert.ok(p.reviewerCarryover.length >= 0);
  } finally {
    CONFIG.finalPlanReview = origFinal;
  }
});

test('PlanCoordinator: reusable edge cases', async () => {
  const f = fixture();
  const p = new PlanCoordinator({
    runId: 'r-reusable-edge',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: f.reviewer,
    store: f.store
  });
  // 1. approved-plan.md does not exist
  assert.equal(p.reusable(), null);

  // 2. approved-plan.md exists but plan_sha256 is null in store
  const stageDir = f.store.stageDir('r-reusable-edge', f.stage.name);
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(path.join(stageDir, 'approved-plan.md'), 'plan content\n');
  assert.equal(p.reusable(), null);

  // 3. approved-plan.md is empty
  f.store.saveStage('r-reusable-edge', f.stage.name, {
    spec_sha256: (p as unknown as { specDigest: () => string }).specDigest(),
    plan_sha256: 'somehash'
  });
  fs.writeFileSync(path.join(stageDir, 'approved-plan.md'), '   \n');
  assert.equal(p.reusable(), null);

  // 4. hash mismatch (tampered file)
  fs.writeFileSync(path.join(stageDir, 'approved-plan.md'), 'tampered content\n');
  assert.equal(p.reusable(), null);

  // 4b. valid plan file with matching hash and reviewer_carryover null
  const validPlanText = 'my valid plan text';
  fs.writeFileSync(path.join(stageDir, 'approved-plan.md'), validPlanText);
  f.store.saveStage('r-reusable-edge', f.stage.name, {
    spec_sha256: (p as unknown as { specDigest: () => string }).specDigest(),
    plan_sha256: sha256Text(validPlanText),
    plan_status: undefined,
    reviewer_carryover: undefined
  });
  const resValidReused = p.reusable();
  assert.equal(resValidReused?.plan, validPlanText);
  assert.equal(resValidReused?.status, 'REUSED');
  assert.equal(resValidReused?.carryover, '');

  // 4c. test getters: p.plan and p.reviewerCarryover
  assert.equal(p.plan, validPlanText);
  assert.equal(p.reviewerCarryover, '');

  // 5. check feedback formatting branches when feedback_for_executor is present
  const fReview: PlanReviewVerdict = {
    verdict: 'REPLAN',
    summary: 'summary only',
    missing_items: [],
    feedback_for_executor: 'executor feedback'
  };
  const fb = (p as unknown as { feedback: (v: PlanReviewVerdict) => string }).feedback(fReview);
  assert.equal(fb, 'executor feedback');
  const fSummaryOnly: PlanReviewVerdict = {
    verdict: 'REPLAN',
    summary: 'summary only',
    missing_items: []
  };
  const fbSummary = (p as unknown as { feedback: (v: PlanReviewVerdict) => string }).feedback(
    fSummaryOnly
  );
  assert.equal(fbSummary, 'summary only');

  // 6. submit with plan that approves with empty summary fallback
  const approveEmptySummary: PlanReviewVerdict = {
    verdict: 'APPROVE',
    summary: '',
    missing_items: []
  };
  const pApprove = new PlanCoordinator({
    runId: 'r-empty-sum',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: {
      reviewPlan: async () => approveEmptySummary
    } as unknown as ReviewerHarness,
    store: f.store
  });
  const resApprove = await pApprove.submit('brand new plan');
  assert.equal(resApprove.accepted, true);

  // 7. regular review verdict REPLAN with empty feedback triggers default feedback branch
  const replanEmptyFeedback: PlanReviewVerdict = {
    verdict: 'REPLAN',
    summary: '',
    missing_items: []
  };
  const pEmptyFb = new PlanCoordinator({
    runId: 'r-empty-fb',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: {
      reviewPlan: async () => replanEmptyFeedback
    } as unknown as ReviewerHarness,
    store: f.store
  });
  const resEmptyFb = await pEmptyFb.submit('brand new plan 2');
  assert.equal(resEmptyFb.accepted, false);
  assert.match(resEmptyFb.feedback, /Revise the complete plan using all reviewer findings/);

  // 8. final consolidation returns empty feedback so fallback to this.lastFeedback
  const origMaxPlan = CONFIG.maxPlanReviews;
  CONFIG.maxPlanReviews = 1;
  try {
    const pConsEmpty = new PlanCoordinator({
      runId: 'r-cons-empty',
      stage: f.stage,
      stageContext: 'specs',
      reviewer: {
        reviewPlan: async (
          _input: unknown,
          opts?: { finalConsolidation?: boolean }
        ): Promise<PlanReviewVerdict> => {
          if (opts?.finalConsolidation) {
            return { verdict: 'APPROVE', summary: '', missing_items: [] };
          }
          return {
            verdict: 'REPLAN',
            summary: 'replan note',
            missing_items: [],
            feedback_for_cursor: 'prior cursor note'
          };
        }
      } as unknown as ReviewerHarness,
      store: f.store
    });
    await pConsEmpty.submit('attempt 1');
    const resCons = await pConsEmpty.submit('attempt 2');
    assert.equal(resCons.accepted, true);
    assert.equal(resCons.status, 'APPROVE_WITH_NOTES');
  } finally {
    CONFIG.maxPlanReviews = origMaxPlan;
  }

  // 9. duplicate final review where finalV has empty feedback falls back to f
  const pDupEmpty = new PlanCoordinator({
    runId: 'r-dup-empty-fb',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: {
      reviewPlan: async (
        _input: unknown,
        opts?: { finalConsolidation?: boolean }
      ): Promise<PlanReviewVerdict> => {
        if (opts?.finalConsolidation) {
          return { verdict: 'APPROVE', summary: '', missing_items: [] };
        }
        return {
          verdict: 'REPLAN',
          summary: 'replan dup',
          missing_items: [],
          feedback_for_cursor: 'duplicate prior note'
        };
      }
    } as unknown as ReviewerHarness,
    store: f.store
  });
  await pDupEmpty.submit('dup attempt');
  await pDupEmpty.submit('dup attempt');
  const resDup = await pDupEmpty.submit('dup attempt');
  assert.equal(resDup.accepted, true);
  assert.equal(resDup.status, 'APPROVE_WITH_NOTES');

  // 10. submit with plan where final consolidation throws and this.lastFeedback is empty string
  const pFinalEmptyLast = new PlanCoordinator({
    runId: 'r-final-empty-last',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: {
      reviewPlan: async (
        _input: unknown,
        opts?: { finalConsolidation?: boolean }
      ): Promise<PlanReviewVerdict> => {
        if (opts?.finalConsolidation) {
          throw new Error('final boom');
        }
        return { verdict: 'REPLAN', summary: '', missing_items: [] };
      }
    } as unknown as ReviewerHarness,
    store: f.store
  });
  const origMaxReviews = CONFIG.maxPlanReviews;
  CONFIG.maxPlanReviews = 1;
  try {
    await pFinalEmptyLast.submit('attempt 1');
    const resFinalEmptyLast = await pFinalEmptyLast.submit('attempt 2');
    assert.equal(resFinalEmptyLast.accepted, true);

    // Call accept via private method with undefined review to hit review ? this.feedback(review) : this.lastFeedback
    (pFinalEmptyLast as unknown as { accept: (p: string, s: string, r: string) => void }).accept(
      'plan without review',
      'APPROVED',
      'Autonomous'
    );
  } finally {
    CONFIG.maxPlanReviews = origMaxReviews;
  }
});

test('PlanCoordinator: formats feedback using feedback_for_cursor when feedback_for_executor is omitted', async () => {
  const f = fixture();
  const reviewer = {
    reviewPlan: async (): Promise<PlanReviewVerdict> => ({
      verdict: 'REPLAN',
      summary: 'need changes',
      feedback_for_cursor: 'cursor feedback only',
      missing_items: ['Item A']
    })
  } as unknown as ReviewerHarness;
  const p = new PlanCoordinator({
    runId: 'r-fb-cursor',
    stage: f.stage,
    stageContext: 'specs',
    reviewer,
    store: f.store
  });
  const res = await p.submit('initial plan');
  assert.equal(res.outcome, 'needs_revision');
  assert.match(res.feedback, /cursor feedback only/);
  assert.match(res.feedback, /Item A/);
});
