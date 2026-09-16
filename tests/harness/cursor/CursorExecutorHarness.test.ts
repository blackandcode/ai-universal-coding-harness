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
import { AcpToolAccumulator } from '../../../src/harness/cursor/AcpToolAccumulator.js';
import { ObservationJournal } from '../../../src/harness/cursor/ObservationJournal.js';
import { EventBus } from '../../../src/ui/EventBus.js';

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

function createMockCursorBinary(tmpDir: string): string {
  const scriptPath = path.join(tmpDir, 'mock-cursor-agent.mjs');
  const scriptContent = `#!/usr/bin/env node
import readline from 'node:readline';

const args = process.argv.slice(2);
if (args[0] === 'models') {
  if (process.env.TEST_CURSOR_MODELS === 'none') {
    console.log('other-unrelated-model');
  } else {
    console.log('gemini-3.8-flash\\nclaude-3.5-sonnet');
  }
  process.exit(0);
}

if (args.includes('acp')) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg.method === 'initialize') {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          agentCapabilities: { loadSession: true }
        }
      }));
      return;
    }

    if (msg.method === 'authenticate') {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {}
      }));
      return;
    }

    if (msg.method === 'session/new' || msg.method === 'session/load') {
      const isLoad = msg.method === 'session/load';
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          sessionId: isLoad ? msg.params?.sessionId : 'mock-sess-1',
          configOptions: [{ id: 'thinking', options: [{ value: 'high' }] }]
        }
      }));
      return;
    }

    if (msg.method === 'session/set_config_option' || msg.method === 'session/set_mode') {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {}
      }));
      return;
    }

    if (msg.method === 'session/prompt') {
      const promptText = msg.params?.prompt?.[0]?.text || '';
      if (promptText === 'trigger-plan') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 100,
          method: 'cursor/create_plan',
          params: { name: 'plan-01', plan: 'Step 1: Test plan' }
        }));
      } else if (promptText === 'trigger-empty-plan') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 101,
          method: 'cursor/create_plan',
          params: { name: 'empty-plan', plan: '' }
        }));
      } else if (promptText === 'trigger-question') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 102,
          method: 'cursor/ask_question',
          params: { title: 'Q', questions: [{ prompt: 'Which option?' }] }
        }));
      } else if (promptText === 'trigger-replan') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 105,
          method: 'cursor/create_plan',
          params: { name: 'plan-replan', plan: 'Plan needing changes' }
        }));
      } else if (promptText === 'trigger-question-err') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 106,
          method: 'cursor/ask_question',
          params: { title: 'Q err', questions: [{ prompt: 'Question throwing' }] }
        }));
      } else if (promptText === 'trigger-perm-err') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 107,
          method: 'session/request_permission',
          params: {
            toolCall: { rawInput: { command: 'perm throwing' } },
            options: [{ optionId: 'opt-deny', name: 'reject' }]
          }
        }));
      } else if (promptText === 'trigger-permission-allow') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 103,
          method: 'session/request_permission',
          params: {
            toolCall: { rawInput: { command: 'echo perm-ok' } },
            options: [
              { optionId: 'opt-allow', name: 'allow_once' },
              { optionId: 'opt-deny', name: 'reject' }
            ]
          }
        }));
      } else if (promptText === 'trigger-permission-broker') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 104,
          method: 'session/request_permission',
          params: {
            toolCall: { rawInput: { command: 'echo broker-executed' } },
            options: [{ optionId: 'opt-deny-only', name: 'reject' }]
          }
        }));
        setTimeout(() => {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { status: 'completed' }
          }));
        }, 150);
        return;
      } else {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 'mock-sess-1',
            update: { sessionUpdate: 'agent_thought_chunk', content: { text: 'Thinking...' } }
          }
        }));
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 'mock-sess-1',
            update: { sessionUpdate: 'agent_message_chunk', content: { text: 'Done.' } }
          }
        }));
      }

      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: { status: 'completed' }
      }));
      return;
    }

    if (msg.method === 'session/cancel') {
      return;
    }
  });

  rl.on('close', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}
`;
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
  return scriptPath;
}

