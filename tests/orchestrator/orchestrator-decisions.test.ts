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

test('Orchestrator questionDecision caps unique questions and falls back autonomously when budget is exhausted', async () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-q-budget-'));
  const eventFile = path.join(repoDir, 'events.jsonl');
  const events = new EventBus(eventFile, true);
  const orchestrator = new Orchestrator(events, { workspace: repoDir });
  const questionDecision = (
    orchestrator as unknown as {
      questionDecision: (
        reviewer: { answerQuestions: (input?: unknown) => Promise<unknown> },
        payload: unknown,
        cache: Map<string, unknown>,
        stageName: string,
        state: RunState,
        distinctQuestions?: Set<string>
      ) => Promise<{
        answers: Array<{ questionId: string; selectedOptionIds: string[] }>;
        rationale: string;
      }>;
    }
  ).questionDecision.bind(orchestrator);

  const budgetEvents: unknown[] = [];
  events.emitter.on('event', (e) => {
    if (e.type === 'executor.question.budget') {
      budgetEvents.push(e.payload);
    }
  });

  let reviewerCalls = 0;
  const reviewer = {
    answerQuestions: async (input?: unknown) => {
      reviewerCalls++;
      const qInput = input as { questions?: Array<{ id: string }> } | undefined;
      return {
        verdict: 'ANSWER',
        answers: (qInput?.questions || []).map((q) => ({
          question_id: q.id,
          selected_option_ids: ['opt2']
        })),
        rationale: 'chose option 2'
      };
    }
  };

  const cache = new Map<string, unknown>();
  const distinctQuestions = new Set<string>();
  const state = { run_id: 'run-q-budget-1' } as RunState;

  // Temporarily set budget to 2
  const originalLimit = CONFIG.maxUniqueQuestionsPerStage;
  try {
    (CONFIG as { maxUniqueQuestionsPerStage: number }).maxUniqueQuestionsPerStage = 2;

    // Question 1: Distinct question 1 (under cap: 0 < 2)
    const q1Payload = {
      title: 'Question 1',
      questions: [
        {
          id: 'q1',
          prompt: 'Choose 1?',
          options: [
            { id: 'opt1', label: 'One' },
            { id: 'opt2', label: 'Two' }
          ]
        }
      ]
    };
    const res1 = await questionDecision(
      reviewer,
      q1Payload,
      cache,
      'stage-01',
      state,
      distinctQuestions
    );
    assert.equal(reviewerCalls, 1);
    assert.deepEqual(res1.answers[0].selectedOptionIds, ['opt2']);
    assert.equal(distinctQuestions.size, 1);

    // Repeated Question 1: Should hit cache, not increment calls or distinct count
    const res1Repeat = await questionDecision(
      reviewer,
      q1Payload,
      cache,
      'stage-01',
      state,
      distinctQuestions
    );
    assert.equal(reviewerCalls, 1);
    assert.deepEqual(res1Repeat.answers[0].selectedOptionIds, ['opt2']);
    assert.equal(distinctQuestions.size, 1);

    // Question 2: Distinct question 2 (under cap: 1 < 2)
    const q2Payload = {
      title: 'Question 2',
      questions: [
        {
          id: 'q2',
          prompt: 'Choose 2?',
          options: [
            { id: 'opt1', label: 'One' },
            { id: 'opt2', label: 'Two' }
          ]
        }
      ]
    };
    const res2 = await questionDecision(
      reviewer,
      q2Payload,
      cache,
      'stage-01',
      state,
      distinctQuestions
    );
    assert.equal(reviewerCalls, 2);
    assert.deepEqual(res2.answers[0].selectedOptionIds, ['opt2']);
    assert.equal(distinctQuestions.size, 2);

    // Question 3: Distinct question 3 (at cap: 2 >= 2) -> autonomous fallback!
    const q3Payload = {
      title: 'Question 3',
      questions: [
        {
          id: 'q3',
          prompt: 'Choose 3?',
          options: [
            { id: 'optA', label: 'Option A' },
            { id: 'optB', label: 'Option B' }
          ]
        }
      ]
    };
    const res3 = await questionDecision(
      reviewer,
      q3Payload,
      cache,
      'stage-01',
      state,
      distinctQuestions
    );
    // Reviewer should NOT have been called!
    assert.equal(reviewerCalls, 2);
    // First option should be selected
    assert.deepEqual(res3.answers[0].selectedOptionIds, ['optA']);
    assert.match(res3.rationale, /budget reached/i);

    // Event should have been emitted
    assert.equal(budgetEvents.length, 1);
    assert.deepEqual(budgetEvents[0], {
      stage: 'stage-01',
      count: 3,
      limit: 2,
      title: 'Question 3'
    });

    // Repeating Question 3: Should hit cache with fallback answers
    const res3Repeat = await questionDecision(
      reviewer,
      q3Payload,
      cache,
      'stage-01',
      state,
      distinctQuestions
    );
    assert.equal(reviewerCalls, 2);
    assert.deepEqual(res3Repeat.answers[0].selectedOptionIds, ['optA']);

    // Question 4: Distinct question at cap with empty options
    const q4Payload = {
      title: 'Question 4',
      questions: [
        {
          id: 'q4',
          prompt: 'Choose 4 without options?'
        }
      ]
    };
    const res4 = await questionDecision(
      reviewer,
      q4Payload,
      cache,
      'stage-01',
      state,
      distinctQuestions
    );
    assert.deepEqual(res4.answers[0].selectedOptionIds, []);
  } finally {
    (CONFIG as { maxUniqueQuestionsPerStage: number }).maxUniqueQuestionsPerStage = originalLimit;
    events.close();
    fs.rmSync(repoDir, { recursive: true, force: true });
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
