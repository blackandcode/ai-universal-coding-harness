/**
 * @fileoverview Unit tests for PermissionEngine in src/permissions/PermissionEngine.ts.
 *
 * Validates deterministic permission classification across permission modes (auto_safe, allowlist, allow_all),
 * protection of git metadata and orchestrator control directories, denylist matching,
 * caching of reviewer verdicts, and corrupted permission file detection.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PermissionEngine } from './PermissionEngine.js';

test('auto_safe permits routine quality commands with no reviewer dependency', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-perm-'));
  try {
    const file = path.join(root, 'p.jsonc');
    fs.writeFileSync(file, '{"terminalAllowlist":[]}');
    const e = new PermissionEngine(root, 'auto_safe', file);
    const d = e.deterministic({ command: 'npm run check', raw: {} });
    assert.equal(d?.allow, true);
    assert.match(d?.source || '', /safe|allow/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hard dangerous commands are denied even in allow_all', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-perm-'));
  try {
    const file = path.join(root, 'p.jsonc');
    fs.writeFileSync(file, '{"terminalAllowlist":[]}');
    const e = new PermissionEngine(root, 'allow_all', file);
    const d = e.deterministic({ command: 'git reset --hard HEAD~1', raw: {} });
    assert.equal(d?.allow, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('workspace file writes outside repository are denied', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-perm-'));
  try {
    const file = path.join(root, 'p.jsonc');
    fs.writeFileSync(file, '{"terminalAllowlist":[]}');
    const e = new PermissionEngine(root, 'allow_all', file);
    const d = e.deterministic({ description: 'write file', paths: ['../outside.txt'], raw: {} });
    assert.equal(d?.allow, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('auto_safe does not treat broad package executors as universally safe', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-perm-'));
  try {
    const file = path.join(root, 'p.json');
    fs.writeFileSync(file, '{"terminalAllowlist":[]}');
    const e = new PermissionEngine(root, 'auto_safe', file);
    assert.equal(e.deterministic({ command: 'npm install unknown-package', raw: {} }), null);
    assert.equal(
      e.deterministic({
        command: 'node -e "require(\\\"fs\\\").rmSync(\\\"src\\\",{recursive:true})"',
        raw: {},
      }),
      null,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PermissionEngine: workspace paths deny orchestrator and git control paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-perm-paths-'));
  try {
    const file = path.join(root, 'p.jsonc');
    fs.writeFileSync(file, '{}');
    const e = new PermissionEngine(root, 'allow_all', file);

    const gitTarget = e.deterministic({ description: 'write', paths: ['.git/config'], raw: {} });
    assert.equal(gitTarget?.allow, false);
    assert.equal(gitTarget?.source, 'workspace-boundary');

    const inputTarget = e.deterministic({
      description: 'write',
      paths: ['.ai-orchestrator/stage-input/stage-01/prompt.md'],
      raw: {},
    });
    assert.equal(inputTarget?.allow, false);

    const lockTarget = e.deterministic({
      description: 'write',
      paths: ['.ai-orchestrator/orchestrator.lock'],
      raw: {},
    });
    assert.equal(lockTarget?.allow, false);

    const cursorTarget = e.deterministic({
      description: 'write',
      paths: ['.cursor/permissions.json'],
      raw: {},
    });
    assert.equal(cursorTarget?.allow, false);

    const runTarget = e.deterministic({
      description: 'write',
      paths: ['.ai-orchestrator/runs/run-1/notes.txt'],
      raw: {},
    });
    assert.equal(runTarget?.allow, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PermissionEngine: denylist and allowlist matching in allowlist mode', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-perm-lists-'));
  try {
    const file = path.join(root, 'p.jsonc');
    fs.writeFileSync(
      file,
      JSON.stringify({
        terminalAllowlist: ['npm test', 'git status'],
        terminalDenylist: ['curl evil.com', 'nc -l'],
      }),
    );

    const e = new PermissionEngine(root, 'allowlist', file);

    // Denylist beats allowlist
    const denied = e.deterministic({ command: 'curl evil.com', raw: {} });
    assert.equal(denied?.allow, false);
    assert.equal(denied?.source, 'denylist');

    // In allowlist
    const allowed = e.deterministic({ command: 'npm test', raw: {} });
    assert.equal(allowed?.allow, true);
    assert.equal(allowed?.source, 'allowlist');

    // Not in allowlist requires reviewer judgment
    const needsReview = e.deterministic({ command: 'node custom.js', raw: {} });
    assert.equal(needsReview, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PermissionEngine: records and serves cached reviewer verdicts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-perm-cache-'));
  try {
    const file = path.join(root, 'p.jsonc');
    fs.writeFileSync(file, '{}');
    const e = new PermissionEngine(root, 'auto_safe', file);

    const req = { command: 'terraform apply', raw: {} };
    assert.equal(e.deterministic(req), null);

    assert.ok(e.signature(req));
    const decision = e.fromReviewer(req, {
      verdict: 'ALLOW',
      reason: 'Approved by reviewer',
      cache_for_stage: true,
    });
    e.remember(req, decision);

    const cached = e.cached(req);
    assert.equal(cached?.allow, true);
    assert.equal(cached?.source, 'reviewer');
    assert.equal(cached?.reason, 'Approved by reviewer');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('PermissionEngine: throws on corrupted jsonc in permissions file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-perm-corrupt-'));
  try {
    const file = path.join(root, 'corrupt.jsonc');
    fs.writeFileSync(file, '{\n  invalid jsonc here,,,\n');
    assert.throws(
      () => new PermissionEngine(root, 'auto_safe', file),
      /Unable to parse permissions file/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
