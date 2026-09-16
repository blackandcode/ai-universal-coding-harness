/**
 * @fileoverview Unit tests for Orchestrator autonomous question/permission decision helpers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Orchestrator } from '../../src/orchestrator/Orchestrator.js';
import { EventBus } from '../../src/ui/EventBus.js';
import { PermissionEngine } from '../../src/permissions/PermissionEngine.js';
import { CONFIG } from '../../src/core/config.js';
import type { RunState } from '../../src/types.js';

test('Orchestrator questionDecision caches ANSWER verdicts and falls back to first option', async () => {
  const eventFile = path.join(os.tmpdir(), `orch-q-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const orchestrator = new Orchestrator(events, { workspace: process.cwd() });
  const questionDecision = (
    orchestrator as unknown as {
      questionDecision: (
        reviewer: { answerQuestions: () => Promise<unknown> },
        payload: unknown,
        cache: Map<string, unknown>,
        stageName: string,
        state: RunState
      ) => Promise<{ answers: Array<{ selectedOptionIds: string[] }> }>;
    }
  ).questionDecision.bind(orchestrator);

  let calls = 0;
  const reviewer = {
    answerQuestions: async () => {
      calls++;
      return {
        verdict: 'ANSWER',
        answers: [{ question_id: 'q1', selected_option_ids: ['missing-id'] }],
        rationale: 'pick one'
      };
    }
  };

  const payload = {
    title: 'Decision',
    questions: [{ id: 'q1', prompt: 'Choose?', options: [{ id: 'opt1', label: 'One' }] }]
  };
  const state = { run_id: 'run-q-1' } as RunState;
  const cache = new Map<string, unknown>();

  try {
    const first = await questionDecision(reviewer, payload, cache, 'stage-01', state);
    assert.deepEqual(first.answers[0].selectedOptionIds, ['opt1']);
    const second = await questionDecision(reviewer, payload, cache, 'stage-01', state);
    assert.deepEqual(second.answers[0].selectedOptionIds, ['opt1']);
    assert.equal(calls, 1);

    // Test question with empty questions and title omitted
    const emptyPayload = {};
    const emptyRes = await questionDecision(reviewer, emptyPayload, cache, 'stage-01', state);
    assert.deepEqual(emptyRes.answers, []);

    // Test question with reviewer returning verdict !== ANSWER
    const reviewerOther = {
      answerQuestions: async () => ({ verdict: 'DEFER', rationale: 'deferred' })
    };
    const deferRes = await questionDecision(
      reviewerOther,
      { questions: [{ id: 'q2', prompt: 'Choose 2?', options: [] }] },
      cache,
      'stage-01',
      state
    );
    assert.deepEqual(deferRes.answers, [{ questionId: 'q2', selectedOptionIds: [] }]);
  } finally {
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator permissionDecision uses reviewer when deterministic policy is inconclusive', async () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-perm-'));
  const eventFile = path.join(repoDir, 'events.jsonl');
  const events = new EventBus(eventFile, true);
  const orchestrator = new Orchestrator(events, { workspace: repoDir });
  const permissionDecision = (
    orchestrator as unknown as {
      permissionDecision: (
        engine: PermissionEngine,
        reviewer: { decidePermission: () => Promise<unknown> },
        req: { command: string; raw: unknown },
        stageName: string,
        state: RunState
      ) => Promise<{ allow: boolean; reason: string }>;
    }
  ).permissionDecision.bind(orchestrator);

  const engine = new PermissionEngine(repoDir, 'auto_safe', CONFIG.permissionsFile);
  const reviewer = {
    decidePermission: async () => ({ verdict: 'ALLOW', reason: 'Reviewer allowed custom tool' })
  };
  const state = { run_id: 'run-perm-1' } as RunState;

  try {
    const decision = await permissionDecision(
      engine,
      reviewer,
      { command: 'my-tool --custom', raw: { command: 'my-tool --custom' } },
      'stage-01',
      state
    );
    assert.equal(decision.allow, true);
    assert.match(decision.reason, /Reviewer|allowed/i);

    // Call again to hit the cached decision branch
    const cachedDecision = await permissionDecision(
      engine,
      reviewer,
      { command: 'my-tool --custom', raw: { command: 'my-tool --custom' } },
      'stage-01',
      state
    );
    assert.equal(cachedDecision.allow, true);

    // Test permission with inconclusive command and empty reason from reviewer
    const reviewerNoReason = {
      decidePermission: async () => ({ verdict: 'DENY' })
    };
    const deniedDecision = await permissionDecision(
      engine,
      reviewerNoReason,
      { command: 'my-inconclusive-command', raw: {} },
      'stage-01',
      state
    );
    assert.equal(deniedDecision.allow, false);
  } finally {
    events.close();
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});
