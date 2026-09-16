/**
 * @fileoverview Test runner script using Node.js native test runner and code coverage.
 * Discovers compiled tests in .test-dist/tests (or targeted files passed via arguments),
 * enforces native Node 24 coverage thresholds (95% lines, 95% functions, 85% branches),
 * and verifies critical security, quality, and recovery modules.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
const isCoverage =
  specifiedArgs.includes('--coverage') || specifiedArgs.includes('--coverage-gate');
const fileArgs = specifiedArgs.filter((arg) => !arg.startsWith('--'));

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
  args.push(
    '--experimental-test-coverage',
    '--test-coverage-lines=95',
    '--test-coverage-functions=95',
    '--test-coverage-branches=85',
    '--test-coverage-exclude=.test-dist/tests/**'
  );
}
args.push('--experimental-test-module-mocks', '--test', ...testFiles);

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  windowsHide: true
});

process.exit(result.status ?? 1);
