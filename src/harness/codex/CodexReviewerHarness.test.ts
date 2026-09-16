/**
 * @fileoverview Unit tests for CodexReviewerHarness in src/harness/codex/CodexReviewerHarness.ts.
 *
 * Validates initialization of harness metadata, option overrides from context,
 * preflight validation when the Codex binary is missing or unavailable,
 * and invocation of plan review, question answering, permission decisions, and final review.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexReviewerHarness } from './CodexReviewerHarness.js';
import { CodexProcessRunner } from './CodexProcessRunner.js';

test('CodexReviewerHarness: initializes harness metadata and handles overrides', () => {
  const harness = new CodexReviewerHarness({
    reviewerBinary: 'custom-codex',
    reviewerModel: 'custom-reviewer-model',
  });

  assert.equal(harness.info.id, 'codex');
  assert.equal(harness.info.role, 'reviewer');
  assert.equal(harness.info.model, 'custom-reviewer-model');
  assert.ok(harness.info.label.includes('custom-reviewer-model'));
});

test('CodexReviewerHarness: preflight fails cleanly when binary is missing', async () => {
  const harness = new CodexReviewerHarness({
    reviewerBinary: 'nonexistent-codex-binary-xyz',
    reviewerModel: 'test-model',
  });

  const preflight = await harness.preflight();
  assert.equal(preflight.ok, false);
  assert.ok(preflight.details.some((d) => d.includes('not found')));
});

test('CodexReviewerHarness: executes decision flows through runner delegation', async () => {
  const harness = new CodexReviewerHarness({
    reviewerBinary: 'codex',
    reviewerModel: 'test-model',
    runDir: '/tmp/test-run',
    stageName: 'stage-01',
    stageContext: 'specs',
    skillsText: 'skills',
    events: null,
    runLog: '/tmp/test-run/run.log',
  });

  const origRun = CodexProcessRunner.run;
  try {
    let capturedKind = '';
    CodexProcessRunner.run = (async (opts: any) => {
      capturedKind = opts.decisionKind;
      if (opts.decisionKind === 'plan-review') {
        return {
          result: { verdict: 'APPROVE', summary: 'Plan OK' },
          eventsFile: '',
          inputFile: '',
          resultFile: '',
        };
      }
      if (opts.decisionKind === 'question') {
        return {
          result: { verdict: 'ANSWER', answers: [], rationale: 'Answered' },
          eventsFile: '',
          inputFile: '',
          resultFile: '',
        };
      }
      if (opts.decisionKind === 'permission') {
        return {
          result: { verdict: 'ALLOW', reason: 'Safe' },
          eventsFile: '',
          inputFile: '',
          resultFile: '',
        };
      }
      return {
        result: { verdict: 'APPROVE', summary: 'Final OK' },
        eventsFile: '',
        inputFile: '',
        resultFile: '',
      };
    }) as any;

    const planVerdict = await harness.reviewPlan({ plan: 'test' });
    assert.equal(capturedKind, 'plan-review');
    assert.equal(planVerdict.verdict, 'APPROVE');

    // Final consolidation variant
    await harness.reviewPlan({ plan: 'test' }, { finalConsolidation: true });
    assert.equal(capturedKind, 'plan-review');

    const questionVerdict = await harness.answerQuestions({ questions: [] });
    assert.equal(capturedKind, 'question');
    assert.equal(questionVerdict.verdict, 'ANSWER');

    const permVerdict = await harness.decidePermission({ command: 'ls' });
    assert.equal(capturedKind, 'permission');
    assert.equal(permVerdict.verdict, 'ALLOW');

    const finalVerdict = await harness.reviewImplementation({ diff: '' });
    assert.equal(capturedKind, 'final-review');
    assert.equal(finalVerdict.verdict, 'APPROVE');
  } finally {
    CodexProcessRunner.run = origRun;
  }
});
