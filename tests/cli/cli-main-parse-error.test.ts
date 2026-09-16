/**
 * @fileoverview Isolated CLI runner test for parseCliArgs failure handling (module mock).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('runCli: stringifies non-Error throws from parseCliArgs', async (t) => {
  t.mock.module('../../src/cli/parser.js', {
    // @ts-expect-error Node.js mock.module options.exports replaces deprecated namedExports
    exports: {
      parseCliArgs: () => {
        throw 'plain-string-failure';
      }
    }
  });
  const { runCli } = await import('../../src/cli-main.js');
  const origError = console.error;
  const errorLogs: string[] = [];
  console.error = (...args: unknown[]) => {
    errorLogs.push(args.map(String).join(' '));
  };
  try {
    const code = await runCli(['--version']);
    assert.equal(code, 2);
    assert.ok(errorLogs.some((l) => l.includes('plain-string-failure')));
  } finally {
    console.error = origError;
  }
});
