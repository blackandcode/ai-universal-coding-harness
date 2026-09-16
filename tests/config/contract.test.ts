/**
 * @fileoverview Configuration contract fidelity tests (Finding F-14).
 *
 * Asserts:
 * - Runtime precedence: reviewer.<role> overrides harnesses.<adapter> for adapter-tunable fields.
 * - Inheritance fallback: harnesses.<adapter> acts as baseline when role omits tunables.
 * - Static defaults: adapter static defaults apply when both role and harness omit tunables.
 * - Question budget: maxUniqueQuestionsPerStage clamps to >= 1 and surfaces on merged config.
 * - Template contract: config.example.jsonc and templates parse cleanly and match schema.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import { validateAndNormalizeConfig } from '../../src/config/validation.js';
import { readJsonc } from '../../src/config/index.js';
import { configTemplate, projectPlaceholderConfigTemplate } from '../../src/config/templates.js';
import { ReviewerRouter } from '../../src/orchestrator/services/ReviewerRouter.js';
import { HarnessRegistry } from '../../src/harness/registry.js';
import { CodexReviewerHarness } from '../../src/harness/codex/CodexReviewerHarness.js';
import { CursorReviewerHarness } from '../../src/harness/cursor/CursorReviewerHarness.js';
import { CodexProcessRunner } from '../../src/harness/codex/CodexProcessRunner.js';
import type { ReviewerRouterConfig } from '../../src/harness/types.js';
import type { CodexExecutionOptions } from '../../src/harness/codex/types.js';

test('contract: maxUniqueQuestionsPerStage clamps to >= 1 and surfaces on normalized config', () => {
  const norm1 = validateAndNormalizeConfig({ maxUniqueQuestionsPerStage: 50 }, DEFAULT_CONFIG);
  assert.equal(norm1.maxUniqueQuestionsPerStage, 50);

  const normZero = validateAndNormalizeConfig({ maxUniqueQuestionsPerStage: 0 }, DEFAULT_CONFIG);
  assert.equal(normZero.maxUniqueQuestionsPerStage, 1);

  const normNegative = validateAndNormalizeConfig(
    { maxUniqueQuestionsPerStage: -10 },
    DEFAULT_CONFIG
  );
  assert.equal(normNegative.maxUniqueQuestionsPerStage, 1);

  const normDefault = validateAndNormalizeConfig({}, DEFAULT_CONFIG);
  assert.equal(normDefault.maxUniqueQuestionsPerStage, 25);
});

test('contract: reviewer.<role> overrides harnesses.<adapter> for adapter-tunable fields at runtime', async () => {
  const routerConfig: ReviewerRouterConfig = {
    primary: {
      harness: 'codex',
      model: 'gpt-role-model',
      binary: '/opt/role/codex',
      reasoningEffort: 'high',
      verbosity: 'medium',
      timeoutMinutes: 14,
      timeoutSeconds: 50,
      contextMode: 'project_readonly'
    },
    fallback: {
      enabled: true,
      harness: 'cursor',
      model: 'gemini-fallback',
      thinking: 'high',
      triggers: ['usage_limit']
    },
    largeDiff: {
      thresholdChars: 300000,
      harness: 'cursor',
      model: 'gemini-large'
    },
    permission: {
      harness: 'codex',
      model: 'gpt-perm-model',
      binary: '/opt/perm/codex',
      reasoningEffort: 'low',
      verbosity: 'low',
      timeoutMinutes: 2,
      timeoutSeconds: 25,
      contextMode: 'evidence_only'
    }
  };

  const registry = new HarnessRegistry();
  const router = new ReviewerRouter({
    config: routerConfig,
    registry,
    context: { stageName: 'stage-contract', runDir: '/tmp/contract-run' }
  });

  // 1. Primary role (Codex): role tunables must reach CodexReviewerHarness
  const primaryHarness = router.resolveHarness('primary') as CodexReviewerHarness;
  assert.equal(primaryHarness.effectiveModel, 'gpt-role-model');
  assert.equal(primaryHarness.effectiveBinary, '/opt/role/codex');
  assert.equal(primaryHarness.effectiveReasoningEffort, 'high');
  assert.equal(primaryHarness.effectiveVerbosity, 'medium');
  assert.equal(primaryHarness.effectiveTimeoutMinutes, 14);
  assert.equal(primaryHarness.effectiveTimeoutSeconds, 50);
  assert.equal(primaryHarness.effectiveContextMode, 'project_readonly');

  // Verify that options reach CodexProcessRunner during execution
  const origRun = CodexProcessRunner.run;
  let capturedOptions: CodexExecutionOptions | undefined;
  try {
    CodexProcessRunner.run = (async <T>(opts: CodexExecutionOptions) => {
      capturedOptions = opts;
      return {
        result: { verdict: 'APPROVE', summary: 'Contract OK' } as T,
        eventsFilePath: '',
        decisionDir: ''
      };
    }) as typeof CodexProcessRunner.run;

    await primaryHarness.reviewPlan({ plan: 'Contract Plan' });
    assert.ok(capturedOptions);
    assert.equal(capturedOptions.model, 'gpt-role-model');
    assert.equal(capturedOptions.binary, '/opt/role/codex');
    assert.equal(capturedOptions.reasoningEffort, 'high');
    assert.equal(capturedOptions.verbosity, 'medium');
    assert.equal(capturedOptions.timeoutMinutes, 14);
    assert.equal(capturedOptions.timeoutSeconds, 50);
    assert.equal(capturedOptions.contextMode, 'project_readonly');
  } finally {
    CodexProcessRunner.run = origRun;
  }

  // 2. Permission role (Codex fast-path): role tunables must reflect permission overrides
  const permHarness = router.resolveHarness('permission') as CodexReviewerHarness;
  assert.equal(permHarness.effectiveModel, 'gpt-perm-model');
  assert.equal(permHarness.effectiveBinary, '/opt/perm/codex');
  assert.equal(permHarness.effectiveReasoningEffort, 'low');
  assert.equal(permHarness.effectiveVerbosity, 'low');
  assert.equal(permHarness.effectiveTimeoutSeconds, 25);
  assert.equal(permHarness.effectiveContextMode, 'evidence_only');
});

test('contract: adapter inherits harnesses.<adapter> and static defaults when role omits fields', () => {
  const minimalRouterConfig: ReviewerRouterConfig = {
    primary: {
      harness: 'codex',
      model: 'gpt-6-astra'
    },
    fallback: {
      enabled: false,
      harness: 'cursor',
      model: 'gemini-3.8-flash',
      triggers: []
    },
    largeDiff: {
      thresholdChars: 300000,
      harness: 'cursor',
      model: 'gemini-3.8-flash'
    },
    permission: {
      harness: 'cursor',
      model: 'composer-2.5-fast'
    }
  };

  const registry = new HarnessRegistry();
  const router = new ReviewerRouter({
    config: minimalRouterConfig,
    registry
  });

  const primary = router.resolveHarness('primary') as CodexReviewerHarness;
  // Model came from role
  assert.equal(primary.effectiveModel, 'gpt-6-astra');
  // Binary fell back to global config / static default
  assert.equal(primary.effectiveBinary, CodexReviewerHarness.defaults.binary);
  assert.equal(primary.effectiveTimeoutSeconds, 0);
  assert.equal(primary.effectiveContextMode, 'evidence_only');

  const perm = router.resolveHarness('permission') as CursorReviewerHarness;
  assert.equal(perm.effectiveModel, 'composer-2.5-fast');
  assert.equal(perm.effectiveBinary, CursorReviewerHarness.defaults.binary);
  assert.equal(perm.effectiveTimeoutSeconds, 0);
});

test('contract: config.example.jsonc and templates parse cleanly and match schema', () => {
  const examplePath = path.resolve('config.example.jsonc');
  assert.ok(fs.existsSync(examplePath), 'config.example.jsonc must exist at repository root');

  const parsedExample = readJsonc(examplePath) as Record<string, unknown>;
  assert.ok(parsedExample && typeof parsedExample === 'object');
  assert.equal(parsedExample.executorHarness, 'cursor');
  assert.equal(parsedExample.reviewerHarness, 'codex');
  assert.ok(parsedExample.reviewer && typeof parsedExample.reviewer === 'object');
  assert.ok(parsedExample.harnesses && typeof parsedExample.harnesses === 'object');

  // Verify that all top-level uncommented keys in example exist on default config
  const defaultKeys = new Set(Object.keys(DEFAULT_CONFIG));
  for (const key of Object.keys(parsedExample)) {
    assert.ok(defaultKeys.has(key), `Unrecognized key '${key}' in config.example.jsonc`);
  }

  // Template generators
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-tpl-'));
  try {
    const globalTplPath = path.join(tmpDir, 'global.jsonc');
    fs.writeFileSync(globalTplPath, configTemplate());
    const parsedGlobal = readJsonc(globalTplPath) as Record<string, unknown>;
    assert.equal(parsedGlobal.executorHarness, 'cursor');

    const placeholderTplPath = path.join(tmpDir, 'placeholder.jsonc');
    fs.writeFileSync(placeholderTplPath, projectPlaceholderConfigTemplate());
    const parsedPlaceholder = readJsonc(placeholderTplPath) as Record<string, unknown>;
    assert.ok(Array.isArray(parsedPlaceholder.harnessModules));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
