/**
 * @fileoverview Verification test ensuring Oxlint enforces required AST-based linter rules.
 * Generates dynamic code fixtures violating critical rules and verifies Oxlint catches each one.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oxlint-rule-verify-'));

try {
  // Fixture 1: promise/no-new-statics
  fs.writeFileSync(path.join(tmpDir, 'promise-statics.ts'), 'new Promise.resolve();\n');

  // Fixture 2: no-async-promise-executor
  fs.writeFileSync(
    path.join(tmpDir, 'async-executor.ts'),
    'new Promise(async (resolve, reject) => { resolve(1); reject(2); });\n'
  );

  // Fixture 3: node/no-exports-assign
  fs.writeFileSync(path.join(tmpDir, 'exports-assign.js'), 'exports = 1;\n');

  // Fixture 4: node/no-new-require
  fs.writeFileSync(path.join(tmpDir, 'new-require.js'), 'const _fs = new require("fs");\n');

  // Fixture 5: eqeqeq
  fs.writeFileSync(
    path.join(tmpDir, 'eqeqeq.ts'),
    'export function checkEquality(a: number, b: number) { if (a == b) return true; return false; }\n'
  );

  // Fixture 6: no-self-compare
  fs.writeFileSync(
    path.join(tmpDir, 'self-compare.ts'),
    'export function checkSelf(x: number) { if (x === x) return true; return false; }\n'
  );

  // Fixture 7: react/jsx-key
  fs.writeFileSync(
    path.join(tmpDir, 'jsx-key.tsx'),
    'export const List = () => [1, 2].map((n) => <span>{n}</span>);\n'
  );

  // Fixture 8: no-unused-vars
  fs.writeFileSync(path.join(tmpDir, 'unused-vars.ts'), 'const unusedVariable = 42;\n');

  // Fixture 9: typescript/no-explicit-any
  fs.writeFileSync(
    path.join(tmpDir, 'explicit-any.ts'),
    'export function compute(value: any): any { return value; }\n'
  );

  const configPath = path.resolve('.oxlintrc.json');
  const oxlintBin = path.resolve('node_modules/.bin/oxlint');

  const result = spawnSync(oxlintBin, ['-c', configPath, tmpDir], {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });

  if (result.status === 0) {
    console.error('Expected Oxlint to fail on invalid rule fixtures, but it exited with status 0.');
    process.exit(2);
  }

  const output = (result.stdout || '') + (result.stderr || '');

  const expectedRules = [
    'no-new-statics',
    'no-async-promise-executor',
    'no-exports-assign',
    'no-new-require',
    'eqeqeq',
    'no-self-compare',
    'jsx-key',
    'no-unused-vars',
    'no-explicit-any'
  ];

  const missingRules = expectedRules.filter((rule) => !output.includes(rule));

  if (missingRules.length > 0) {
    console.error(
      `Oxlint rule verification failed. Missing expected diagnostics: ${missingRules.join(', ')}`
    );
    console.error('Oxlint output:\n', output);
    process.exit(2);
  }

  console.log('Oxlint rule fixture verification OK: all expected diagnostics triggered.');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
