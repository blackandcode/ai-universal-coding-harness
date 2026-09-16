/**
 * @fileoverview Automated tests for critical subsystem coverage gate and invariants.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  CRITICAL_SUBSYSTEMS,
  GLOBAL_COVERAGE_THRESHOLDS,
  buildCoverageArgs
} from '../../scripts/coverage-config.mjs';
import { runCriticalCoverage } from '../../scripts/run-critical-coverage.mjs';

test('coverage-config defines valid thresholds and invariants for critical subsystems', () => {
  assert.ok(GLOBAL_COVERAGE_THRESHOLDS.lines >= 85);
  assert.ok(GLOBAL_COVERAGE_THRESHOLDS.functions >= 85);
  assert.ok(GLOBAL_COVERAGE_THRESHOLDS.branches >= 80);

  const requiredSubsystems = ['permissions', 'evidence', 'recovery'];
  assert.deepEqual(Object.keys(CRITICAL_SUBSYSTEMS).sort(), requiredSubsystems.sort());

  for (const [id, config] of Object.entries(CRITICAL_SUBSYSTEMS)) {
    assert.equal(config.id, id);
    assert.ok(config.name.length > 0);
    assert.ok(config.sourceFiles.length > 0);
    assert.ok(config.distFiles.length > 0);
    assert.ok(config.testGlobs.length > 0);

    // Source files must exist on disk
    for (const src of config.sourceFiles) {
      assert.ok(fs.existsSync(src), `Source file missing: ${src}`);
    }

    // Critical subsystem thresholds must be >= global, and branch > 80
    assert.ok(
      config.thresholds.lines >= GLOBAL_COVERAGE_THRESHOLDS.lines,
      `${id} lines threshold must be >= global`
    );
    assert.ok(
      config.thresholds.functions >= GLOBAL_COVERAGE_THRESHOLDS.functions,
      `${id} functions threshold must be >= global`
    );
    assert.ok(
      config.thresholds.branches > GLOBAL_COVERAGE_THRESHOLDS.branches,
      `${id} branches threshold must be > global 80%`
    );
  }
});

test('buildCoverageArgs generates correct Node 24 native coverage arguments', () => {
  const args = buildCoverageArgs({ lines: 90, functions: 90, branches: 85 }, [
    '.test-dist/src/test.js'
  ]);

  assert.ok(args.includes('--experimental-test-coverage'));
  assert.ok(args.includes('--test-coverage-lines=90'));
  assert.ok(args.includes('--test-coverage-functions=90'));
  assert.ok(args.includes('--test-coverage-branches=85'));
  assert.ok(args.includes('--test-coverage-include=.test-dist/src/test.js'));
});

test('runCriticalCoverage passes on all critical subsystems under current code', () => {
  const result = runCriticalCoverage({ silent: true });
  assert.equal(
    result.ok,
    true,
    `Critical coverage failed on: ${result.failedSubsystems.join(', ')}`
  );
  assert.deepEqual(result.failedSubsystems, []);
});

test('runCriticalCoverage passes when filtering by specific subsystem', () => {
  const permRes = runCriticalCoverage({ subsystem: 'permissions', silent: true });
  assert.equal(permRes.ok, true);

  const evidRes = runCriticalCoverage({ subsystem: 'evidence', silent: true });
  assert.equal(evidRes.ok, true);

  const recovRes = runCriticalCoverage({ subsystem: 'recovery', silent: true });
  assert.equal(recovRes.ok, true);
});

test('runCriticalCoverage returns error for unknown subsystem', () => {
  const res = runCriticalCoverage({ subsystem: 'nonexistent-subsystem', silent: true });
  assert.equal(res.ok, false);
});

test('synthetic critical coverage regression fails the gate', () => {
  // Overriding branches to 99% will cause breach
  const result = runCriticalCoverage({ branchOverride: 99, silent: true });
  assert.equal(result.ok, false, 'Expected synthetic 99% branch threshold to fail gate');
  assert.ok(result.failedSubsystems.length > 0);
});

test('CLI scripts/run-critical-coverage.mjs executes via subprocess and enforces exit codes', () => {
  const scriptPath = path.resolve('scripts/run-critical-coverage.mjs');

  // Passing case
  const passRes = spawnSync(process.execPath, [scriptPath, '--subsystem=permissions'], {
    encoding: 'utf8'
  });
  assert.equal(passRes.status, 0);

  // Failing synthetic deficit case
  const failRes = spawnSync(
    process.execPath,
    [scriptPath, '--subsystem=permissions', '--override-branches=99'],
    {
      encoding: 'utf8'
    }
  );
  assert.equal(failRes.status, 1);
});
