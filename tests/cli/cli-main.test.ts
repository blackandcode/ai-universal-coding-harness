/**
 * @fileoverview Unit tests for top-level CLI runner in src/cli-main.ts.
 * Validates argument handling, command dispatch coordination, and error trapping.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

async function loadRunCli() {
  const mod = await import('../../src/cli-main.js');
  return mod.runCli;
}

test('runCli: executes valid commands successfully', async () => {
  const runCli = await loadRunCli();
  const origLog = console.log;
  console.log = () => {};
  try {
    const helpCode = await runCli(['--help']);
    assert.equal(helpCode, 0);

    const versionCode = await runCli(['--version']);
    assert.equal(versionCode, 0);
  } finally {
    console.log = origLog;
  }
});

test('runCli: uses default argv parameter when none provided', async () => {
  const runCli = await loadRunCli();
  const origLog = console.log;
  const origArgv = process.argv;
  console.log = () => {};
  process.argv = [process.execPath, 'cli-main.js', '--version'];
  try {
    const code = await runCli();
    assert.equal(code, 0);
  } finally {
    console.log = origLog;
    process.argv = origArgv;
  }
});

test('runCli: catches parsing and execution errors and logs to stderr', async () => {
  const runCli = await loadRunCli();
  const origError = console.error;
  const errorLogs: string[] = [];
  console.error = (...args: unknown[]) => {
    errorLogs.push(args.map(String).join(' '));
  };

  try {
    const code = await runCli(['invalid-subcommand-xyz', '--unknown-flag']);
    assert.equal(code, 2);
    assert.ok(errorLogs.some((l) => l.startsWith('ERROR:')));
  } finally {
    console.error = origError;
  }
});
