/**
 * @fileoverview Invariant tests for project governance artifacts, CI matrix, and documentation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { discoverScriptTests } from '../../scripts/run-script-tests.mjs';

test('root IMPLEMENTATION-STATUS.md exists and contains required governance sections', () => {
  const statusPath = path.resolve('IMPLEMENTATION-STATUS.md');
  assert.ok(fs.existsSync(statusPath), 'Root IMPLEMENTATION-STATUS.md must exist');

  const content = fs.readFileSync(statusPath, 'utf8');

  // Verify key required sections
  assert.match(content, /## 1\. Project & Release Baseline/);
  assert.match(content, /## 2\. Core Subsystems & Architecture/);
  assert.match(content, /## 3\. Modernization Gap Closure Roadmap/);
  assert.match(content, /## 4\. Quality Gates & Verification Chain/);
  assert.match(content, /## 5\. Compatibility & Deprecation Matrix/);
  assert.match(content, /## 6\. Known Deferred Work/);
  assert.match(content, /## 7\. Stage Closure History/);

  // Verify completed modernization stages
  assert.match(content, /Stage 01.*Completed/);
  assert.match(content, /Stage 02.*Completed/);
  assert.match(content, /Stage 03.*Completed/);
  assert.match(content, /Stage 04.*Completed/);
});

test('root DECISIONS.md is authoritative and contains decisions 1 through 17 without broken links', () => {
  const decisionsPath = path.resolve('DECISIONS.md');
  assert.ok(fs.existsSync(decisionsPath), 'Root DECISIONS.md must exist');

  const content = fs.readFileSync(decisionsPath, 'utf8');

  // Must not reference non-existent rewrite plan directory
  assert.ok(
    !content.includes('ai-universal-coding-harness-rewrite-plan'),
    'DECISIONS.md must not reference non-existent rewrite plan'
  );

  // Must declare itself authoritative
  assert.match(content, /authoritative log/i);

  // Must contain decisions 1 through 17
  for (let i = 1; i <= 17; i++) {
    assert.match(
      content,
      new RegExp(`(?:^|\\n)${i}\\.\\s+\\*\\*`),
      `DECISIONS.md must contain Decision ${i}`
    );
  }

  // Decision 16 must specifically mention critical subsystem coverage gates
  assert.match(content, /16\.\s+\*\*Independent Critical Subsystem Coverage Gates/);

  // Decision 17 must specifically mention configuration contract fidelity
  assert.match(content, /17\.\s+\*\*Configuration Contract Fidelity/);
});

test('.github/workflows/ci.yml enforces exact Node 24.18.0 across all OSes and Node 24 latest on Ubuntu', () => {
  const ciPath = path.resolve('.github/workflows/ci.yml');
  assert.ok(fs.existsSync(ciPath), 'CI workflow must exist');

  const content = fs.readFileSync(ciPath, 'utf8');

  assert.match(content, /os:\s*ubuntu-latest\s*\n\s*node:\s*24\.18\.0/);
  assert.match(content, /os:\s*windows-latest\s*\n\s*node:\s*24\.18\.0/);
  assert.match(content, /os:\s*macos-latest\s*\n\s*node:\s*24\.18\.0/);
  assert.match(content, /os:\s*ubuntu-latest\s*\n\s*node:\s*24(?:\s|$)/);
});

test('runtime engines and .nvmrc enforce >=24.18.0 minimum baseline', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.engines?.node, '>=24.18.0');

  const nvmrc = fs.readFileSync('.nvmrc', 'utf8').trim();
  assert.equal(nvmrc, '24.18.0');
});

test('package-check requiredDiskFiles includes DECISIONS.md and IMPLEMENTATION-STATUS.md', () => {
  const pkgCheckContent = fs.readFileSync('scripts/package-check.mjs', 'utf8');
  assert.match(pkgCheckContent, /'DECISIONS\.md'/);
  assert.match(pkgCheckContent, /'IMPLEMENTATION-STATUS\.md'/);
});

test('discoverScriptTests discovers all repository script test suites', () => {
  const tests = discoverScriptTests();
  const basenames = tests.map((t) => path.basename(t));

  assert.ok(basenames.includes('adr.test.mjs'));
  assert.ok(basenames.includes('changelog.test.mjs'));
  assert.ok(basenames.includes('versioning.test.mjs'));
  assert.ok(basenames.includes('critical-coverage.test.mjs'));
  assert.ok(basenames.includes('doc-links.test.mjs'));
  assert.ok(basenames.includes('governance.test.mjs'));
});

test('package.json verify script enforces all 9 required quality stages in order', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const verifyScript = pkg.scripts?.verify;
  assert.ok(verifyScript, 'package.json must define a verify script');

  const requiredSteps = [
    'npm run format:check',
    'npm run lint',
    'npm run typecheck',
    'npm run test:coverage',
    'npm run test:critical-coverage',
    'npm run test:scripts',
    'npm run test:cli',
    'node scripts/package-check.mjs',
    'npm run docs:links'
  ];

  const actualSteps = verifyScript.split('&&').map((step) => step.trim());
  assert.deepEqual(
    actualSteps,
    requiredSteps,
    'verify script must execute all 9 steps in the required order'
  );
});
