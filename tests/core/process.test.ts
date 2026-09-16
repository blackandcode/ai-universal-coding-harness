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
  commandExists,
  normalizeSpawnArgs,
  createProcessResult
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

test('normalizeSpawnArgs routes script paths through node on Windows only', () => {
  const script = 'C:\\tmp\\mock-codex.mjs';
  const originalPlatform = process.platform;

  try {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
    const win = normalizeSpawnArgs(script, ['exec', '--help']);
    assert.equal(win.cmd, process.execPath);
    assert.deepEqual(win.args, [script, 'exec', '--help']);

    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });
    const unix = normalizeSpawnArgs('/tmp/mock-codex.mjs', ['exec', '--help']);
    assert.equal(unix.cmd, '/tmp/mock-codex.mjs');
    assert.deepEqual(unix.args, ['exec', '--help']);

    const passthrough = normalizeSpawnArgs('codex', ['exec']);
    assert.equal(passthrough.cmd, 'codex');
    assert.deepEqual(passthrough.args, ['exec']);
  } finally {
    Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform });
  }
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

test('runProcess: captures stderr-only output when stdout is empty', async () => {
  const stderrLines: string[] = [];
  const res = await runProcess(process.execPath, ['-e', 'console.error("stderr-only-line");'], {
    onStderrLine: (l) => stderrLines.push(l)
  });
  assert.equal(res.exitCode, 0);
  assert.equal(res.stdout.trim(), '');
  assert.ok(res.stderr.includes('stderr-only-line'));
  assert.deepEqual(stderrLines, ['stderr-only-line']);
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

test('runShellCommand: rejects when signal aborts during execution', async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort('aborted-during-shell'), 50);

  await assert.rejects(
    async () => {
      await runShellCommand(`"${process.execPath}" -e "setTimeout(()=>{}, 5000)"`, {
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

test('runShellCommand: captures stderr lines via onStderrLine callback', async () => {
  const stderrLines: string[] = [];
  const res = await runShellCommand(
    `"${process.execPath}" -e "console.error('shell-err-line-1'); console.error('shell-err-line-2');"`,
    {
      onStderrLine: (line) => stderrLines.push(line)
    }
  );
  assert.equal(res.exitCode, 0);
  assert.ok(stderrLines.includes('shell-err-line-1'));
  assert.ok(stderrLines.includes('shell-err-line-2'));
});

test('runProcess: rejects with ProcessExecutionError when spawn emits error (e.g. invalid path/dir)', async () => {
  await assert.rejects(
    async () => {
      await runProcess(process.cwd(), []);
    },
    (err: unknown) => {
      assert.ok(err instanceof ProcessExecutionError);
      return true;
    }
  );
});

test('runProcess: rejects with timeout when opts.timeoutMs elapses and kills child', async () => {
  await assert.rejects(
    async () => {
      await runProcess(process.execPath, ['-e', 'setTimeout(()=>{}, 5000)'], {
        timeoutMs: 50
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof ProcessExecutionError);
      assert.equal(err.timedOut, true);
      assert.match(err.message, /Command timed out after 50ms/);
      return true;
    }
  );
});

test('commandExists returns false for non-existent slash-delimited paths', () => {
  assert.equal(commandExists('./nonexistent/binary/path'), false);
  assert.equal(commandExists('/invalid/absolute/path/to/binary'), false);

  // Test createProcessResult code fallback when exitCode is null
  const nullExitRes = createProcessResult(null, 'SIGTERM', '', '', false);
  assert.equal(nullExitRes.code, 1);
});
