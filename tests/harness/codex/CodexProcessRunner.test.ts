/**
 * @fileoverview Unit tests for CodexProcessRunner in src/harness/codex/CodexProcessRunner.ts.
 * Validates subprocess lifecycle, event stream processing, token metrics, role violations, and error handling.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CodexProcessRunner } from '../../../src/harness/codex/CodexProcessRunner.js';
import type { PlanReviewVerdict } from '../../../src/types.js';
import { ProcessExecutionError } from '../../../src/errors.js';

function safeRm(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {}
}

function createMockCodexBinary(tmpDir: string): string {
  const scriptPath = path.join(tmpDir, 'mock-codex.mjs');
  const scriptContent = `#!/usr/bin/env node
import fs from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === 'exec' && args[1] === '--help') {
  console.log('Usage: codex exec [options] --disable <apps|plugins>');
  process.exit(0);
}

const outIdx = args.indexOf('--output-last-message');
const resultFile = outIdx >= 0 ? args[outIdx + 1] : null;

const mode = process.env.TEST_CODEX_MODE || 'success';

if (mode === 'fail') {
  console.error('Simulated reviewer process crash');
  process.exit(1);
}

if (mode === 'violation') {
  console.log(JSON.stringify({ item: { type: 'file_change' } }));
  if (resultFile) {
    fs.writeFileSync(resultFile, JSON.stringify({ verdict: 'APPROVE', summary: 'OK', missing_items: [] }));
  }
  process.exit(0);
}

console.log(JSON.stringify({
  item: { type: 'agent_message' },
  usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 50 }
}));
console.error('Test warning message on stderr');

if (resultFile) {
  fs.writeFileSync(resultFile, JSON.stringify({
    verdict: 'APPROVE',
    summary: 'Plan is approved',
    missing_items: []
  }));
}
process.exit(0);
`;
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
  return scriptPath;
}

test('CodexProcessRunner: executes successful plan review and records tokens and artifacts', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-runner-test-'));
  const runDir = path.join(tmpDir, 'run');
  fs.mkdirSync(runDir, { recursive: true });
  const runLog = path.join(runDir, 'run.log');
  const mockBinary = createMockCodexBinary(tmpDir);

  const emittedTokens: Array<{ kind: string; input: number; cached: number; output: number }> = [];
  const fakeEvents = {
    emit: (
      name: string,
      payload: { kind: string; input: number; cached: number; output: number }
    ) => {
      if (name === 'reviewer.tokens') {
        emittedTokens.push(payload);
      }
    }
  };

  try {
    process.env.TEST_CODEX_MODE = 'success';
    const execution = await CodexProcessRunner.run<PlanReviewVerdict>({
      binary: mockBinary,
      model: 'test-codex-model',
      reasoningEffort: 'medium',
      verbosity: 'low',
      timeoutMinutes: 2,
      contextMode: 'project_readonly',
      runDir,
      stageName: 'stage-01',
      decisionKind: 'plan-review',
      decisionSeq: 1,
      prompt: '# Plan Review Prompt',
      schemaFileName: 'plan-verdict.schema.json',
      events: fakeEvents,
      runLog
    });

    assert.equal(execution.result.verdict, 'APPROVE');
    assert.equal(execution.result.summary, 'Plan is approved');
    assert.ok(fs.existsSync(execution.eventsFilePath));
    assert.ok(fs.existsSync(path.join(execution.decisionDir, 'input.md')));
    assert.ok(fs.existsSync(path.join(execution.decisionDir, 'result.json')));

    assert.equal(emittedTokens.length, 1);
    assert.equal(emittedTokens[0].input, 100);
    assert.equal(emittedTokens[0].cached, 20);
    assert.equal(emittedTokens[0].output, 50);

    const runLogContent = fs.readFileSync(runLog, 'utf8');
    assert.ok(runLogContent.includes('[reviewer-stderr] Test warning message on stderr'));
  } finally {
    delete process.env.TEST_CODEX_MODE;
    safeRm(tmpDir);
  }
});

test('CodexProcessRunner: supports evidence_only mode with default stageName fallback', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-runner-evidence-'));
  const runDir = path.join(tmpDir, 'run');
  fs.mkdirSync(runDir, { recursive: true });
  const mockBinary = createMockCodexBinary(tmpDir);

  try {
    process.env.TEST_CODEX_MODE = 'success';
    const execution = await CodexProcessRunner.run<PlanReviewVerdict>({
      binary: mockBinary,
      model: 'test-codex-model',
      reasoningEffort: 'low',
      verbosity: 'low',
      timeoutMinutes: 2,
      timeoutSeconds: 45,
      contextMode: 'evidence_only',
      runDir,
      stageName: '',
      decisionKind: 'plan-review',
      decisionSeq: 2,
      prompt: '# Evidence Prompt',
      schemaFileName: 'plan-verdict.schema.json'
    });

    assert.equal(execution.result.verdict, 'APPROVE');
    assert.ok(execution.decisionDir.includes('_run'));
  } finally {
    delete process.env.TEST_CODEX_MODE;
    safeRm(tmpDir);
  }
});

test('CodexProcessRunner: detects role boundary violation and throws error', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-runner-violation-'));
  const runDir = path.join(tmpDir, 'run');
  fs.mkdirSync(runDir, { recursive: true });
  const mockBinary = createMockCodexBinary(tmpDir);

  try {
    process.env.TEST_CODEX_MODE = 'violation';
    await assert.rejects(async () => {
      await CodexProcessRunner.run<PlanReviewVerdict>({
        binary: mockBinary,
        model: 'test-codex-model',
        reasoningEffort: 'low',
        verbosity: 'low',
        timeoutMinutes: 2,
        contextMode: 'evidence_only',
        runDir,
        stageName: 'stage-01',
        decisionKind: 'plan-review',
        decisionSeq: 3,
        prompt: '# Prompt',
        schemaFileName: 'plan-verdict.schema.json'
      });
    }, /role boundary violation/);
  } finally {
    delete process.env.TEST_CODEX_MODE;
    safeRm(tmpDir);
  }
});

test('CodexProcessRunner: throws ProcessExecutionError on non-zero exit code', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-runner-fail-'));
  const runDir = path.join(tmpDir, 'run');
  fs.mkdirSync(runDir, { recursive: true });
  const mockBinary = createMockCodexBinary(tmpDir);

  try {
    process.env.TEST_CODEX_MODE = 'fail';
    await assert.rejects(
      async () => {
        await CodexProcessRunner.run<PlanReviewVerdict>({
          binary: mockBinary,
          model: 'test-codex-model',
          reasoningEffort: 'low',
          verbosity: 'low',
          timeoutMinutes: 2,
          contextMode: 'project_readonly',
          runDir,
          stageName: 'stage-01',
          decisionKind: 'plan-review',
          decisionSeq: 4,
          prompt: '# Prompt',
          schemaFileName: 'plan-verdict.schema.json'
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ProcessExecutionError);
        assert.equal(err.exitCode, 1);
        return true;
      }
    );
  } finally {
    delete process.env.TEST_CODEX_MODE;
    safeRm(tmpDir);
  }
});
