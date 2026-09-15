import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  DEFAULT_CONFIG,
  CONFIG_SOURCES,
  globalConfigPath,
  projectTrackedConfigPath,
} from './config.js';

test('configuration defaults are harness-neutral and safe', () => {
  assert.equal(DEFAULT_CONFIG.executorHarness, 'cursor');
  assert.equal(DEFAULT_CONFIG.reviewerHarness, 'codex');
  assert.equal(DEFAULT_CONFIG.permissionMode, 'auto_safe');
  assert.equal(DEFAULT_CONFIG.harnesses.cursor.model, 'gemini-3.8-flash');
  assert.equal(DEFAULT_CONFIG.harnesses.codex.model, 'gpt-6-astra');
});

test('config paths include global and project layers', () => {
  assert.ok(path.isAbsolute(globalConfigPath()));
  assert.ok(projectTrackedConfigPath().endsWith('.ai-universal-coding-harness.jsonc'));
  assert.equal(CONFIG_SOURCES.project, projectTrackedConfigPath());
});
