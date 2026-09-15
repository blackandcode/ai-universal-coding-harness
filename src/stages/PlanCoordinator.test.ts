import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PlanCoordinator } from './PlanCoordinator.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-plan-'));
  let state: any = { version: 1, phase: 'pending' };
  let calls = 0;
  const store: any = {
    stageDir: () => root,
    loadStage: () => state,
    saveStage: (_r: string, _s: string, p: any) => (state = { ...state, ...p }),
    appendHuman: () => {},
  };
  const reviewer: any = {
    reviewPlan: async (_input: any, opts?: any) => {
      calls++;
      return {
        verdict: opts?.finalConsolidation ? 'BLOCKED' : 'REPLAN',
        summary: 'Consolidated review',
        missing_items: ['A', 'B'],
        feedback_for_cursor: 'Apply all A and B',
      };
    },
  };
  const stage: any = {
    name: 'stage-06-test',
    selector: '06',
    status: 'pending',
    manifest: { sha256: { 'functional-spec.md': 'a', 'technical-spec.md': 'b', 'prompt.md': 'c' } },
  };
  return {
    root,
    store,
    reviewer,
    stage,
    get calls() {
      return calls;
    },
  };
}

test('three regular reviews plus one final consolidation always proceeds', async () => {
  const f = fixture();
  const p = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'all frozen specs',
    reviewer: f.reviewer,
    store: f.store,
  });
  let d: any;
  for (let i = 1; i <= 4; i++) d = await p.submit(`complete plan revision ${i}`);
  assert.equal(f.calls, 4);
  assert.equal(d.accepted, true);
  assert.match(d.status, /APPROVE/);
  assert.ok(fs.existsSync(path.join(f.root, 'approved-plan.md')));
});

test('review budget is advisory and never produces a blocked plan state', async () => {
  const f = fixture();
  const p = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: f.reviewer,
    store: f.store,
  });
  let d: any;
  for (let i = 0; i < 5; i++) {
    d = await p.submit(`plan ${i} with full scope`);
    if (d.accepted) break;
  }
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
      reviewPlan: async () => ({
        verdict: 'APPROVE',
        summary: 'ok',
        missing_items: [],
        feedback_for_cursor: '',
      }),
    } as any,
    store: f.store,
  });
  const result = await first.submit('complete stable plan');
  assert.equal(result.accepted, true);
  const second = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: f.reviewer,
    store: f.store,
  });
  assert.equal(second.reusable()?.plan, 'complete stable plan');
  fs.writeFileSync(path.join(f.root, 'approved-plan.md'), 'tampered plan\n');
  const third = new PlanCoordinator({
    runId: 'r',
    stage: f.stage,
    stageContext: 'specs',
    reviewer: f.reviewer,
    store: f.store,
  });
  assert.equal(third.reusable(), null);
});
