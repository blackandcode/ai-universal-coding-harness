/**
 * @fileoverview Unit tests for typed process execution and shell utilities.
 * Validates synchronous execution, asynchronous streaming, timeouts, AbortSignal cancellation, and command resolution.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  execSyncText,
  runProcess,
  runShellCommand,
  commandExists
} from '../../src/core/process.js';
import { ProcessExecutionError } from '../../src/errors.js';

test('execSyncText executes command synchronously and returns typed result', () => {
  const res = execSyncText(process.execPath, ['-e', 'console.log("hello"); console.error("err")']);
  assert.equal(res.exitCode, 0);
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), 'hello');
  assert.equal(res.stderr.trim(), 'err');
  assert.equal(res.timedOut, false);
});

test('runProcess executes async command and captures output and lines', async () => {
  const lines: string[] = [];
  const res = await runProcess(
    process.execPath,
    ['-e', 'console.log("line 1"); console.log("line 2");'],
    {
      onStdoutLine: (l) => lines.push(l)
    }
  );
  assert.equal(res.exitCode, 0);
  assert.equal(res.code, 0);
  assert.deepEqual(lines, ['line 1', 'line 2']);
  assert.equal(res.timedOut, false);
});

test('runProcess terminates and rejects with ProcessExecutionError on timeout', async () => {
  await assert.rejects(
    async () => {
      await runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 5000);'], { timeoutMs: 100 });
    },
    (err: unknown) => {
      assert.ok(err instanceof ProcessExecutionError);
      assert.equal(err.timedOut, true);
      assert.ok(err.message.includes('timed out after 100ms'));
      return true;
    }
  );
});

test('runProcess rejects when AbortSignal triggers', async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort('test-abort-reason'), 50);

  await assert.rejects(
    async () => {
      await runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 5000);'], {
        signal: controller.signal
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof ProcessExecutionError);
      assert.equal(err.signal, 'SIGTERM');
      assert.ok(err.message.includes('Command aborted by signal'));
      return true;
    }
  );
});

test('runShellCommand executes command in shell and returns result', async () => {
  const res = await runShellCommand(`"${process.execPath}" -e "console.log('shell-ok')"`);
  assert.equal(res.exitCode, 0);
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), 'shell-ok');
});

test('commandExists returns true for node and false for nonexistent binary', () => {
  assert.equal(commandExists(process.execPath), true);
  assert.equal(commandExists('node'), true);
  assert.equal(commandExists('definitely-not-a-real-binary-name-xyz'), false);
  assert.equal(commandExists(''), false);
});

test('runProcess: handles stdinText and stderr lines', async () => {
  const stderrLines: string[] = [];
  const res = await runProcess(
    process.execPath,
    [
      '-e',
      'require("readline").createInterface({input:process.stdin}).on("line", l => { process.stderr.write("echo:" + l + "\\n"); });'
    ],
    {
      stdinText: 'hello stdin\n',
      onStderrLine: (l) => stderrLines.push(l)
    }
  );
  assert.equal(res.exitCode, 0);
  assert.ok(stderrLines.some((l) => l.includes('echo:hello stdin')));
});

test('runProcess: rejects immediately when signal is already aborted', async () => {
  const controller = new AbortController();
  controller.abort('pre-aborted');

  await assert.rejects(
    async () => {
      await runProcess(process.execPath, ['-v'], { signal: controller.signal });
    },
    (err: unknown) => {
      assert.ok(err instanceof ProcessExecutionError);
      assert.ok(err.message.includes('aborted before start'));
      return true;
    }
  );
});

test('runShellCommand: handles timeout and pre-aborted signal', async () => {
  const controller = new AbortController();
  controller.abort('pre-aborted-shell');

  await assert.rejects(
    async () => {
      await runShellCommand('echo test', { signal: controller.signal });
    },
    (err: unknown) => {
      assert.ok(err instanceof ProcessExecutionError);
      assert.ok(err.message.includes('aborted before start'));
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await runShellCommand(`"${process.execPath}" -e "setTimeout(()=>{}, 5000)"`, {
        timeoutMs: 100
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof ProcessExecutionError);
      assert.equal(err.timedOut, true);
      return true;
    }
  );
});
