/**
 * @fileoverview Test runner script using Node.js native test runner and code coverage.
 * Discovers compiled tests in .test-dist/tests (or targeted files passed via arguments),
 * enforces native Node 24 coverage thresholds (95% lines, 95% functions, 85% branches),
 * and verifies critical security, quality, and recovery modules.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { GLOBAL_COVERAGE_THRESHOLDS, INCREMENTAL_COVERAGE_THRESHOLDS } from './coverage-config.mjs';

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
    } else if (entry.name.endsWith('.test.js')) {
      out.push(fullPath);
    }
  }
  return out;
}

const specifiedArgs = process.argv.slice(2);
const includes = [];
const fileArgs = [];

for (let i = 0; i < specifiedArgs.length; i++) {
  const arg = specifiedArgs[i];
  if (arg === '--coverage' || arg === '--coverage-gate') {
    continue;
  }
  if (arg.startsWith('--include=')) {
    includes.push(arg.slice('--include='.length));
    continue;
  }
  if (arg.startsWith('--test-coverage-include=')) {
    includes.push(arg.slice('--test-coverage-include='.length));
    continue;
  }
  if (arg === '--include' && i + 1 < specifiedArgs.length) {
    includes.push(specifiedArgs[++i]);
    continue;
  }
  if (arg.startsWith('--')) {
    continue;
  }
  fileArgs.push(arg);
}

const isCoverage =
  specifiedArgs.includes('--coverage') ||
  specifiedArgs.includes('--coverage-gate') ||
  includes.length > 0;

let testFiles = [];

if (fileArgs.length > 0) {
  for (const raw of fileArgs) {
    let candidate = path.resolve(raw);
    if (!fs.existsSync(candidate) || candidate.endsWith('.ts') || candidate.endsWith('.tsx')) {
      const rel = path.isAbsolute(raw) ? path.relative(process.cwd(), raw) : raw;
      const mapped = path.resolve('.test-dist', rel.replace(/\.(ts|tsx)$/, '.js'));
      if (fs.existsSync(mapped)) {
        candidate = mapped;
      }
    }
    if (fs.existsSync(candidate) && (candidate.endsWith('.js') || candidate.endsWith('.mjs'))) {
      testFiles.push(candidate);
    } else {
      console.warn(`[run-tests] Warning: Test file not found for "${raw}"`);
    }
  }
} else {
  const testDistDir = path.resolve('.test-dist/tests');
  testFiles = walk(testDistDir).sort((a, b) => a.localeCompare(b, 'en'));
}

if (testFiles.length === 0) {
  console.error('No compiled test files found in .test-dist/tests. Run npm run build:tests first.');
  process.exit(2);
}

const args = [];
if (isCoverage) {
  const thresholds =
    includes.length > 0 ? INCREMENTAL_COVERAGE_THRESHOLDS : GLOBAL_COVERAGE_THRESHOLDS;
  args.push(
    '--experimental-test-coverage',
    `--test-coverage-lines=${thresholds.lines}`,
    `--test-coverage-functions=${thresholds.functions}`,
    `--test-coverage-branches=${thresholds.branches}`,
    '--test-coverage-exclude=.test-dist/tests/**',
    '--test-coverage-exclude=**/node_modules/**',
    '--test-coverage-exclude=**/.local/**',
    '--test-coverage-exclude=**/.git/**'
  );
  if (includes.length > 0) {
    for (const inc of includes) {
      args.push(`--test-coverage-include=${inc}`);
    }
  } else {
    args.push('--test-coverage-include=.test-dist/src/**');
  }
}
args.push('--test-timeout=60000', '--experimental-test-module-mocks', '--test', ...testFiles);

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  windowsHide: true
});

process.exit(result.status ?? 1);