test('CursorExecutorHarness: preflight succeeds when model available and fails when missing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-preflight-test-'));
  const mockBinary = createMockCursorBinary(tmpDir);

  try {
    delete process.env.TEST_CURSOR_MODELS;
    const okHarness = new CursorExecutorHarness({
      executorBinary: mockBinary,
      executorModel: 'gemini-3.8-flash'
    });
    const okResult = await okHarness.preflight();
    assert.equal(okResult.ok, true);

    process.env.TEST_CURSOR_MODELS = 'none';
    const missingHarness = new CursorExecutorHarness({
      executorBinary: mockBinary,
      executorModel: 'gemini-3.8-flash'
    });
    const missingResult = await missingHarness.preflight();
    assert.equal(missingResult.ok, false);
    assert.ok(missingResult.details.some((d) => d.includes('not available')));
  } finally {
    delete process.env.TEST_CURSOR_MODELS;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CursorExecutorHarness: creates session and manages interactive ACP callbacks and broker fallback', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-session-lifecycle-'));
  const mockBinary = createMockCursorBinary(tmpDir);
  const eventsBus = new EventBus(path.join(tmpDir, 'bus-events.jsonl'), true);

  const planDecisions: string[] = [];
  const questionsAnswered: string[] = [];
  const permissionsGranted: string[] = [];

  const harness = new CursorExecutorHarness({
    executorBinary: mockBinary,
    executorModel: 'gemini-3.8-flash',
    events: eventsBus
  });

  try {
    const session = await harness.createSession({
      workspace: tmpDir,
      runLog: path.join(tmpDir, 'run.log'),
      eventsFile: path.join(tmpDir, 'events.jsonl'),
      focusFile: path.join(tmpDir, 'focus.txt'),
      stageName: 'stage-01',
      attempt: 1,
      callbacks: {
        onPlan: async (plan: string) => {
          planDecisions.push(plan);
          if (plan.includes('needing changes')) {
            return {
              accepted: false,
              status: 'REPLAN',
              feedback: 'Please add X',
              verdict: { summary: 'Needs X' }
            };
          }
          return { accepted: true, status: 'APPROVE', verdict: { summary: 'Plan ok' } };
        },
        onQuestion: async (p: { questions?: Array<{ prompt: string }> }) => {
          const prompt = p.questions?.[0]?.prompt || '';
          if (prompt.includes('throwing')) {
            throw new Error('Question resolution failed');
          }
          questionsAnswered.push(prompt);
          return {
            answers: [{ questionId: 'q', selectedOptionIds: ['opt-1'] }],
            rationale: 'Reasoning'
          };
        },
        onPermission: async (req: { command: string }) => {
          if (req.command.includes('throwing')) {
            throw new Error('Permission classifier exploded');
          }
          permissionsGranted.push(req.command);
          return { allow: true, reason: 'Allowed' };
        }
      }
    });

    // 1. setMode
    await session.setMode('plan');
    await session.setMode('agent');

    // 2. Normal prompt with streaming chunks
    const normalResult = await session.prompt('Say hello');
    assert.ok(normalResult.text.includes('Done.'));
    assert.ok(fs.existsSync(path.join(tmpDir, 'focus.txt')));

    // 3. Trigger plan request
    await session.prompt('trigger-plan');
    assert.ok(planDecisions.some((p) => p.includes('Test plan')));

    // 4. Trigger empty plan and replan
    await session.prompt('trigger-empty-plan');
    await session.prompt('trigger-replan');

    // 5. Trigger question and question error
    await session.prompt('trigger-question');
    assert.ok(questionsAnswered.length > 0);
    await session.prompt('trigger-question-err');

    // 6. Trigger permission allow and permission error
    await session.prompt('trigger-permission-allow');
    assert.ok(permissionsGranted.includes('echo perm-ok'));
    await session.prompt('trigger-perm-err');

    // 7. Trigger permission broker fallback
    await session.prompt('trigger-permission-broker');
    assert.ok(permissionsGranted.includes('echo broker-executed'));

    // Verify command was observed in journal
    const observed = session.observedCommands();
    assert.ok(observed.some((o) => o.command.includes('broker-executed')));

    await session.cancel();
    await session.stop();

    // 8. Resume session test and historical event replay
    const resumedSession = await harness.createSession({
      workspace: tmpDir,
      runLog: path.join(tmpDir, 'run.log'),
      eventsFile: path.join(tmpDir, 'events.jsonl'),
      focusFile: path.join(tmpDir, 'focus.txt'),
      resumeSessionId: 'resumed-sess-99',
      callbacks: {
        onPlan: async () => ({ accepted: true }),
        onQuestion: async () => ({ answers: [], rationale: '' }),
        onPermission: async () => ({ allow: true, reason: '' })
      }
    });
    assert.equal(resumedSession.id, 'resumed-sess-99');
    await resumedSession.stop();
  } finally {
    eventsBus.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AcpToolAccumulator and ObservationJournal: unit test methods and persistence', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-journal-test-'));
  const journalFile = path.join(tmpDir, 'journal.jsonl');

  try {
    const acc = new AcpToolAccumulator();
    assert.equal(acc.stepSequence(10), 10);
    assert.equal(acc.currentSequence(), 10);
    assert.equal(acc.lastMutationSeq(), 0);
    acc.markMutation(8);
    assert.equal(acc.lastMutationSeq(), 8);
    acc.markMutation();
    assert.equal(acc.lastMutationSeq(), 10);

    const journal = new ObservationJournal(journalFile);
    journal.record({
      observation_id: 'obs-1',
      session_id: 's1',
      tool_id: 't1',
      tool_call_id: 'tc1',
      sequence: 1,
      timestamp: new Date().toISOString(),
      source: 'acp',
      command: 'npm test',
      normalized_command: 'npm test',
      command_confidence: 'high',
      status: 'completed',
      exit_code: 0
    });

    assert.equal(journal.getObservations().length, 1);
    assert.ok(fs.existsSync(journalFile));

    journal.clear();
    assert.equal(journal.getObservations().length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
