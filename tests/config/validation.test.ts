/**
 * @fileoverview Unit and contract tests for configuration validation and normalization in src/config/validation.ts.
 *
 * Validates default normalization, numeric clamping, role-specific tunables preservation,
 * fallback trigger filtering, and permission mode assertions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAndNormalizeConfig } from '../../src/config/validation.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';

test('validation: normalizes default empty configuration against DEFAULT_CONFIG', () => {
  const normalized = validateAndNormalizeConfig({}, DEFAULT_CONFIG);
  assert.equal(normalized.executorHarness, 'cursor');
  assert.equal(normalized.reviewerHarness, 'codex');
  assert.equal(normalized.maxUniqueQuestionsPerStage, 25);
  assert.equal(normalized.permissionMode, 'auto_safe');
  assert.ok(normalized.reviewer);
  assert.equal(normalized.reviewer.primary.harness, 'codex');
  assert.equal(normalized.reviewer.primary.model, 'gpt-6-astra');
  assert.equal(normalized.reviewer.primary.reasoningEffort, 'medium');
  assert.equal(normalized.reviewer.primary.verbosity, 'low');
  assert.equal(normalized.reviewer.primary.timeoutMinutes, 8);
  assert.equal(normalized.reviewer.primary.contextMode, 'evidence_only');
  assert.equal(normalized.reviewer.fallback.enabled, true);
  assert.equal(normalized.reviewer.fallback.harness, 'cursor');
  assert.equal(normalized.reviewer.fallback.model, 'gemini-3.8-flash');
  assert.equal(normalized.reviewer.largeDiff.thresholdChars, 300000);
  assert.equal(normalized.reviewer.permission.model, 'composer-2.5-fast');
  assert.equal(normalized.reviewer.permission.timeoutSeconds, 30);
});

test('validation: clamps numeric fields to safe boundary invariants', () => {
  const normalized = validateAndNormalizeConfig(
    {
      maxPlanReviews: 0,
      maxExecutionAttempts: -5,
      maxUniqueQuestionsPerStage: 0,
      reviewer: {
        primary: {
          timeoutMinutes: -1,
          timeoutSeconds: 0
        },
        fallback: {
          timeoutMinutes: 0,
          timeoutSeconds: -10
        },
        largeDiff: {
          thresholdChars: 10,
          timeoutMinutes: 0,
          timeoutSeconds: 0
        },
        permission: {
          timeoutSeconds: 2,
          timeoutMinutes: -1
        }
      }
    },
    DEFAULT_CONFIG
  );

  assert.equal(normalized.maxPlanReviews, 1);
  assert.equal(normalized.maxExecutionAttempts, 1);
  assert.equal(normalized.maxUniqueQuestionsPerStage, 1);
  assert.ok(normalized.reviewer);
  assert.equal(normalized.reviewer.primary.timeoutMinutes, 1);
  assert.equal(normalized.reviewer.primary.timeoutSeconds, 1);
  assert.equal(normalized.reviewer.fallback.timeoutMinutes, 1);
  assert.equal(normalized.reviewer.fallback.timeoutSeconds, 1);
  assert.equal(normalized.reviewer.largeDiff.thresholdChars, 1000);
  assert.equal(normalized.reviewer.largeDiff.timeoutMinutes, 1);
  assert.equal(normalized.reviewer.largeDiff.timeoutSeconds, 1);
  assert.equal(normalized.reviewer.permission.timeoutSeconds, 5);
  assert.equal(normalized.reviewer.permission.timeoutMinutes, 1);
});

test('validation: preserves all optional role tunables across all reviewer roles', () => {
  const custom = validateAndNormalizeConfig(
    {
      reviewer: {
        primary: {
          harness: 'codex',
          model: 'gpt-6-custom',
          binary: '/opt/codex/bin',
          thinking: 'high',
          reasoningEffort: 'high',
          verbosity: 'high',
          timeoutMinutes: 15,
          timeoutSeconds: 60,
          contextMode: 'project_readonly'
        },
        fallback: {
          enabled: false,
          harness: 'cursor',
          model: 'gemini-custom',
          binary: '/opt/cursor/bin',
          thinking: 'low',
          reasoningEffort: 'low',
          verbosity: 'low',
          triggers: ['usage_limit', 'process_crash'],
          timeoutMinutes: 12,
          timeoutSeconds: 40,
          contextMode: 'project_readonly'
        },
        largeDiff: {
          thresholdChars: 500000,
          harness: 'codex',
          model: 'gpt-large-diff',
          binary: '/opt/large/bin',
          thinking: 'medium',
          reasoningEffort: 'medium',
          verbosity: 'medium',
          timeoutMinutes: 20,
          timeoutSeconds: 90,
          contextMode: 'evidence_only'
        },
        permission: {
          harness: 'cursor',
          model: 'composer-perm',
          binary: '/opt/perm/bin',
          thinking: 'high',
          reasoningEffort: 'medium',
          verbosity: 'high',
          timeoutMinutes: 5,
          timeoutSeconds: 45,
          contextMode: 'project_readonly'
        }
      }
    },
    DEFAULT_CONFIG
  );

  assert.ok(custom.reviewer);
  // Primary
  assert.equal(custom.reviewer.primary.binary, '/opt/codex/bin');
  assert.equal(custom.reviewer.primary.thinking, 'high');
  assert.equal(custom.reviewer.primary.reasoningEffort, 'high');
  assert.equal(custom.reviewer.primary.verbosity, 'high');
  assert.equal(custom.reviewer.primary.timeoutMinutes, 15);
  assert.equal(custom.reviewer.primary.timeoutSeconds, 60);
  assert.equal(custom.reviewer.primary.contextMode, 'project_readonly');

  // Fallback
  assert.equal(custom.reviewer.fallback.binary, '/opt/cursor/bin');
  assert.equal(custom.reviewer.fallback.thinking, 'low');
  assert.equal(custom.reviewer.fallback.reasoningEffort, 'low');
  assert.equal(custom.reviewer.fallback.verbosity, 'low');
  assert.equal(custom.reviewer.fallback.timeoutMinutes, 12);
  assert.equal(custom.reviewer.fallback.timeoutSeconds, 40);
  assert.equal(custom.reviewer.fallback.contextMode, 'project_readonly');

  // LargeDiff
  assert.equal(custom.reviewer.largeDiff.binary, '/opt/large/bin');
  assert.equal(custom.reviewer.largeDiff.thinking, 'medium');
  assert.equal(custom.reviewer.largeDiff.reasoningEffort, 'medium');
  assert.equal(custom.reviewer.largeDiff.verbosity, 'medium');
  assert.equal(custom.reviewer.largeDiff.timeoutMinutes, 20);
  assert.equal(custom.reviewer.largeDiff.timeoutSeconds, 90);
  assert.equal(custom.reviewer.largeDiff.contextMode, 'evidence_only');

  // Permission
  assert.equal(custom.reviewer.permission.binary, '/opt/perm/bin');
  assert.equal(custom.reviewer.permission.thinking, 'high');
  assert.equal(custom.reviewer.permission.reasoningEffort, 'medium');
  assert.equal(custom.reviewer.permission.verbosity, 'high');
  assert.equal(custom.reviewer.permission.timeoutMinutes, 5);
  assert.equal(custom.reviewer.permission.timeoutSeconds, 45);
  assert.equal(custom.reviewer.permission.contextMode, 'project_readonly');
});

test('validation: filters invalid fallback triggers and falls back to defaults when empty', () => {
  const filtered = validateAndNormalizeConfig(
    {
      reviewer: {
        fallback: {
          triggers: ['invalid_trigger_1', 'usage_limit', 'invalid_trigger_2'] as unknown as (
            | 'usage_limit'
            | 'rate_limit'
          )[]
        }
      }
    },
    DEFAULT_CONFIG
  );
  assert.ok(filtered.reviewer);
  assert.deepEqual(filtered.reviewer.fallback.triggers, ['usage_limit']);

  const emptyTriggers = validateAndNormalizeConfig(
    {
      reviewer: {
        fallback: {
          triggers: ['completely_invalid'] as unknown as ('usage_limit' | 'rate_limit')[]
        }
      }
    },
    DEFAULT_CONFIG
  );
  assert.ok(emptyTriggers.reviewer);
  assert.ok(emptyTriggers.reviewer.fallback.triggers.includes('usage_limit'));
  assert.ok(emptyTriggers.reviewer.fallback.triggers.includes('rate_limit'));
});

test('validation: normalizes permissionMode and defaults invalid modes', () => {
  const valid = validateAndNormalizeConfig({ permissionMode: 'allow_all' }, DEFAULT_CONFIG);
  assert.equal(valid.permissionMode, 'allow_all');

  const invalid = validateAndNormalizeConfig(
    { permissionMode: 'unsupported_mode' as unknown as 'auto_safe' },
    DEFAULT_CONFIG
  );
  assert.equal(invalid.permissionMode, 'auto_safe');
});
