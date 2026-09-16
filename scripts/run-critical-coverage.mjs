/**
 * @fileoverview Independent runner for critical subsystem coverage gates.
 *
 * Enforces machine-checked coverage thresholds for critical subsystems:
 * - Permissions & Security (CommandClassifier.ts, PermissionEngine.ts)
 * - Evidence & Quality (EvidenceVerifier.ts, EvidenceService.ts)
 * - Autonomous Recovery (RecoveryManager.ts)
 *
 * Fails with a non-zero exit code if any critical subsystem falls below its required
 * threshold, even if global repository coverage passes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CRITICAL_SUBSYSTEMS } from './coverage-config.mjs';

function resolveGlobs(pattern) {
  const normalized = pattern.replace(/\\/g, '/');
  const dir = path.dirname(normalized);
  const wildcard = path.basename(normalized);
  const absDir = path.resolve(dir);

  if (!fs.existsSync(absDir)) return [];

  const files = [];
  const entries = fs.readdirSync(absDir, { withFileTypes: true });

  for (const ent of entries) {
    if (ent.isFile()) {
      if (wildcard.startsWith('*') && wildcard.endsWith('.test.js')) {
        if (ent.name.endsWith('.test.js')) {
          files.push(path.join(absDir, ent.name));
        }
      } else if (ent.name === wildcard) {
        files.push(path.join(absDir, ent.name));
      }
    }
  }

  return files.sort((a, b) => a.localeCompare(b, 'en'));
}

export function runCriticalCoverage(options = {}) {
  const subsystemArg = options.subsystem || null;
  const branchOverride = options.branchOverride != null ? options.branchOverride : null;
  const lineOverride = options.lineOverride != null ? options.lineOverride : null;
  const funcOverride = options.funcOverride != null ? options.funcOverride : null;
  const silent = Boolean(options.silent);

  const entries = Object.entries(CRITICAL_SUBSYSTEMS).filter(([id]) => {
    return !subsystemArg || id === subsystemArg;
  });

  if (entries.length === 0) {
    if (!silent) console.error(`[critical-coverage] No subsystem matched "${subsystemArg}".`);
    return { ok: false, failedSubsystems: ['unknown'] };
  }

  const failedSubsystems = [];

  for (const [id, config] of entries) {
    if (!silent) {
      console.log(
        `\n================================================================================`
      );
      console.log(`[critical-coverage] Subsystem Gate: ${config.name} (${id})`);
      console.log(
        `================================================================================`
      );
    }

    // Verify compiled source artifacts exist
    for (const distFile of config.distFiles) {
      const fullDist = path.resolve(distFile);
      if (!fs.existsSync(fullDist)) {
        if (!silent) {
          console.error(
            `[critical-coverage] Missing compiled artifact: ${distFile}. Run npm run build:tests first.`
          );
        }
        return { ok: false, failedSubsystems: [id] };
      }
    }

    // Resolve test files
    const testFiles = [];
    for (const pattern of config.testGlobs) {
      testFiles.push(...resolveGlobs(pattern));
    }

    const uniqueTests = [...new Set(testFiles)].sort((a, b) => a.localeCompare(b, 'en'));

    if (uniqueTests.length === 0) {
      if (!silent) {
        console.error(`[critical-coverage] No test files discovered for subsystem: ${id}`);
      }
      return { ok: false, failedSubsystems: [id] };
    }

    const lines = lineOverride ?? config.thresholds.lines;
    const functions = funcOverride ?? config.thresholds.functions;
    const branches = branchOverride ?? config.thresholds.branches;

    const args = [
      '--experimental-test-coverage',
      `--test-coverage-lines=${lines}`,
      `--test-coverage-functions=${functions}`,
      `--test-coverage-branches=${branches}`,
      '--test-coverage-exclude=.test-dist/tests/**',
      '--test-coverage-exclude=**/node_modules/**',
      '--test-coverage-exclude=**/.local/**',
      '--test-coverage-exclude=**/.git/**'
    ];

    for (const distFile of config.distFiles) {
      args.push(`--test-coverage-include=${distFile}`);
    }

    args.push('--test-timeout=60000', '--experimental-test-module-mocks', '--test', ...uniqueTests);

    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    delete childEnv.NODE_TEST_WORKER_ID;

    const res = spawnSync(process.execPath, args, {
      stdio: silent ? 'pipe' : 'inherit',
      windowsHide: true,
      encoding: 'utf8',
      env: childEnv
    });

    if (res.status !== 0) {
      if (!silent) {
        console.error(
          `\n[critical-coverage] FAILED: Subsystem "${id}" breached coverage gate (thresholds: lines >= ${lines}%, funcs >= ${functions}%, branches >= ${branches}%).`
        );
      }
      failedSubsystems.push(id);
    } else {
      if (!silent) {
        console.log(
          `[critical-coverage] PASSED: Subsystem "${id}" satisfied all coverage invariants.`
        );
      }
    }
  }

  const ok = failedSubsystems.length === 0;
  if (!silent) {
    if (ok) {
      console.log(
        `\n[critical-coverage] All ${entries.length} critical subsystem gates passed successfully!`
      );
    } else {
      console.error(
        `\n[critical-coverage] ${failedSubsystems.length} critical subsystem(s) failed coverage gates: ${failedSubsystems.join(', ')}`
      );
    }
  }

  return { ok, failedSubsystems };
}

// CLI execution
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  const args = process.argv.slice(2);
  let subsystem = null;
  let branchOverride = null;
  let lineOverride = null;
  let funcOverride = null;

  for (const arg of args) {
    if (arg.startsWith('--subsystem=')) {
      subsystem = arg.slice('--subsystem='.length);
    } else if (arg.startsWith('--override-branches=')) {
      branchOverride = Number(arg.slice('--override-branches='.length));
    } else if (arg.startsWith('--override-lines=')) {
      lineOverride = Number(arg.slice('--override-lines='.length));
    } else if (arg.startsWith('--override-functions=')) {
      funcOverride = Number(arg.slice('--override-functions='.length));
    }
  }

  const result = runCriticalCoverage({
    subsystem,
    branchOverride,
    lineOverride,
    funcOverride
  });

  process.exit(result.ok ? 0 : 1);
}
