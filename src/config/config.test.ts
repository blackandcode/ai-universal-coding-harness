/**
 * @fileoverview Unit tests for modular configuration system.
 * Validates default configuration, environment mapping, normalization, JSONC parsing, and backwards compatibility.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  DEFAULT_CONFIG,
  CONFIG,
  CONFIG_SOURCES,
  globalConfigPath,
  projectTrackedConfigPath,
  envLayer,
  validateAndNormalizeConfig,
  deepMerge,
  readJsonc,
  harnessString,
  harnessNumber,
  loadEffectiveConfig,
} from './index.js';
import {
  configTemplate,
  projectPlaceholderConfigTemplate,
  projectPermissionsTemplate,
} from './templates.js';
import { ConfigError } from '../errors.js';

test('configuration defaults are harness-neutral and safe', () => {
  assert.equal(DEFAULT_CONFIG.executorHarness, 'cursor');
  assert.equal(DEFAULT_CONFIG.reviewerHarness, 'codex');
  assert.equal(DEFAULT_CONFIG.permissionMode, 'auto_safe');
  assert.equal(DEFAULT_CONFIG.harnesses.cursor?.model, 'gemini-3.8-flash');
  assert.equal(DEFAULT_CONFIG.harnesses.codex?.model, 'gpt-6-astra');
});

test('config paths include global and project layers', () => {
  assert.ok(path.isAbsolute(globalConfigPath()));
  assert.ok(projectTrackedConfigPath().endsWith('.ai-universal-coding-harness.jsonc'));
  assert.equal(CONFIG_SOURCES.project, projectTrackedConfigPath());
});

test('environment mapping layer maps AI_HARNESS_* and AI_STAGE_*', () => {
  const env1 = envLayer({
    AI_HARNESS_EXECUTOR_HARNESS: 'custom-exec',
    AI_HARNESS_MAX_PLAN_REVIEWS: '5',
    AI_HARNESS_PERMISSION_MODE: 'allowlist',
  });
  assert.equal(env1.executorHarness, 'custom-exec');
  assert.equal(env1.maxPlanReviews, 5);
  assert.equal(env1.permissionMode, 'allowlist');

  // Legacy fallback
  const env2 = envLayer({
    AI_STAGE_EXECUTOR_HARNESS: 'legacy-exec',
    AI_STAGE_MAX_EXECUTION_ATTEMPTS: '4',
  });
  assert.equal(env2.executorHarness, 'legacy-exec');
  assert.equal(env2.maxExecutionAttempts, 4);
});

test('validateAndNormalizeConfig clamps bounds and validates permission modes', () => {
  const normalized = validateAndNormalizeConfig(
    {
      maxPlanReviews: 99,
      maxExecutionAttempts: -2,
      permissionMode: 'invalid_mode',
      permissionsFile: 'relative/permissions.jsonc',
      harnessModules: ['m1', 42],
    },
    DEFAULT_CONFIG,
    '/test/project',
  );
  assert.equal(normalized.maxPlanReviews, 10);
  assert.equal(normalized.maxExecutionAttempts, 1);
  assert.equal(normalized.permissionMode, 'auto_safe');
  assert.equal(
    normalized.permissionsFile,
    path.resolve('/test/project', 'relative/permissions.jsonc'),
  );
  assert.deepEqual(normalized.harnessModules, ['m1', '42']);

  const absNormalized = validateAndNormalizeConfig(
    {
      permissionsFile: '/absolute/permissions.jsonc',
    },
    DEFAULT_CONFIG,
    '/test/project',
  );
  assert.equal(absNormalized.permissionsFile, '/absolute/permissions.jsonc');

  assert.throws(() => validateAndNormalizeConfig('not-an-object', DEFAULT_CONFIG), ConfigError);
});

test('deepMerge handles nested objects without mutating source', () => {
  const base: Record<string, unknown> = { a: 1, b: { c: 2, d: 3 } };
  const layer = { b: { c: 20 }, e: 5 };
  const merged = deepMerge(base, layer) as { a: number; b: { c: number; d: number }; e: number };

  assert.equal(merged.a, 1);
  assert.equal(merged.b.c, 20);
  assert.equal(merged.b.d, 3);
  assert.equal(merged.e, 5);
  assert.equal((base.b as { c: number }).c, 2);
});

test('readJsonc parses json with comments and throws ConfigError on invalid jsonc', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonc-test-'));
  try {
    const validFile = path.join(tmpDir, 'valid.jsonc');
    fs.writeFileSync(validFile, '// comment\n{\n  "key": "value", // inline\n}');
    const val = readJsonc(validFile);
    assert.equal(val.key, 'value');

    const invalidFile = path.join(tmpDir, 'invalid.jsonc');
    fs.writeFileSync(invalidFile, '{\n  "key": "value",,\n}');
    assert.throws(() => readJsonc(invalidFile), ConfigError);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('compatible config provides uppercase legacy aliases delegating to camelCase', () => {
  assert.equal(CONFIG.EXECUTOR_HARNESS, CONFIG.executorHarness);
  assert.equal(CONFIG.REVIEWER_HARNESS, CONFIG.reviewerHarness);
  assert.equal(CONFIG.MAX_PLAN_REVIEWS, CONFIG.maxPlanReviews);
  assert.equal(CONFIG.FINAL_PLAN_REVIEW, CONFIG.finalPlanReview);
  assert.equal(CONFIG.MAX_EXECUTION_ATTEMPTS, CONFIG.maxExecutionAttempts);
  assert.equal(CONFIG.MAX_UNIQUE_QUESTIONS_PER_STAGE, CONFIG.maxUniqueQuestionsPerStage);
  assert.equal(CONFIG.PERMISSION_MODE, CONFIG.permissionMode);
  assert.equal(CONFIG.QUALITY_CMD, CONFIG.qualityCommand);
  assert.equal(CONFIG.BRANCH_PREFIX, CONFIG.branchPrefix);
  assert.equal(CONFIG.MAX_DIFF_CHARS, CONFIG.maxDiffChars);
  assert.equal(CONFIG.MAX_CONTEXT_FILE_CHARS, CONFIG.maxContextFileChars);
  assert.equal(CONFIG.UI_EVENT_COALESCE_MS, CONFIG.uiEventCoalesceMs);
  assert.equal(CONFIG.UI_DASHBOARD_MAX_ROWS, CONFIG.uiDashboardMaxRows);
  assert.equal(CONFIG.RUN_LOG_MAX_BYTES, CONFIG.runLogMaxBytes);
  assert.equal(CONFIG.FOCUS_LOG_MAX_BYTES, CONFIG.focusLogMaxBytes);
});

test('configuration templates generate valid template strings', () => {
  assert.ok(configTemplate().includes('executorHarness'));
  assert.ok(projectPlaceholderConfigTemplate().includes('Local project overrides'));
  assert.ok(projectPermissionsTemplate().includes('terminalAllowlist'));
});

test('harness helper functions return typed fallbacks', () => {
  assert.equal(harnessString('cursor', 'binary', 'default-bin'), 'agent');
  assert.equal(harnessString('nonexistent', 'binary', 'default-bin'), 'default-bin');
  assert.equal(harnessNumber('cursor', 'turnTimeoutMinutes', 10), 45);
  assert.equal(harnessNumber('nonexistent', 'turnTimeoutMinutes', 10), 10);
});

test('loadEffectiveConfig reads legacy .ai-stage-orchestrator.jsonc', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-legacy-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, '.ai-stage-orchestrator.jsonc'),
      JSON.stringify({
        permissionMode: 'allow_all',
        maxPlanReviews: 5,
      }),
    );
    const loaded = loadEffectiveConfig(tmpDir);
    assert.equal(loaded.permissionMode, 'allow_all');
    assert.equal(loaded.maxPlanReviews, 5);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('reviewer configuration defaults and normalization in validateAndNormalizeConfig', () => {
  const normalized = validateAndNormalizeConfig({}, DEFAULT_CONFIG);
  assert.ok(normalized.reviewer);
  assert.equal(normalized.reviewer.primary.harness, 'codex');
  assert.equal(normalized.reviewer.primary.model, 'gpt-6-astra');
  assert.equal(normalized.reviewer.fallback.enabled, true);
  assert.equal(normalized.reviewer.fallback.harness, 'cursor');
  assert.equal(normalized.reviewer.fallback.model, 'gemini-3.8-flash');
  assert.equal(normalized.reviewer.largeDiff.thresholdChars, 300000);
  assert.equal(normalized.reviewer.permission.model, 'composer-2.5-fast');

  // Test custom overrides and clamping
  const custom = validateAndNormalizeConfig(
    {
      reviewerHarness: 'custom-primary',
      reviewer: {
        primary: {
          timeoutMinutes: 0, // Clamps to 1
        },
        fallback: {
          enabled: false,
          triggers: ['usage_limit', 'invalid_trigger', 'process_crash'],
        },
        largeDiff: {
          thresholdChars: 50, // Clamps to 1000
        },
        permission: {
          timeoutSeconds: 2, // Clamps to 5
        },
      },
    },
    DEFAULT_CONFIG,
  );

  assert.equal(custom.reviewer?.primary.harness, 'custom-primary');
  assert.equal(custom.reviewer?.primary.timeoutMinutes, 1);
  assert.equal(custom.reviewer?.fallback.enabled, false);
  assert.deepEqual(custom.reviewer?.fallback.triggers, ['usage_limit', 'process_crash']);
  assert.equal(custom.reviewer?.largeDiff.thresholdChars, 1000);
  assert.equal(custom.reviewer?.permission.timeoutSeconds, 5);
});
