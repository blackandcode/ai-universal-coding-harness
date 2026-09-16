/**
 * @fileoverview Unit tests for CursorExecutorHarness and ACP session processing.
 * Tests ACP event stream accumulation, exit code extraction, preflight validation, and session management.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseAcpEvents,
  CursorExecutorHarness,
  CursorAcpSession
} from '../../../src/harness/cursor/CursorExecutorHarness.js';

test('parseAcpEvents accumulates state across multi-chunk tool calls', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-'));
  const eventsFile = path.join(tmpDir, 'test-acp.jsonl');

  try {
    const lines = [
      'CLIENT {"jsonrpc":"2.0","id":1,"method":"session/prompt","params":{"prompt":[{"type":"text","text":"run quality"}]}}',
      // Chunk 1: tool_call announced with command input
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-1","update":{"sessionUpdate":"tool_call","toolCallId":"tool_cmd_1","title":"`npm run check`","status":"pending","rawInput":{"command":"npm run check"}}}}',
      // Chunk 2: tool_call_update in progress (rawInput omitted by ACP stream)
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-1","update":{"sessionUpdate":"tool_call_update","toolCallId":"tool_cmd_1","status":"in_progress"}}}',
      // Chunk 3: tool_call_update completed with exitCode
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-1","update":{"sessionUpdate":"tool_call_update","toolCallId":"tool_cmd_1","status":"completed","rawOutput":{"exitCode":0,"output":"All passed"}}}}'
    ];
    fs.writeFileSync(eventsFile, lines.join('\n') + '\n', 'utf8');

    const observed = parseAcpEvents(eventsFile, {
      runId: 'run-1',
      stageName: 'stage-01',
      attempt: 1
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

test('parseAcpEvents extracts exit codes from various key formats', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-keys-'));
  const eventsFile = path.join(tmpDir, 'test-keys-acp.jsonl');

  try {
    const lines = [
      // code
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Run","status":"completed","rawInput":{"command":"cmd1"},"rawOutput":{"code":0}}}}',
      // exit_code
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t2","title":"Run","status":"completed","rawInput":{"command":"cmd2"},"rawOutput":{"exit_code":0}}}}',
      // failed status fallback
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t3","title":"Run","status":"failed","rawInput":{"command":"cmd3"},"rawOutput":{}}}}'
    ];
    fs.writeFileSync(eventsFile, lines.join('\n') + '\n', 'utf8');

    const observed = parseAcpEvents(eventsFile);
    assert.equal(observed.length, 3);
    assert.equal(observed[0].exit_code, 0);
    assert.equal(observed[1].exit_code, 0);
    assert.equal(observed[2].exit_code, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('parseAcpEvents extracts commands from backtick titles when rawInput is empty', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-test-title-'));
  const eventsFile = path.join(tmpDir, 'test-title-acp.jsonl');

  try {
    const lines = [
      'SERVER {"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1","update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"`git diff --check`","status":"completed","rawInput":{},"rawOutput":{"exitCode":0}}}}'
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

test('parseAcpEvents correctly parses Stage 07 real-world fixture', () => {
  const realStage07Log =
    '/home/black/workspace/wp-plugins-development/wordpress-empower-redirector/.ai-orchestrator/runs/20260915T130020Z-3a5689/stages/stage-07-quality-improvement-ip-rules-and-denial-destination-usability/executor-acp.jsonl';
  if (!fs.existsSync(realStage07Log)) {
    return; // Skip if external repo log not present in current environment
  }

  const observed = parseAcpEvents(realStage07Log, {
    stageName: 'stage-07-quality-improvement-ip-rules-and-denial-destination-usability'
  });

  assert.ok(observed.length > 0, 'Should extract observations from real Stage 07 ACP log');
  const checkCmd = observed.find((o) => o.command.includes('npm run check'));
  assert.ok(checkCmd, 'Should find npm run check');
  // Check that the latest completed npm run check has exit code 0
  const completedChecks = observed.filter(
    (o) => o.command.includes('npm run check') && o.status === 'completed'
  );
  assert.ok(completedChecks.length > 0, 'Should have completed npm run check');
  const latestCheck = completedChecks[completedChecks.length - 1];
  assert.equal(latestCheck.exit_code, 0);

  const allDiffChecks = observed.filter(
    (o) => o.command.includes('git diff --check') && o.status === 'completed'
  );
  assert.ok(allDiffChecks.length > 0, 'Should find completed git diff --check');
  const latestDiffCheck = allDiffChecks[allDiffChecks.length - 1];
  assert.equal(latestDiffCheck.exit_code, 0);
});

test('CursorExecutorHarness: configures harness info and performs preflight check', async () => {
  const harness = new CursorExecutorHarness({
    executorBinary: 'nonexistent-binary-cursor-test-xyz',
    executorModel: 'custom-model'
  });
  assert.equal(harness.info.id, 'cursor');
  assert.equal(harness.info.role, 'executor');
  assert.equal(harness.info.model, 'custom-model');

  const preflight = await harness.preflight();
  assert.equal(preflight.ok, false);
  assert.ok(preflight.details.some((d) => d.includes('not found')));
});

test('CursorAcpSession: creates session and manages state and epochs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-session-test-'));
  try {
    const session = new CursorAcpSession({
      workspace: tmpDir,
      runLog: path.join(tmpDir, 'run.log'),
      eventsFile: path.join(tmpDir, 'events.jsonl'),
      focusFile: path.join(tmpDir, 'focus.txt'),
      callbacks: {
        onPlan: async () => ({ outcome: 'accepted', accepted: true, status: 'APPROVE' }),
        onQuestion: async () => ({ answers: [], rationale: '' }),
        onPermission: async () => ({ allow: true, reason: '' })
      },
      binary: 'dummy',
      model: 'model',
      thinking: 'high',
      turnTimeoutMinutes: 10,
      events: null,
      stageName: 'stage-01',
      attempt: 1
    });

    assert.equal(session.currentSequence(), 0);
    assert.equal(session.lastMutationSeq(), 0);
    assert.deepEqual(session.observedCommands(), []);

    // Sets quality epoch without error
    session.setQualityEpoch('epoch-1');
    assert.equal(session.currentSequence(), 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
