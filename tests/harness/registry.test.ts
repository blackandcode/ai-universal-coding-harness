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
import { HarnessRegistry } from '../../src/harness/registry.js';

test('default harness registry exposes Cursor executor and Codex/Cursor reviewers through generic contracts', () => {
  const r = new HarnessRegistry();
  assert.deepEqual(r.list(), { executors: ['cursor'], reviewers: ['codex', 'cursor'] });
  assert.equal(r.reviewer('cursor', {}).info.id, 'cursor');
  assert.equal(r.reviewer('codex', {}).info.id, 'codex');
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
    createSession: async () =>
      ({
        id: 'fake-sess',
        setMode: async () => {},
        prompt: async () => ({ text: '' })
      }) as unknown as Parameters<ReturnType<typeof r.executor>['createSession']>[0] extends never
        ? never
        : Awaited<ReturnType<ReturnType<typeof r.executor>['createSession']>>
  }));

  r.registerReviewer('fake-rev', () => ({
    info: { id: 'fake-rev', label: 'Fake', role: 'reviewer', model: 'fake' },
    preflight: async () => ({ ok: true, details: [] }),
    reviewPlan: async () => ({ verdict: 'APPROVE', summary: '', missing_items: [] }),
    answerQuestions: async () => ({ verdict: 'ANSWER', answers: [] }),
    decidePermission: async () => ({ verdict: 'ALLOW' }),
    reviewImplementation: async () => ({ verdict: 'APPROVE', summary: '' })
  }));

  assert.ok(r.list().executors.includes('fake-exec'));
  assert.ok(r.list().reviewers.includes('fake-rev'));

  const exec = r.executor('fake-exec', {});
  assert.equal((await exec.preflight()).ok, true);
  await exec.createSession({} as unknown as Parameters<typeof exec.createSession>[0]);

  const rev = r.reviewer('fake-rev', {});
  assert.equal((await rev.preflight()).ok, true);
  await rev.reviewPlan({ plan: '' });
  await rev.answerQuestions({ questions: [] });
  await rev.decidePermission({ command: '' });
  await rev.reviewImplementation({ diff: '' });

  // Test dynamic module loading
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mod-'));
  try {
    const modFile = path.join(tmpDir, 'custom-plugin.mjs');
    fs.writeFileSync(
      modFile,
      `export function registerHarnesses(reg) {
  reg.registerExecutor('plugin-exec', () => ({ info: { id: 'plugin-exec', label: 'Plugin', role: 'executor', model: 'p' }, preflight: async () => ({ ok: true, details: [] }), createSession: async () => ({}) }));
}`
    );

    await r.loadModule(modFile);
    assert.ok(r.list().executors.includes('plugin-exec'));
    assert.equal(r.executor('plugin-exec', {}).info.id, 'plugin-exec');

    // Loading same module again is idempotent (uses loaded set)
    await r.loadModule(modFile);

    // loadConfigured with empty array
    await r.loadConfigured([]);

    const badMod = path.join(tmpDir, 'bad-plugin.mjs');
    fs.writeFileSync(badMod, `export const notAFunction = true;`);
    await assert.rejects(() => r.loadModule(badMod), /must export registerHarnesses/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
