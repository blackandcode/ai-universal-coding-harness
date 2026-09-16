/**
 * @fileoverview Focused unit tests for Orchestrator internals that are hard to reach via full integration runs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Orchestrator } from '../../src/orchestrator/Orchestrator.js';
import { EventBus } from '../../src/ui/EventBus.js';
import { CONFIG } from '../../src/core/config.js';
import { HarnessRegistry } from '../../src/harness/registry.js';

test('Orchestrator classifyError maps failures to persisted run statuses', () => {
  const eventFile = path.join(os.tmpdir(), `orch-classify-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const orchestrator = new Orchestrator(events, { workspace: process.cwd() });
  const classifyError = (
    orchestrator as unknown as { classifyError: (e: unknown) => string }
  ).classifyError.bind(orchestrator);

  try {
    assert.equal(classifyError(new Error('HTTP 429 rate limit exceeded')), 'external_dependency');
    assert.equal(
      classifyError(new Error('authentication credentials invalid')),
      'external_dependency'
    );
    assert.equal(classifyError(new Error('Command timeout after 60s')), 'retryable_error');
    assert.equal(
      classifyError(new Error('Specification contradicts frozen requirements')),
      'specification_blocked'
    );
    assert.equal(classifyError(new Error('Stage failed for other reasons')), 'failed');
  } finally {
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator createReviewerHarness routes custom reviewer ids through ReviewerRouter', () => {
  const eventFile = path.join(os.tmpdir(), `orch-unit-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const registry = new HarnessRegistry();
  registry.registerReviewer('custom-reviewer', () => ({
    info: { id: 'custom-reviewer', label: 'Custom', role: 'reviewer', model: 'x' },
    preflight: async () => ({ ok: true, details: [] }),
    reviewPlan: async () => ({ verdict: 'APPROVE', summary: '', missing_items: [] }),
    answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
    decidePermission: async () => ({ verdict: 'ALLOW' }),
    reviewImplementation: async () => ({ verdict: 'APPROVE', summary: '' })
  }));

  const orchestrator = new Orchestrator(events, { workspace: process.cwd(), registry });
  const createReviewerHarness = (
    orchestrator as unknown as {
      createReviewerHarness: (id: string, ctx: Record<string, unknown>) => { info: { id: string } };
    }
  ).createReviewerHarness.bind(orchestrator);

  const origReviewer = CONFIG.reviewer;
  try {
    assert.ok(CONFIG.reviewer);
    const harness = createReviewerHarness('custom-reviewer', {
      runDir: os.tmpdir(),
      stageName: 'stage-01',
      stageContext: '',
      skillsText: '',
      runLog: path.join(os.tmpdir(), 'run.log')
    });
    assert.equal(harness.info.id, 'reviewer-router');
    const router = harness as unknown as { config: { primary: { harness: string } } };
    assert.equal(router.config.primary.harness, 'custom-reviewer');
  } finally {
    CONFIG.reviewer = origReviewer;
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator createReviewerHarness keeps router fallback for built-in reviewer ids', () => {
  const eventFile = path.join(os.tmpdir(), `orch-unit-builtin-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const registry = new HarnessRegistry();
  const orchestrator = new Orchestrator(events, { workspace: process.cwd(), registry });
  const createReviewerHarness = (
    orchestrator as unknown as {
      createReviewerHarness: (
        id: string,
        ctx: Record<string, unknown>
      ) => {
        info: { id: string };
        config: { fallback: { harness: string }; largeDiff: { harness: string } };
      };
    }
  ).createReviewerHarness.bind(orchestrator);

  const origReviewer = CONFIG.reviewer;
  try {
    assert.ok(CONFIG.reviewer);
    const harness = createReviewerHarness('codex', {
      runDir: os.tmpdir(),
      stageName: 'stage-01',
      stageContext: '',
      skillsText: '',
      runLog: path.join(os.tmpdir(), 'run-builtin.log')
    });
    assert.equal(harness.info.id, 'reviewer-router');
    assert.equal(harness.config.fallback.harness, CONFIG.reviewer.fallback.harness);
    assert.equal(harness.config.largeDiff.harness, CONFIG.reviewer.largeDiff.harness);
  } finally {
    CONFIG.reviewer = origReviewer;
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});

test('Orchestrator createReviewerHarness uses registry when CONFIG.reviewer is unset', () => {
  const eventFile = path.join(os.tmpdir(), `orch-unit-registry-${Date.now()}.jsonl`);
  const events = new EventBus(eventFile, true);
  const registry = new HarnessRegistry();
  registry.registerReviewer('plain-reviewer', () => ({
    info: { id: 'plain-reviewer', label: 'Plain', role: 'reviewer', model: 'x' },
    preflight: async () => ({ ok: true, details: [] }),
    reviewPlan: async () => ({ verdict: 'APPROVE', summary: '', missing_items: [] }),
    answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
    decidePermission: async () => ({ verdict: 'ALLOW' }),
    reviewImplementation: async () => ({ verdict: 'APPROVE', summary: '' })
  }));

  const orchestrator = new Orchestrator(events, { workspace: process.cwd(), registry });
  const createReviewerHarness = (
    orchestrator as unknown as {
      createReviewerHarness: (id: string, ctx: Record<string, unknown>) => { info: { id: string } };
    }
  ).createReviewerHarness.bind(orchestrator);

  const origReviewer = CONFIG.reviewer;
  try {
    (CONFIG as { reviewer?: typeof CONFIG.reviewer }).reviewer = undefined;
    const harness = createReviewerHarness('plain-reviewer', {
      runDir: os.tmpdir(),
      stageName: 'stage-01',
      stageContext: '',
      skillsText: '',
      runLog: path.join(os.tmpdir(), 'run-plain.log')
    });
    assert.equal(harness.info.id, 'plain-reviewer');
  } finally {
    CONFIG.reviewer = origReviewer;
    events.close();
    fs.rmSync(eventFile, { force: true });
  }
});
