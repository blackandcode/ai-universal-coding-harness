/**
 * @fileoverview Cross-platform runner for repository script and governance tests.
 *
 * Dynamically discovers all `.test.mjs` files in `tests/scripts/` and executes them
 * using Node's native test runner without relying on platform-specific shell globbing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Discovers all `.test.mjs` files in the given directory.
 *
 * @param {string} dir - Directory to search
 * @returns {string[]} Sorted absolute file paths
 */
export function discoverScriptTests(dir = 'tests/scripts') {
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) return [];

  const files = [];
  for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith('.test.mjs')) {
      files.push(path.join(absDir, ent.name));
    }
  }

  return files.sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Executes discovered script tests.
 *
 * @param {object} [options]
 * @param {string} [options.dir]
 * @param {boolean} [options.silent]
 * @returns {{ ok: boolean, testFiles: string[], status: number }}
 */
export function runScriptTests(options = {}) {
  const dir = options.dir || 'tests/scripts';
  const silent = Boolean(options.silent);
  const testFiles = discoverScriptTests(dir);

  if (testFiles.length === 0) {
    if (!silent) console.error(`[run-script-tests] No .test.mjs files found in ${dir}`);
    return { ok: false, testFiles: [], status: 2 };
  }

  if (!silent) {
    console.log(`[run-script-tests] Running ${testFiles.length} script test suite(s)...`);
  }

  const res = spawnSync(process.execPath, ['--test', ...testFiles], {
    stdio: silent ? 'pipe' : 'inherit',
    windowsHide: true,
    encoding: 'utf8'
  });

  const status = res.status ?? 1;
  return { ok: status === 0, testFiles, status };
}

// CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runScriptTests();
  process.exit(result.status);
}
