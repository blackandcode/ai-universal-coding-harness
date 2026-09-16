/**
 * @fileoverview Test runner script using Node.js native test runner and code coverage.
 * Enforces native Node 24 coverage thresholds (85% lines, 85% functions, 80% branches)
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

const distDir = path.resolve('dist');
const testFiles = walk(distDir).sort((a, b) => a.localeCompare(b, 'en'));

if (testFiles.length === 0) {
  console.error('No compiled test files found in dist. Run npm run build first.');
  process.exit(2);
}

const isCoverage = process.argv.includes('--coverage') || process.argv.includes('--coverage-gate');

const args = [];
if (isCoverage) {
  args.push(
    '--experimental-test-coverage',
    '--test-coverage-lines=85',
    '--test-coverage-functions=85',
    '--test-coverage-branches=80',
  );
}
args.push('--test', ...testFiles);

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  windowsHide: true,
});

process.exit(result.status ?? 1);
