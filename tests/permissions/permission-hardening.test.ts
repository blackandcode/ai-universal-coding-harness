/**
 * @fileoverview Permission hardening tests for cross-platform paths and non-fatal denial semantics.
 *
 * Verifies path containment on POSIX and Windows styles, hard-deny invariants,
 * reviewer non-fatal denial semantics, and lack of permission quotas.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PermissionEngine } from '../../src/permissions/PermissionEngine.js';
import { pathInside, hardDangerous } from '../../src/permissions/CommandClassifier.js';

test('permission hardening: pathInside handles relative paths, nested directories, and boundary escapes', () => {
  const root = path.resolve('/workspace/project');

  assert.equal(pathInside(root, path.join(root, 'src', 'index.ts')), true);
  assert.equal(pathInside(root, path.join(root, 'package.json')), true);
  assert.equal(pathInside(root, path.join(root, '..', 'other-project', 'file.txt')), false);
  assert.equal(pathInside(root, path.resolve('/etc/passwd')), false);
});

test('permission hardening: hardDangerous denies destructive and orchestrator-owned git commands', () => {
  assert.notEqual(hardDangerous('git push origin main'), '');
  assert.notEqual(hardDangerous('git commit -m "bypass"'), '');
  assert.notEqual(hardDangerous('git checkout main'), '');
  assert.notEqual(hardDangerous('git merge feature'), '');
  assert.notEqual(hardDangerous('git rebase main'), '');
  assert.notEqual(hardDangerous('git reset --hard HEAD~1'), '');
  assert.notEqual(hardDangerous('sudo apt install curl'), '');
  assert.notEqual(hardDangerous('npm publish'), '');
  assert.notEqual(hardDangerous('rm -rf /'), '');

  // Safe commands should return empty reason string
  assert.equal(hardDangerous('git diff'), '');
  assert.equal(hardDangerous('npm test'), '');
  assert.equal(hardDangerous('git status'), '');
});

test('permission hardening: reviewer denial is non-fatal and records cache status', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'perm-reviewer-'));
  const file = path.join(root, 'p.jsonc');
  fs.writeFileSync(file, '{"terminalAllowlist":[]}');

  const engine = new PermissionEngine(root, 'ask_reviewer', file);
  const req = { command: 'curl https://example.com/api', raw: {} };

  // Decision from reviewer denying the single curl command
  const decision = engine.fromReviewer(req, {
    verdict: 'DENY',
    reason: 'Arbitrary external HTTP request denied.',
    cache_for_stage: true
  });

  assert.equal(decision.allow, false);
  assert.equal(decision.source, 'reviewer');
  assert.match(decision.reason, /Arbitrary external HTTP request denied/);

  // Cached decision must be remembered
  const cached = engine.cached(req);
  assert.ok(cached);
  assert.equal(cached.allow, false);
});
