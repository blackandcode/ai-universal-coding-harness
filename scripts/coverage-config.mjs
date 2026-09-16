/**
 * @fileoverview Centralized configuration for test coverage thresholds and critical subsystems.
 *
 * Single source of truth for global, incremental, and critical subsystem coverage requirements.
 * Used by scripts/run-tests.mjs, scripts/run-critical-coverage.mjs, and scripts/check-changed.mjs.
 */

/**
 * Global repository coverage thresholds applied during full test suite runs.
 */
export const GLOBAL_COVERAGE_THRESHOLDS = Object.freeze({
  lines: 85,
  functions: 85,
  branches: 80
});

/**
 * High-gain incremental coverage thresholds applied by check:changed on touched files.
 */
export const INCREMENTAL_COVERAGE_THRESHOLDS = Object.freeze({
  lines: 95,
  functions: 95,
  branches: 85
});

/**
 * Critical project subsystems requiring independent machine-enforced coverage gates.
 * Invariants: thresholds >= global, branch > 80.
 */
export const CRITICAL_SUBSYSTEMS = Object.freeze({
  permissions: Object.freeze({
    id: 'permissions',
    name: 'Permissions & Security Subsystem',
    sourceFiles: Object.freeze([
      'src/permissions/CommandClassifier.ts',
      'src/permissions/PermissionEngine.ts'
    ]),
    distFiles: Object.freeze([
      '.test-dist/src/permissions/CommandClassifier.js',
      '.test-dist/src/permissions/PermissionEngine.js'
    ]),
    testGlobs: Object.freeze(['.test-dist/tests/permissions/*.test.js']),
    thresholds: Object.freeze({
      lines: 90,
      functions: 90,
      branches: 85
    })
  }),
  evidence: Object.freeze({
    id: 'evidence',
    name: 'Evidence & Quality Corroboration Subsystem',
    sourceFiles: Object.freeze([
      'src/quality/EvidenceVerifier.ts',
      'src/quality/EvidenceService.ts'
    ]),
    distFiles: Object.freeze([
      '.test-dist/src/quality/EvidenceVerifier.js',
      '.test-dist/src/quality/EvidenceService.js'
    ]),
    testGlobs: Object.freeze(['.test-dist/tests/quality/*.test.js']),
    thresholds: Object.freeze({
      lines: 90,
      functions: 90,
      branches: 85
    })
  }),
  recovery: Object.freeze({
    id: 'recovery',
    name: 'Autonomous Crash Recovery Subsystem',
    sourceFiles: Object.freeze(['src/orchestrator/RecoveryManager.ts']),
    distFiles: Object.freeze(['.test-dist/src/orchestrator/RecoveryManager.js']),
    testGlobs: Object.freeze([
      '.test-dist/tests/orchestrator/RecoveryManager.test.js',
      '.test-dist/tests/orchestrator/recovery-hardening.test.js'
    ]),
    thresholds: Object.freeze({
      lines: 90,
      functions: 90,
      branches: 85
    })
  })
});

/**
 * Builds Node.js native test coverage command-line arguments from thresholds and includes.
 *
 * @param {typeof GLOBAL_COVERAGE_THRESHOLDS} thresholds
 * @param {readonly string[]} [includes]
 * @param {readonly string[]} [excludes]
 * @returns {string[]}
 */
export function buildCoverageArgs(
  thresholds,
  includes = ['.test-dist/src/**'],
  excludes = ['.test-dist/tests/**', '**/node_modules/**', '**/.local/**', '**/.git/**']
) {
  const args = [
    '--experimental-test-coverage',
    `--test-coverage-lines=${thresholds.lines}`,
    `--test-coverage-functions=${thresholds.functions}`,
    `--test-coverage-branches=${thresholds.branches}`
  ];

  for (const excl of excludes) {
    args.push(`--test-coverage-exclude=${excl}`);
  }

  for (const inc of includes) {
    args.push(`--test-coverage-include=${inc}`);
  }

  return args;
}
