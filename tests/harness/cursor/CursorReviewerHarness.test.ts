/**
 * @fileoverview Unit tests for CursorReviewerHarness in src/harness/cursor/CursorReviewerHarness.ts.
 *
 * Validates initialization of harness metadata, option overrides from context,
 * preflight validation, JSON extraction from various CLI output formats,
 * and invocation of plan review, question answering, permission decisions, and final review with mocked process.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CursorReviewerHarness,
  extractJsonFromText
} from '../../../src/harness/cursor/CursorReviewerHarness.js';

test('CursorReviewerHarness: initializes harness metadata and handles overrides', () => {
  const harness = new CursorReviewerHarness({
    reviewerBinary: 'custom-agent',
    reviewerModel: 'gemini-3.8-flash',
    thinking: 'high',
    timeoutMinutes: 12,
    timeoutSeconds: 45
  } as any);

  assert.equal(harness.info.id, 'cursor');
  assert.equal(harness.info.role, 'reviewer');
  assert.equal(harness.info.model, 'gemini-3.8-flash');
  assert.ok(harness.info.label.includes('gemini-3.8-flash'));
});

test('CursorReviewerHarness: preflight fails cleanly when binary is missing', async () => {
  const harness = new CursorReviewerHarness({
    reviewerBinary: 'nonexistent-agent-binary-xyz',
    reviewerModel: 'test-model'
  });

  const preflight = await harness.preflight();
  assert.equal(preflight.ok, false);
  assert.ok(preflight.details.some((d) => d.includes('not found')));
});

test('CursorReviewerHarness.extractJsonFromText: parses direct JSON, code fences, and wrappers', () => {
  // Direct JSON
  const direct = extractJsonFromText<{ verdict: string }>('{"verdict": "APPROVE"}');
  assert.equal(direct.verdict, 'APPROVE');

  // Markdown fence
  const fenced = extractJsonFromText<{ verdict: string }>(
    '```json\n{"verdict": "REWORK", "summary": "Fix bugs"}\n```'
  );
  assert.equal(fenced.verdict, 'REWORK');

  // Text wrapper
  const wrapper = extractJsonFromText<{ verdict: string }>(
    JSON.stringify({ text: '{"verdict": "ALLOW", "reason": "Safe"}' })
  );
  assert.equal(wrapper.verdict, 'ALLOW');

  // Result wrapper
  const resultWrapper = extractJsonFromText<{ verdict: string }>(
    JSON.stringify({ result: '{"verdict": "ALLOW", "reason": "Safe"}' })
  );
  assert.equal(resultWrapper.verdict, 'ALLOW');

  // Prose with embedded JSON
  const prose = extractJsonFromText<{ verdict: string }>(
    'Review completed.\n{"verdict": "APPROVE", "summary": "Good"}\nEnd of review.'
  );
  assert.equal(prose.verdict, 'APPROVE');

  // Empty or invalid text throws
  assert.throws(() => extractJsonFromText(''), /empty/i);
  assert.throws(() => extractJsonFromText('no json here at all'), /valid JSON/i);

  const invalidWrapper = extractJsonFromText<Record<string, unknown>>(
    JSON.stringify({ text: 'still not json' })
  );
  assert.equal(typeof invalidWrapper.text, 'string');

  assert.throws(() => extractJsonFromText('```json\n{ broken json }\n```'), /valid JSON/i);
});

test('CursorReviewerHarness: preflight succeeds when binary is executable', async () => {
  const harness = new CursorReviewerHarness({ reviewerBinary: process.execPath });
  const preflight = await harness.preflight();
  assert.equal(preflight.ok, true);
  assert.ok(preflight.details.length > 0);
});

test('CursorReviewerHarness: executes decision flows through mocked runProcess', async () => {
  const harness = new CursorReviewerHarness({
    reviewerBinary: 'agent',
    reviewerModel: 'test-gemini',
    runDir: '/tmp/test-run',
    stageName: 'stage-01',
    stageContext: 'specs',
    skillsText: 'skills',
    events: null,
    runLog: '/tmp/test-run/run.log'
  });

  // Mock CursorReviewerHarness.runner
  const origRunner = CursorReviewerHarness.runner;
  try {
    let capturedArgs: string[] = [];
    CursorReviewerHarness.runner = (async (_bin: string, args: string[], opts: any) => {
      capturedArgs = args;
      opts?.onStdoutLine?.('stdout line');
      opts?.onStderrLine?.('stderr warning');
      return {
        code: 0,
        stdout: JSON.stringify({
          verdict: 'APPROVE',
          summary: 'Review passed successfully',
          missing_items: [],
          feedback_for_cursor: '',
          answers: [{ question_id: 'q1', selected_option_ids: ['opt-1'] }],
          findings: [],
          rework_instructions: '',
          requested_paths: [],
          required_follow_up_tests: []
        }),
        stderr: '',
        signal: null,
        timedOut: false
      };
    }) as any;

    // Plan review
    const planVerdict = await harness.reviewPlan(
      { plan: 'Test plan' },
      { finalConsolidation: true }
    );
    assert.equal(planVerdict.verdict, 'APPROVE');
    assert.ok(capturedArgs.includes('-p'));
    assert.ok(capturedArgs.includes('plan'));

    // Question
    CursorReviewerHarness.runner = (async () => ({
      code: 0,
      stdout: JSON.stringify({
        verdict: 'ANSWER',
        answers: [{ question_id: 'q1', selected_option_ids: ['opt-1'] }],
        rationale: 'Choice A is optimal'
      }),
      stderr: '',
      signal: null,
      timedOut: false
    })) as any;
    const questionVerdict = await harness.answerQuestions({
      questions: [{ id: 'q1', prompt: 'Choose?' }]
    });
    assert.equal(questionVerdict.verdict, 'ANSWER');

    // Permission
    CursorReviewerHarness.runner = (async () => ({
      code: 0,
      stdout: JSON.stringify({ verdict: 'ALLOW', reason: 'Safe command' }),
      stderr: '',
      signal: null,
      timedOut: false
    })) as any;
    const permVerdict = await harness.decidePermission({ command: 'git status' });
    assert.equal(permVerdict.verdict, 'ALLOW');

    // Final implementation review
    CursorReviewerHarness.runner = (async () => ({
      code: 0,
      stdout: JSON.stringify({
        verdict: 'APPROVE',
        summary: 'Final review approved',
        findings: [],
        rework_instructions: '',
        requested_paths: [],
        required_follow_up_tests: []
      }),
      stderr: '',
      signal: null,
      timedOut: false
    })) as any;
    const finalVerdict = await harness.reviewImplementation({ diff: 'test diff' });
    assert.equal(finalVerdict.verdict, 'APPROVE');
  } finally {
    CursorReviewerHarness.runner = origRunner;
  }
});

test('CursorReviewerHarness: throws ProcessExecutionError on non-zero exit', async () => {
  const harness = new CursorReviewerHarness({
    reviewerBinary: 'agent',
    reviewerModel: 'test-gemini',
    runDir: '/tmp/test-run',
    stageName: 'stage-01'
  });

  const origRunner = CursorReviewerHarness.runner;
  try {
    CursorReviewerHarness.runner = (async () => ({
      code: 1,
      stdout: '',
      stderr: 'Agent crashed due to rate limit 429',
      signal: null,
      timedOut: false
    })) as any;

    await assert.rejects(
      () => harness.reviewPlan({ plan: 'Test plan' }),
      (err: any) => {
        assert.equal(err.exitCode, 1);
        assert.match(err.stderr, /429/);
        return true;
      }
    );
  } finally {
    CursorReviewerHarness.runner = origRunner;
  }
});
