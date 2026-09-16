/**
 * @fileoverview Unit tests for HarnessRegistry in src/harness/registry.ts.
 *
 * Validates discovery and instantiation of registered executor and reviewer harnesses,
 * error handling for unknown harness identifiers, custom harness registration,
 * and dynamic module loading.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { HarnessRegistry } from './registry.js';

test('default harness registry exposes Cursor executor and Codex reviewer only through generic contracts', () => {
  const r = new HarnessRegistry();
  assert.deepEqual(r.list(), { executors: ['cursor'], reviewers: ['codex'] });
});

test('HarnessRegistry: throws on unknown executor or reviewer harness', () => {
  const r = new HarnessRegistry();
  assert.throws(() => r.executor('nonexistent', {}), /Unknown executor harness 'nonexistent'/);
  assert.throws(() => r.reviewer('nonexistent', {}), /Unknown reviewer harness 'nonexistent'/);
});

test('HarnessRegistry: registers custom harness and dynamically loads modules', async () => {
  const r = new HarnessRegistry();

  r.registerExecutor('fake-exec', () => ({
    info: { id: 'fake-exec', label: 'Fake', role: 'executor', model: 'fake' },
    preflight: async () => ({ ok: true, details: [] }),
    createSession: async () => ({}) as any,
  }));

  r.registerReviewer('fake-rev', () => ({
    info: { id: 'fake-rev', label: 'Fake', role: 'reviewer', model: 'fake' },
    preflight: async () => ({ ok: true, details: [] }),
    reviewPlan: async () => ({}) as any,
    reviewFinal: async () => ({}) as any,
    answerQuestions: async () => ({}) as any,
    decidePermission: async () => ({}) as any,
    reviewImplementation: async () => ({}) as any,
  }));

  assert.ok(r.list().executors.includes('fake-exec'));
  assert.ok(r.list().reviewers.includes('fake-rev'));

  // Test dynamic module loading
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mod-'));
  try {
    const modFile = path.join(tmpDir, 'custom-plugin.mjs');
    fs.writeFileSync(
      modFile,
      `export function registerHarnesses(reg) {
  reg.registerExecutor('plugin-exec', () => ({ info: { id: 'plugin-exec' } }));
}`,
    );

    await r.loadModule(modFile);
    assert.ok(r.list().executors.includes('plugin-exec'));

    // Loading same module again is idempotent (uses loaded set)
    await r.loadModule(modFile);

    // loadConfigured with empty array
    await r.loadConfigured([]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
