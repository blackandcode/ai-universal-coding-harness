/**
 * @fileoverview Regression test suite for Cursor ACP streaming protocol accumulation and observation parsing.
 *
 * Verifies that partial updates, multi-chunk tool calls, omitted rawInput on completions,
 * multi-variant exit code representations, duplicate events, and session-ID isolation
 * are handled deterministically without state corruption or false exit-code inferences.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseAcpEvents } from './CursorExecutorHarness.js';

test('acp regression: multi-chunk accumulation retains command when completion omits rawInput', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-reg-multi-'));
  const eventsFile = path.join(tmpDir, 'events.jsonl');

  try {
    const lines = [
      // Chunk 1: tool_call announced with command input
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-1","update":{"sessionUpdate":"tool_call","toolCallId":"tool_cmd_1","title":"Run","status":"pending","rawInput":{"command":"npm run check"}}}}',
      // Chunk 2: tool_call_update in progress without rawInput
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-1","update":{"sessionUpdate":"tool_call_update","toolCallId":"tool_cmd_1","status":"in_progress"}}}',
      // Chunk 3: tool_call_update completed with exit code but completely omitting rawInput
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-1","update":{"sessionUpdate":"tool_call_update","toolCallId":"tool_cmd_1","status":"completed","rawOutput":{"exitCode":0,"output":"Passed"}}}}',
    ];
    fs.writeFileSync(eventsFile, lines.join('\n') + '\n', 'utf8');

    const observed = parseAcpEvents(eventsFile, {
      runId: 'run-test',
      stageName: 'stage-03',
      attempt: 1,
    });

    assert.equal(observed.length, 1);
    assert.equal(observed[0].tool_call_id, 'tool_cmd_1');
    assert.equal(observed[0].command, 'npm run check');
    assert.equal(observed[0].status, 'completed');
    assert.equal(observed[0].exit_code, 0);
    assert.equal(observed[0].command_confidence, 'high');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('acp regression: empty partial update does not erase previously accumulated state', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-reg-empty-'));
  const eventsFile = path.join(tmpDir, 'events.jsonl');

  try {
    const lines = [
      // Chunk 1: full payload
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Run","kind":"execute","status":"in_progress","rawInput":{"command":"git diff --check"},"rawOutput":{}}}}',
      // Chunk 2: completely empty object in update
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call_update","toolCallId":"t1"}}}',
      // Chunk 3: output only
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call_update","toolCallId":"t1","status":"completed","rawOutput":{"code":0}}}}',
    ];
    fs.writeFileSync(eventsFile, lines.join('\n') + '\n', 'utf8');

    const observed = parseAcpEvents(eventsFile);
    assert.equal(observed.length, 1);
    assert.equal(observed[0].command, 'git diff --check');
    assert.equal(observed[0].exit_code, 0);
    assert.equal(observed[0].status, 'completed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('acp regression: completed status without numeric exit code never infers exit 0', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-reg-noexit-'));
  const eventsFile = path.join(tmpDir, 'events.jsonl');

  try {
    const lines = [
      // Completed tool with no exitCode, exit_code, or code in rawOutput
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t_unknown","title":"Run","status":"completed","rawInput":{"command":"npm test"},"rawOutput":{"output":"Some output without exit code"}}}}',
    ];
    fs.writeFileSync(eventsFile, lines.join('\n') + '\n', 'utf8');

    const observed = parseAcpEvents(eventsFile);
    assert.equal(observed.length, 1);
    assert.equal(observed[0].command, 'npm test');
    assert.equal(observed[0].status, 'completed');
    assert.equal(observed[0].exit_code, null, 'Must NOT infer 0 from completed status');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('acp regression: failed or error status without numeric exit code defaults to exit code 1', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-reg-failed-'));
  const eventsFile = path.join(tmpDir, 'events.jsonl');

  try {
    const lines = [
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t_err","title":"Run","status":"failed","rawInput":{"command":"npm run build"},"rawOutput":{"error":"Process failed"}}}}',
    ];
    fs.writeFileSync(eventsFile, lines.join('\n') + '\n', 'utf8');

    const observed = parseAcpEvents(eventsFile);
    assert.equal(observed.length, 1);
    assert.equal(observed[0].command, 'npm run build');
    assert.equal(observed[0].status, 'failed');
    assert.equal(observed[0].exit_code, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('acp regression: duplicate events deduplicate cleanly across replays', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-reg-dedup-'));
  const eventsFile = path.join(tmpDir, 'events.jsonl');

  try {
    const lines = [
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-1","update":{"sessionUpdate":"tool_call","toolCallId":"tool-dup","title":"Run","status":"completed","rawInput":{"command":"npm test"},"rawOutput":{"exitCode":0}}}}',
      // Exact duplicate event
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-1","update":{"sessionUpdate":"tool_call","toolCallId":"tool-dup","title":"Run","status":"completed","rawInput":{"command":"npm test"},"rawOutput":{"exitCode":0}}}}',
    ];
    fs.writeFileSync(eventsFile, lines.join('\n') + '\n', 'utf8');

    const observed = parseAcpEvents(eventsFile);
    assert.equal(
      observed.length,
      1,
      'Duplicate events for identical session and toolCallId must produce 1 observation',
    );
    assert.equal(observed[0].exit_code, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('acp regression: session ID collision protection keeps distinct observations for same toolCallId in different sessions', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-reg-collision-'));
  const eventsFile = path.join(tmpDir, 'events.jsonl');

  try {
    const lines = [
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-A","update":{"sessionUpdate":"tool_call","toolCallId":"tool-1","title":"Run","status":"completed","rawInput":{"command":"cmd-A"},"rawOutput":{"exitCode":0}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-B","update":{"sessionUpdate":"tool_call","toolCallId":"tool-1","title":"Run","status":"completed","rawInput":{"command":"cmd-B"},"rawOutput":{"exitCode":0}}}}',
    ];
    fs.writeFileSync(eventsFile, lines.join('\n') + '\n', 'utf8');

    const observed = parseAcpEvents(eventsFile);
    assert.equal(
      observed.length,
      2,
      'Different sessions sharing toolCallId must remain distinct observations',
    );
    assert.equal(observed[0].session_id, 'sess-A');
    assert.equal(observed[0].command, 'cmd-A');
    assert.equal(observed[1].session_id, 'sess-B');
    assert.equal(observed[1].command, 'cmd-B');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('acp regression: self-contained sanitized Stage 07 protocol stream extracts passing quality checks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-reg-sanitized-'));
  const eventsFile = path.join(tmpDir, 'sanitized-stage-07.jsonl');

  try {
    const lines = [
      'SERVER {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"stage07-sess","update":{"sessionUpdate":"tool_call","toolCallId":"call-1","title":"`npm run lint`","status":"in_progress","rawInput":{"command":"npm run lint"}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"stage07-sess","update":{"sessionUpdate":"tool_call_update","toolCallId":"call-1","status":"completed","rawOutput":{"code":0,"stdout":"All files pass linting."}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"stage07-sess","update":{"sessionUpdate":"tool_call","toolCallId":"call-2","title":"Run `npm run check`","status":"in_progress","rawInput":{"command":"npm run check"}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"stage07-sess","update":{"sessionUpdate":"tool_call_update","toolCallId":"call-2","status":"completed","rawOutput":{"exitCode":0,"stdout":"0 errors found."}}}}',
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"stage07-sess","update":{"sessionUpdate":"tool_call","toolCallId":"call-3","title":"`git diff --check`","status":"completed","rawInput":{"cmd":"git diff --check"},"rawOutput":{"exit_code":0}}}}',
    ];
    fs.writeFileSync(eventsFile, lines.join('\n') + '\n', 'utf8');

    const observed = parseAcpEvents(eventsFile, {
      stageName: 'stage-07',
      runId: 'sanitized-run',
      attempt: 1,
    });

    assert.equal(observed.length, 3);
    const checkObs = observed.find((o) => o.command === 'npm run check');
    assert.ok(checkObs, 'Must extract npm run check');
    assert.equal(checkObs.exit_code, 0);

    const diffCheckObs = observed.find((o) => o.command === 'git diff --check');
    assert.ok(diffCheckObs, 'Must extract git diff --check');
    assert.equal(diffCheckObs.exit_code, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
