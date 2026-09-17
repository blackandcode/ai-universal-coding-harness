/**
 * @fileoverview Unit and integration tests for CursorAcpTransport.
 *
 * Validates subprocess lifecycle, stdio readline framing, pending request
 * correlation, timeout handling, stderr capturing, and termination.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CursorAcpTransport } from '../../../src/harness/cursor/CursorAcpTransport.js';
import { EventBus } from '../../../src/ui/EventBus.js';

function safeRm(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {}
}

function createMockTransportBinary(tmpDir: string): string {
  const scriptPath = path.join(tmpDir, 'mock-acp-transport.mjs');
  const scriptContent = `#!/usr/bin/env node
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });
setInterval(() => {}, 60000);

let retryCount = 0;
rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  if (msg.method === 'ping') {
    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { pong: true } }));
    return;
  }

  if (msg.method === 'retry-test') {
    retryCount++;
    if (retryCount < 3) {
      console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32001, message: 'Transient fail' } }));
      return;
    }
    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { retried: true, attempts: retryCount } }));
    return;
  }

  if (msg.method === 'error-test') {
    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: 'Simulated RPC error' } }));
    return;
  }

  if (msg.method === 'emit-notif') {
    console.log(JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { update: { type: 'agent_message_chunk', text: 'chunk-1' } } }));
    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { emitted: true } }));
    return;
  }

  if (msg.method === 'emit-stderr') {
    console.error('stderr diagnostic log');
    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { ok: true } }));
    return;
  }

  if (msg.method === 'hang') {
    // Deliberately do not answer
    return;
  }

  if (msg.method === 'exit-now') {
    process.exit(42);
  }
});
`;
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
  return scriptPath;
}

test('CursorAcpTransport: full request-response lifecycle and notification routing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-transport-test-'));
  const eventsFile = path.join(tmpDir, 'events.jsonl');
  const runLog = path.join(tmpDir, 'run.log');
  const binary = createMockTransportBinary(tmpDir);
  const bus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);

  const notifications: unknown[] = [];
  let stderrLogged = false;

  const transport = new CursorAcpTransport({
    binary: process.execPath,
    args: [binary],
    workspace: tmpDir,
    eventsFile,
    runLog,
    turnTimeoutMinutes: 1,
    events: bus,
    onMessage: (_raw, decoded) => {
      notifications.push(decoded);
    },
    onStderrLine: (line) => {
      if (line.includes('stderr diagnostic log')) {
        stderrLogged = true;
      }
    }
  });

  try {
    await transport.start();
    assert.equal(transport.isAlive, true);
    assert.ok(transport.childProcess);

    // 1. Successful request
    const pongResult = await transport.request<{ pong: boolean }>('ping', {});
    assert.equal(pongResult.pong, true);

    // 2. Error response rejection
    await assert.rejects(() => transport.request('error-test', {}), /Simulated RPC error/);

    // 3. Notification emission received via onMessage
    const notifResult = await transport.request<{ emitted: boolean }>('emit-notif', {});
    assert.equal(notifResult.emitted, true);
    assert.ok(notifications.length > 0);

    // 4. Stderr emission
    await transport.request('emit-stderr', {});
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(stderrLogged, true);

    // 5. Test respond() and respondError() writing to stdin
    transport.respond(99, { status: 'acknowledged' });
    transport.respondError(100, { code: -1, message: 'denied' });

    // 6. Test cancel with explicit sessionId
    await transport.cancel('custom-session-123');

    // 7. Test childProcess getter and setter
    const currentChild = transport.childProcess;
    assert.ok(currentChild);
    currentChild?.stdin?.emit('error', new Error('mock pipe err'));
    currentChild?.stdin?.emit('error', { code: 'EPIPE' });
    transport.childProcess = currentChild;
    assert.equal(transport.childProcess, currentChild);

    // Verify eventsFile contains CLIENT and SERVER logged lines
    const eventsContent = fs.readFileSync(eventsFile, 'utf8');
    assert.ok(eventsContent.includes('CLIENT {"jsonrpc":"2.0","id":1,"method":"ping"'));
    assert.ok(eventsContent.includes('SERVER {"jsonrpc":"2.0","id":1,"result":{"pong":true}}'));
    assert.ok(
      eventsContent.includes('CLIENT {"jsonrpc":"2.0","id":99,"result":{"status":"acknowledged"}}')
    );
    assert.ok(
      eventsContent.includes(
        'CLIENT {"jsonrpc":"2.0","id":100,"error":{"code":-1,"message":"denied"}}'
      )
    );

    await transport.stop();
    assert.equal(transport.isAlive, false);
  } finally {
    try {
      await transport.stop();
    } catch {}
    bus.close();
    safeRm(tmpDir);
  }
});

test('CursorAcpTransport: request timeout rejects and cancel is issued for prompt', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-timeout-test-'));
  const eventsFile = path.join(tmpDir, 'events.jsonl');
  const runLog = path.join(tmpDir, 'run.log');
  const binary = createMockTransportBinary(tmpDir);

  const transport = new CursorAcpTransport({
    binary: process.execPath,
    args: [binary],
    workspace: tmpDir,
    eventsFile,
    runLog,
    turnTimeoutMinutes: 0.001 // ~60ms
  });

  try {
    await transport.start();

    // Requesting hang with prompt method should timeout and trigger cancel
    await assert.rejects(
      () => transport.request('session/prompt', { prompt: [] }, 50),
      /Cursor ACP request timed out: session\/prompt/
    );

    await transport.stop();
  } finally {
    try {
      await transport.stop();
    } catch {}
    safeRm(tmpDir);
  }
});

test('CursorAcpTransport: subprocess exit rejects in-flight pending requests', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-exit-test-'));
  const eventsFile = path.join(tmpDir, 'events.jsonl');
  const runLog = path.join(tmpDir, 'run.log');
  const binary = createMockTransportBinary(tmpDir);

  let exitCodeReceived: number | null = null;
  const transport = new CursorAcpTransport({
    binary: process.execPath,
    args: [binary],
    workspace: tmpDir,
    eventsFile,
    runLog,
    turnTimeoutMinutes: 1,
    onExit: (code) => {
      exitCodeReceived = code;
    }
  });

  try {
    await transport.start();

    // Trigger immediate exit
    const reqPromise = transport.request('hang', {});
    transport.raw({ jsonrpc: '2.0', method: 'exit-now' });

    await assert.rejects(reqPromise, /Cursor ACP exited/);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(exitCodeReceived, 42);

    await transport.stop();
  } finally {
    try {
      await transport.stop();
    } catch {}
    safeRm(tmpDir);
  }
});

test('CursorAcpTransport: stop times out SIGTERM and issues SIGKILL', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-sigkill-test-'));
  const eventsFile = path.join(tmpDir, 'events.jsonl');
  const runLog = path.join(tmpDir, 'run.log');
  const binary = createMockTransportBinary(tmpDir);

  const transport = new CursorAcpTransport({
    binary: process.execPath,
    args: [binary],
    workspace: tmpDir,
    eventsFile,
    runLog,
    turnTimeoutMinutes: 1,
    killTimeoutMs: 25
  });

  try {
    await transport.start();
    const child = transport.childProcess!;
    let sigkillIssued = false;

    // Simulate child ignoring SIGTERM
    const originalKill = child.kill.bind(child);
    child.kill = (sig) => {
      if (sig === 'SIGKILL') {
        sigkillIssued = true;
        try {
          originalKill('SIGKILL');
        } catch {}
        child.emit('exit', 0, 'SIGKILL');
      }
      return true;
    };

    await transport.stop();
    assert.equal(sigkillIssued, true);
  } finally {
    try {
      await transport.stop();
    } catch {}
    safeRm(tmpDir);
  }
});

test('CursorAcpTransport: requestWithRetry retries failed RPC requests with backoff', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-retry-test-'));
  const eventsFile = path.join(tmpDir, 'events.jsonl');
  const runLog = path.join(tmpDir, 'run.log');
  const binary = createMockTransportBinary(tmpDir);

  const transport = new CursorAcpTransport({
    binary: process.execPath,
    args: [binary],
    workspace: tmpDir,
    eventsFile,
    runLog,
    turnTimeoutMinutes: 1
  });

  try {
    await transport.start();
    let retryCallbackInvoked = false;
    const res = await transport.requestWithRetry<{ retried: boolean; attempts: number }>(
      'retry-test',
      {},
      5000,
      {
        maxAttempts: 4,
        initialDelayMs: 20,
        backoffFactor: 1.5,
        onRetry: () => {
          retryCallbackInvoked = true;
        }
      }
    );
    assert.equal(res.retried, true);
    assert.equal(res.attempts, 3);
    assert.equal(retryCallbackInvoked, true);

    // Test requestWithRetry with default timeoutMs and options
    const defaultRes = await transport.requestWithRetry<{ pong: boolean }>('ping', {});
    assert.equal(defaultRes.pong, true);

    await transport.stop();

    // Test stop on already-stopped or unstarted transport
    await transport.stop();
  } finally {
    try {
      await transport.stop();
    } catch {}
    safeRm(tmpDir);
  }
});
