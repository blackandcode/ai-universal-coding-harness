/**
 * @fileoverview Unit tests for CodexReviewerHarness in src/harness/codex/CodexReviewerHarness.ts.
 *
 * Validates initialization of harness metadata, option overrides from context,
 * preflight validation when the Codex binary is missing or unavailable,
 * and invocation of plan review, question answering, permission decisions, and final review.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CodexReviewerHarness } from '../../../src/harness/codex/CodexReviewerHarness.js';
import { CodexProcessRunner } from '../../../src/harness/codex/CodexProcessRunner.js';
import type { CodexExecutionOptions } from '../../../src/harness/codex/types.js';

function createMockCodexPreflightBinary(
  tmpDir: string,
  mode: 'ok' | 'bad-help' | 'missing-schema'
): string {
  const scriptPath = path.join(tmpDir, `mock-codex-preflight-${mode}.mjs`);
  const helpBody =
    mode === 'missing-schema'
      ? 'Usage: codex exec without schema flags'
      : mode === 'bad-help'
        ? ''
        : 'Usage: codex exec --output-schema --output-last-message';
  const helpExit = mode === 'bad-help' ? 1 : 0;
  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('mock-codex 1.0');
  process.exit(0);
}
if (args[0] === 'exec' && args[1] === '--help') {
  if (${helpExit} !== 0) process.exit(1);
  console.log(${JSON.stringify(helpBody)});
  process.exit(0);
}
process.exit(0);
`,
    { mode: 0o755 }
  );
  return scriptPath;
}

test('CodexReviewerHarness: initializes harness metadata and handles overrides', () => {
  const harness = new CodexReviewerHarness({
    reviewerBinary: 'custom-codex',
    reviewerModel: 'custom-reviewer-model'
  });

  assert.equal(harness.info.id, 'codex');
  assert.equal(harness.info.role, 'reviewer');
  assert.equal(harness.info.model, 'custom-reviewer-model');
  assert.ok(harness.info.label.includes('custom-reviewer-model'));
});

test('CodexReviewerHarness: preflight validates exec help output and schema flags', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-preflight-'));
  try {
    const okBinary = createMockCodexPreflightBinary(tmpDir, 'ok');
    const okHarness = new CodexReviewerHarness({ reviewerBinary: okBinary });
    const ok = await okHarness.preflight();
    assert.equal(ok.ok, true);

    const badHelpHarness = new CodexReviewerHarness({
      reviewerBinary: createMockCodexPreflightBinary(tmpDir, 'bad-help')
    });
    const badHelp = await badHelpHarness.preflight();
    assert.equal(badHelp.ok, false);
    assert.ok(badHelp.details.some((d) => /unavailable/i.test(d)));

    const missingSchemaHarness = new CodexReviewerHarness({
      reviewerBinary: createMockCodexPreflightBinary(tmpDir, 'missing-schema')
    });
    const missingSchema = await missingSchemaHarness.preflight();
    assert.equal(missingSchema.ok, false);
    assert.ok(missingSchema.details.some((d) => d.includes('output-schema')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CodexReviewerHarness: preflight fails cleanly when binary is missing', async () => {
  const harness = new CodexReviewerHarness({
    reviewerBinary: 'nonexistent-codex-binary-xyz',
    reviewerModel: 'test-model'
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
    runLog: '/tmp/test-run/run.log'
  });

  const origRun = CodexProcessRunner.run;
  try {
    let capturedKind = '';
    CodexProcessRunner.run = (async <T>(opts: CodexExecutionOptions) => {
      capturedKind = opts.decisionKind;
      let res: unknown;
      if (opts.decisionKind === 'plan-review') {
        res = { verdict: 'APPROVE', summary: 'Plan OK' };
      } else if (opts.decisionKind === 'question') {
        res = { verdict: 'ANSWER', answers: [], rationale: 'Answered' };
      } else if (opts.decisionKind === 'permission') {
        res = { verdict: 'ALLOW', reason: 'Safe' };
      } else {
        res = { verdict: 'APPROVE', summary: 'Final OK' };
      }
      return {
        result: res as T,
        eventsFilePath: '',
        decisionDir: ''
      };
    }) as typeof CodexProcessRunner.run;

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
