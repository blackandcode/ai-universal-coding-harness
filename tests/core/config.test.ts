/**
 * @fileoverview Unit tests for core configuration re-exports in src/core/config.ts.
 * Verifies default configuration and configuration path resolution APIs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  DEFAULT_CONFIG,
  CONFIG_SOURCES,
  globalConfigPath,
  projectTrackedConfigPath
} from '../../src/core/config.js';
import { sleep, iso, utcStamp } from '../../src/core/time.js';

test('configuration defaults are accessible via core/config.js re-export', () => {
  assert.equal(DEFAULT_CONFIG.executorHarness, 'cursor');
  assert.equal(DEFAULT_CONFIG.reviewerHarness, 'codex');
  assert.equal(DEFAULT_CONFIG.permissionMode, 'auto_safe');
  assert.equal(DEFAULT_CONFIG.harnesses.cursor?.model, 'gemini-3.8-flash');
  assert.equal(DEFAULT_CONFIG.harnesses.codex?.model, 'gpt-6-astra');
});

test('config paths are accessible via core/config.js re-export', () => {
  assert.ok(path.isAbsolute(globalConfigPath()));
  assert.ok(projectTrackedConfigPath().endsWith('.ai-universal-coding-harness.jsonc'));
  assert.equal(CONFIG_SOURCES.project, projectTrackedConfigPath());
});

test('time utilities produce valid timestamps and sleep delays', async () => {
  const start = Date.now();
  await sleep(10);
  assert.ok(Date.now() - start >= 8);
  assert.ok(iso().includes('T'));
  assert.ok(utcStamp().endsWith('Z'));
});
