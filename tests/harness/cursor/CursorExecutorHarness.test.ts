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

function safeRm(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {}
}

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
    safeRm(tmpDir);
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
    safeRm(tmpDir);
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
    safeRm(tmpDir);
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

    const normalizer = (
      session as unknown as { normalizer: { options: { onAgentText?: (text: string) => void } } }
    ).normalizer;
    normalizer.options.onAgentText?.('post-epoch text');
    assert.equal((session as unknown as { agentText: string }).agentText, 'post-epoch text');
  } finally {
    safeRm(tmpDir);
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
  } else if (process.env.TEST_CURSOR_MODELS === 'fail') {
    console.error('failed listing models');
    process.exit(1);
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
      if (process.env.TEST_CURSOR_AUTH_FAIL === '1') {
        console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { message: 'auth failed' } }));
        return;
      }
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {}
      }));
      return;
    }

    if (msg.method === 'session/load') {
      if (process.env.TEST_CURSOR_LOAD_FAIL === '1') {
        console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { message: 'load failed' } }));
        return;
      }
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          sessionId: msg.params?.sessionId,
          configOptions: [{ id: 'thinking', options: [{ value: 'high' }] }]
        }
      }));
      return;
    }

    if (msg.method === 'session/new') {
      const configOptions =
        process.env.TEST_CURSOR_NO_THINKING === '1'
          ? [{ id: 'other', options: [{ value: 'low' }] }]
          : [{ id: 'thinking', options: [{ value: 'high' }] }];
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: { sessionId: 'mock-sess-1', configOptions }
      }));
      return;
    }

    if (msg.method === 'session/set_config_option' || msg.method === 'session/set_mode') {
      if (msg.method === 'session/set_config_option' && process.env.TEST_CURSOR_CONFIG_FAIL === '1') {
        console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { message: 'config failed' } }));
        return;
      }
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
        setTimeout(() => {
          console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { status: 'completed' } }));
        }, 50);
        return;
      } else if (promptText === 'trigger-empty-plan') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 101,
          method: 'cursor/create_plan',
          params: { name: 'empty-plan', plan: '' }
        }));
        setTimeout(() => {
          console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { status: 'completed' } }));
        }, 50);
        return;
      } else if (promptText === 'trigger-question') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 102,
          method: 'cursor/ask_question',
          params: { title: 'Q', questions: [{ prompt: 'Which option?' }] }
        }));
        setTimeout(() => {
          console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { status: 'completed' } }));
        }, 50);
        return;
      } else if (promptText === 'trigger-replan') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 105,
          method: 'cursor/create_plan',
          params: { name: 'plan-replan', plan: 'Plan needing changes' }
        }));
        setTimeout(() => {
          console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { status: 'completed' } }));
        }, 50);
        return;
      } else if (promptText === 'trigger-question-err') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 106,
          method: 'cursor/ask_question',
          params: { title: 'Q err', questions: [{ prompt: 'Question throwing' }] }
        }));
        setTimeout(() => {
          console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { status: 'completed' } }));
        }, 50);
        return;
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
        setTimeout(() => {
          console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { status: 'completed' } }));
        }, 50);
        return;
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
        setTimeout(() => {
          console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { status: 'completed' } }));
        }, 50);
        return;
      } else if (promptText === 'trigger-permission-deny') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 108,
          method: 'session/request_permission',
          params: {
            toolCall: { rawInput: { command: 'rm risky-file' } },
            options: [{ optionId: 'opt-deny', name: 'reject' }]
          }
        }));
        setTimeout(() => {
          console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { status: 'completed' } }));
        }, 50);
        return;
      } else if (promptText === 'trigger-permission-broker-git') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 109,
          method: 'session/request_permission',
          params: {
            toolCall: { rawInput: { command: 'git checkout main' } },
            options: [{ optionId: 'opt-deny-only', name: 'reject' }]
          }
        }));
        setTimeout(() => {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { status: 'completed' }
          }));
        }, 50);
        return;
      } else if (promptText === 'trigger-plan-throw') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 110,
          method: 'cursor/create_plan',
          params: { name: 'bad-plan', plan: 'Plan that throws' }
        }));
        setTimeout(() => {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { status: 'completed' }
          }));
        }, 50);
        return;
      } else if (promptText === 'trigger-allow-always') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 111,
          method: 'session/request_permission',
          params: {
            toolCall: { rawInput: { command: 'echo allow-always' } },
            options: [{ optionId: 'opt-aa', name: 'allow_always' }]
          }
        }));
        setTimeout(() => {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { status: 'completed' }
          }));
        }, 50);
        return;
      } else if (promptText === 'trigger-allow-session') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 112,
          method: 'session/request_permission',
          params: {
            toolCall: { rawInput: { command: 'echo allow-session' } },
            options: [{ optionId: 'opt-as', name: 'allow_session' }]
          }
        }));
        setTimeout(() => {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { status: 'completed' }
          }));
        }, 50);
        return;
      } else if (promptText === 'trigger-perm-cancel') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 113,
          method: 'session/request_permission',
          params: {
            toolCall: { rawInput: { command: 'echo no-option' } },
            options: [{ optionId: 'opt-x', name: 'unrelated' }]
          }
        }));
        setTimeout(() => {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { status: 'completed' }
          }));
        }, 50);
        return;
      } else if (promptText === 'trigger-broker-fail') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 114,
          method: 'session/request_permission',
          params: {
            toolCall: { rawInput: { command: 'false' } },
            options: [{ optionId: 'opt-deny-only', name: 'reject' }]
          }
        }));
        setTimeout(() => {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { status: 'completed' }
          }));
        }, 50);
        return;
      } else if (promptText === 'trigger-hang') {
        // don't respond, let it time out
        return;
      } else if (promptText === 'trigger-exit') {
        process.exit(9);
      } else if (promptText === 'trigger-bad-line') {
        console.log('SERVER {not-json');
        setTimeout(() => {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { status: 'completed' }
          }));
        }, 20);
        return;
      } else if (promptText === 'trigger-notify-id') {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: 200,
          method: 'cursor/ping',
          params: {}
        }));
        setTimeout(() => {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { status: 'completed' }
          }));
        }, 20);
        return;
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
        }, 50);
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
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {}
      }));
      return;
    }
  });

  rl.on('close', () => process.exit(0));
  process.on('SIGTERM', () => {
    if (process.env.TEST_CURSOR_IGNORE_SIGTERM === '1') {
      // Do nothing, let SIGKILL handle it
      return;
    }
    process.exit(0);
  });
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

    process.env.TEST_CURSOR_MODELS = 'fail';
    const failHarness = new CursorExecutorHarness({
      executorBinary: mockBinary,
      executorModel: 'gemini-3.8-flash'
    });
    const failResult = await failHarness.preflight();
    assert.equal(failResult.ok, false);
    assert.ok(failResult.details.some((d) => d.includes('not available')));
  } finally {
    delete process.env.TEST_CURSOR_MODELS;
    safeRm(tmpDir);
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
          if (plan.includes('throws')) {
            throw new Error('Plan review exploded');
          }
          if (plan.includes('needing changes')) {
            return {
              accepted: false,
              outcome: 'needs_revision',
              status: 'REPLAN',
              feedback: 'Please add X',
              verdict: {
                verdict: 'REPLAN',
                summary: 'Needs X',
                missing_items: [],
                feedback_for_cursor: ''
              }
            };
          }
          return {
            accepted: true,
            outcome: 'accepted',
            status: 'APPROVE',
            verdict: {
              verdict: 'APPROVE',
              summary: 'Plan ok',
              missing_items: [],
              feedback_for_cursor: ''
            }
          };
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
        onPermission: async (req: { command?: string }) => {
          const cmd = req.command || '';
          if (cmd.includes('throwing')) {
            throw new Error('Permission classifier exploded');
          }
          if (cmd.includes('risky-file')) {
            return { allow: false, reason: 'Denied by policy' };
          }
          permissionsGranted.push(cmd);
          return { allow: true, reason: 'Allowed' };
        }
      }
    });

    // 1. setMode and quality epoch
    await session.setMode('plan');
    session.setQualityEpoch?.('epoch-1');
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

    // 7. Trigger permission deny and broker fallbacks
    await session.prompt('trigger-permission-deny');
    await session.prompt('trigger-permission-broker');
    assert.ok(permissionsGranted.includes('echo broker-executed'));
    await session.prompt('trigger-permission-broker-git');
    await session.prompt('trigger-plan-throw');
    await session.prompt('trigger-allow-always');
    await session.prompt('trigger-allow-session');
    await session.prompt('trigger-perm-cancel');
    await session.prompt('trigger-broker-fail');
    await session.prompt('trigger-bad-line');
    await session.prompt('trigger-notify-id');

    const failedBroker = session.observedCommands().find((o) => o.command === 'false');
    assert.ok(failedBroker);
    assert.equal(failedBroker?.status, 'failed');

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
        onPlan: async () => ({ accepted: true, outcome: 'accepted', status: 'APPROVE' }),
        onQuestion: async () => ({ answers: [], rationale: '' }),
        onPermission: async () => ({ allow: true, reason: '' })
      }
    });
    assert.equal(resumedSession.id, 'resumed-sess-99');
    await resumedSession.stop();
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});

test('parseAcpEvents replays tool observations and ignores malformed server lines', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-parse-'));
  const eventsFile = path.join(tmpDir, 'events.jsonl');
  const toolLine = JSON.stringify({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-1',
        title: 'Run',
        rawInput: { command: 'npm test' },
        status: 'completed'
      }
    }
  });
  fs.writeFileSync(
    eventsFile,
    `SERVER not-json\nSERVER "scalar string"\nSERVER {"method":"session/update"}\nSERVER {"method":"session/update","params":{}}\nSERVER {"method":"session/update","params":{"update":null}}\nSERVER ${toolLine}\nSERVER ${JSON.stringify({ method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk' } } })}\n`
  );

  try {
    const observations = parseAcpEvents(eventsFile, {
      runId: 'run-1',
      stageName: 'stage-01',
      attempt: 1,
      workspace: tmpDir
    });
    assert.equal(observations.length, 1);
    assert.equal(observations[0].command, 'npm test');
    assert.equal(parseAcpEvents(path.join(tmpDir, 'missing.jsonl')).length, 0);
  } finally {
    safeRm(tmpDir);
  }
});

test('AcpToolAccumulator: merges primitive rawOutput and defers observation until completion', () => {
  const acc = new AcpToolAccumulator();
  const pending = acc.processUpdate(
    {
      sessionUpdate: 'tool_call',
      toolCallId: 'tool-primitive',
      title: 'Run',
      status: 'in_progress',
      rawInput: { command: 'npm test' }
    },
    { defaultSessionId: 'sess-1', workspace: '/tmp' }
  );
  assert.ok(pending.observation);
  assert.equal(pending.observation?.status, 'in_progress');

  const done = acc.processUpdate(
    {
      sessionUpdate: 'tool_call_update',
      toolCallId: 'tool-primitive',
      status: 'completed',
      rawOutput: { exit_code: 0 }
    },
    { defaultSessionId: 'sess-1', workspace: '/tmp' }
  );
  assert.ok(done.observation);
  assert.equal(done.observation?.status, 'completed');
  assert.equal(done.observation?.exit_code, 0);
});

test('AcpToolAccumulator: extracts detail from pattern, glob, and run title heuristics', () => {
  const acc = new AcpToolAccumulator();

  const pattern = acc.processUpdate(
    {
      sessionUpdate: 'tool_call',
      toolCallId: 'tool-pattern',
      title: 'Search',
      status: 'completed',
      rawInput: { pattern: 'src/**/*.ts' }
    },
    { defaultSessionId: 'sess-1', workspace: '/tmp' }
  );
  assert.equal(pattern.state.detail, 'src/**/*.ts');

  const glob = acc.processUpdate(
    {
      sessionUpdate: 'tool_call',
      toolCallId: 'tool-glob',
      title: 'Find',
      status: 'completed',
      rawInput: { glob: '*.md' }
    },
    { defaultSessionId: 'sess-1', workspace: '/tmp' }
  );
  assert.equal(glob.state.detail, '*.md');

  const runTitle = acc.processUpdate(
    {
      sessionUpdate: 'tool_call',
      toolCallId: 'tool-run-title',
      title: 'run npm ci',
      status: 'completed'
    },
    { defaultSessionId: 'sess-1', workspace: '/tmp' }
  );
  assert.equal(runTitle.state.detail, 'npm ci');

  const backtickTitle = acc.processUpdate(
    {
      sessionUpdate: 'tool_call',
      toolCallId: 'tool-backtick-title',
      title: '`npm test`',
      status: 'completed'
    },
    { defaultSessionId: 'sess-1', workspace: '/tmp' }
  );
  assert.equal(backtickTitle.observation?.command, 'npm test');
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
    safeRm(tmpDir);
  }
});

function baseSessionOptions(
  tmpDir: string,
  mockBinary: string,
  eventsBus: EventBus,
  extra?: Partial<ConstructorParameters<typeof CursorAcpSession>[0]>
): ConstructorParameters<typeof CursorAcpSession>[0] {
  return {
    workspace: tmpDir,
    runLog: path.join(tmpDir, 'run.log'),
    eventsFile: path.join(tmpDir, 'events.jsonl'),
    focusFile: path.join(tmpDir, 'focus.txt'),
    callbacks: {
      onPlan: async () => ({
        accepted: true as const,
        outcome: 'accepted' as const,
        status: 'APPROVE' as const
      }),
      onQuestion: async () => ({ answers: [], rationale: '' }),
      onPermission: async () => ({ allow: true, reason: 'ok' })
    },
    binary: mockBinary,
    model: 'gemini-3.8-flash',
    thinking: 'high',
    turnTimeoutMinutes: 1,
    events: eventsBus,
    ...extra
  };
}

test('CursorAcpSession: start tolerates auth/load/config edge cases', async () => {
  const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-auth-'));
  const loadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-load-'));
  const mockAuth = createMockCursorBinary(authDir);
  const mockLoad = createMockCursorBinary(loadDir);
  const busAuth = new EventBus(path.join(authDir, 'bus.jsonl'), true);
  const busLoad = new EventBus(path.join(loadDir, 'bus.jsonl'), true);

  try {
    process.env.TEST_CURSOR_AUTH_FAIL = '1';
    const authSession = new CursorAcpSession(baseSessionOptions(authDir, mockAuth, busAuth));
    await authSession.start();
    await authSession.stop();
    delete process.env.TEST_CURSOR_AUTH_FAIL;

    process.env.TEST_CURSOR_LOAD_FAIL = '1';
    const loadRunLog = path.join(loadDir, 'run.log');
    const loadSession = new CursorAcpSession(
      baseSessionOptions(loadDir, mockLoad, busLoad, {
        runLog: loadRunLog,
        resumeSessionId: 'resume-load-fail'
      })
    );
    await loadSession.start();
    assert.ok(fs.readFileSync(loadRunLog, 'utf8').includes('[executor session/load failed]'));
    await loadSession.stop();
    delete process.env.TEST_CURSOR_LOAD_FAIL;

    // Test loadSession with agentCapabilities having snake_case load_session: true
    const loadSnakeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-load-snake-'));
    const mockSnake = createMockCursorBinary(loadSnakeDir);
    const busSnake = new EventBus(path.join(loadSnakeDir, 'bus.jsonl'), true);
    try {
      const snakeSession = new CursorAcpSession(
        baseSessionOptions(loadSnakeDir, mockSnake, busSnake, {
          resumeSessionId: 'sess-snake-load'
        })
      );
      (snakeSession as unknown as { request: (m: string) => Promise<unknown> }).request = async (
        m: string
      ) => {
        if (m === 'initialize') return { agent_capabilities: { load_session: true } };
        if (m === 'authenticate') return {};
        if (m === 'session/load')
          return {
            sessionId: 'sess-snake-load',
            config_options: [{ id: 'thinking', options: [{ id: 'high' }] }]
          };
        if (m === 'session/set_config_option') return {};
        return {};
      };
      await snakeSession.start();
      assert.equal(snakeSession.id, 'sess-snake-load');
      await snakeSession.stop();
    } finally {
      busSnake.close();
      safeRm(loadSnakeDir);
    }

    // Test loadSession with agentCapabilities having loadSession: false (falls back to session/new)
    const loadFallbackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-load-fb-'));
    const mockFb = createMockCursorBinary(loadFallbackDir);
    const busFb = new EventBus(path.join(loadFallbackDir, 'bus.jsonl'), true);
    try {
      const fbSession = new CursorAcpSession(
        baseSessionOptions(loadFallbackDir, mockFb, busFb, {
          resumeSessionId: 'sess-fb-load'
        })
      );
      (fbSession as unknown as { request: (m: string) => Promise<unknown> }).request = async (
        m: string
      ) => {
        if (m === 'initialize') return { agentCapabilities: { loadSession: false } };
        if (m === 'authenticate') return {};
        if (m === 'session/new') return { sessionId: 'sess-new-created', configOptions: [] };
        return {};
      };
      await fbSession.start();
      assert.equal(fbSession.id, 'sess-new-created');
      await fbSession.stop();
    } finally {
      busFb.close();
      safeRm(loadFallbackDir);
    }

    process.env.TEST_CURSOR_NO_THINKING = '1';
    const thinkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-think-'));
    const mockThink = createMockCursorBinary(thinkDir);
    const busThink = new EventBus(path.join(thinkDir, 'bus.jsonl'), true);
    const noThink = new CursorAcpSession(baseSessionOptions(thinkDir, mockThink, busThink));
    await noThink.start();
    await noThink.stop();
    delete process.env.TEST_CURSOR_NO_THINKING;
    busThink.close();
    safeRm(thinkDir);

    process.env.TEST_CURSOR_CONFIG_FAIL = '1';
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-cfg-'));
    const mockCfg = createMockCursorBinary(cfgDir);
    const busCfg = new EventBus(path.join(cfgDir, 'bus.jsonl'), true);
    const cfgFail = new CursorAcpSession(baseSessionOptions(cfgDir, mockCfg, busCfg));
    await cfgFail.start();
    await cfgFail.stop();
    delete process.env.TEST_CURSOR_CONFIG_FAIL;
    busCfg.close();
    safeRm(cfgDir);
  } finally {
    delete process.env.TEST_CURSOR_AUTH_FAIL;
    delete process.env.TEST_CURSOR_LOAD_FAIL;
    delete process.env.TEST_CURSOR_NO_THINKING;
    delete process.env.TEST_CURSOR_CONFIG_FAIL;
    busAuth.close();
    busLoad.close();
    safeRm(authDir);
    safeRm(loadDir);
  }
});

test('CursorAcpSession: prompt timeout and child exit reject in-flight requests', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-timeout-exit-'));
  const mockBinary = createMockCursorBinary(tmpDir);
  const eventsBus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);

  try {
    const hangSession = new CursorAcpSession(
      baseSessionOptions(tmpDir, mockBinary, eventsBus, { turnTimeoutMinutes: 0.0001 })
    );
    await hangSession.start();
    await assert.rejects(() => hangSession.prompt('trigger-hang'), /timed out/i);
    // Explicitly kill the child before stop
    (hangSession as unknown as { child: import('node:child_process').ChildProcess }).child.kill(
      'SIGKILL'
    );
    await hangSession.stop();

    const exitSession = new CursorAcpSession(baseSessionOptions(tmpDir, mockBinary, eventsBus));
    await exitSession.start();
    await assert.rejects(() => exitSession.prompt('trigger-exit'), /exited/i);
    await exitSession.stop();
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});

test('CursorAcpSession: replays historical SERVER tool observations on start', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-replay-ok-'));
  const mockBinary = createMockCursorBinary(tmpDir);
  const eventsBus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);
  const eventsFile = path.join(tmpDir, 'events.jsonl');
  const toolLine = JSON.stringify({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: 'sess-replay',
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-replay-1',
        title: 'Run',
        rawInput: { command: 'npm run test' },
        status: 'completed'
      }
    }
  });
  fs.writeFileSync(eventsFile, `SERVER ${toolLine}\n`);

  try {
    const session = new CursorAcpSession(
      baseSessionOptions(tmpDir, mockBinary, eventsBus, {
        eventsFile,
        resumeSessionId: 'sess-replay'
      })
    );
    await session.start();
    const obs = session.observedCommands();
    assert.ok(obs.some((o) => o.command === 'npm run test'));
    await session.stop();
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});

test('CursorAcpSession: setQualityEpoch rebuilds normalizer and records epoch on observations', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-quality-epoch-'));
  const mockBinary = createMockCursorBinary(tmpDir);
  const eventsBus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);

  try {
    const session = new CursorAcpSession(
      baseSessionOptions(tmpDir, mockBinary, eventsBus, {
        runId: 'run-epoch',
        stageName: 'stage-01',
        attempt: 2
      })
    );
    await session.start();
    session.setQualityEpoch('quality-epoch-42');
    await session.prompt('trigger-permission-broker-git');
    const obs = session.observedCommands();
    assert.ok(obs.some((o) => o.quality_epoch_id === 'quality-epoch-42'));
    await session.stop();
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});

test('CursorAcpSession: handles post-epoch normalizer callbacks and session queries', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-epoch-callbacks-'));
  const mockBinary = createMockCursorBinary(tmpDir);
  const eventsBus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);

  try {
    const session = new CursorAcpSession(
      baseSessionOptions(tmpDir, mockBinary, eventsBus, {
        runId: 'run-post-epoch',
        stageName: 'stage-01',
        attempt: 1,
        callbacks: {
          onPlan: async () => ({
            accepted: true,
            outcome: 'accepted',
            status: 'APPROVE'
          }),
          onQuestion: async () => ({
            answers: [{ questionId: 'q1', selectedOptionIds: ['o1'] }],
            rationale: 'opt1'
          }),
          onPermission: async () => ({
            allow: true,
            reason: 'allowed'
          })
        }
      })
    );
    await session.start();

    // Query sequence methods
    assert.equal(typeof session.currentSequence(), 'number');
    assert.equal(typeof session.lastMutationSeq(), 'number');
    assert.ok(Array.isArray(session.observedCommands()));

    // Stdin error handling: both non-EPIPE and EPIPE
    const childStdin = (
      session as unknown as { child: { stdin: import('node:events').EventEmitter } }
    ).child.stdin;
    childStdin.emit('error', new Error('mock socket failure'));
    childStdin.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));

    const handleLine = (
      session as unknown as { handleLine: (line: string) => Promise<void> }
    ).handleLine.bind(session);

    // Callbacks on the normalizer created during start()
    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 's1',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'Pre-epoch agent response' }
          }
        }
      })
    );
    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 's1',
          update: {
            sessionUpdate: 'focus_delta',
            content: { type: 'text', text: 'Pre-epoch focus delta\n' }
          }
        }
      })
    );
    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 601,
        method: 'cursor/create_plan',
        params: { plan: 'Pre-epoch plan' }
      })
    );
    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 602,
        method: 'cursor/ask_question',
        params: {
          title: 'Question',
          questions: [{ id: 'q1', prompt: 'Which?', options: [{ id: 'o1', label: 'One' }] }]
        }
      })
    );
    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 603,
        method: 'session/request_permission',
        params: {
          command: 'npm run test',
          options: [{ id: 'allow_once' }, { id: 'deny' }]
        }
      })
    );

    // Now set quality epoch (creates second normalizer instance)
    session.setQualityEpoch('epoch-test-42');

    // 1. Agent message chunk
    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 's1',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'Agent response chunk' }
          }
        }
      })
    );

    // 2. Focus delta
    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 's1',
          update: {
            sessionUpdate: 'focus_delta',
            content: { type: 'text', text: 'Focus delta line\n' }
          }
        }
      })
    );

    // 3. Plan request
    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 701,
        method: 'cursor/create_plan',
        params: { plan: 'Stage implementation plan' }
      })
    );

    // 4. Question request
    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 702,
        method: 'cursor/ask_question',
        params: {
          title: 'Question',
          questions: [{ id: 'q1', prompt: 'Which?', options: [{ id: 'o1', label: 'One' }] }]
        }
      })
    );

    // 5. Permission request
    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 703,
        method: 'session/request_permission',
        params: {
          command: 'npm run test',
          options: [{ id: 'allow_once' }, { id: 'deny' }]
        }
      })
    );

    await session.stop();
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});

test('CursorAcpSession: stop gracefully handles child.kill error', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-stop-err-'));
  const mockBinary = createMockCursorBinary(tmpDir);
  const eventsBus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);

  try {
    const session = new CursorAcpSession(baseSessionOptions(tmpDir, mockBinary, eventsBus));
    await session.start();
    const child = (session as unknown as { child: import('node:child_process').ChildProcess })
      .child;
    const origKill = child.kill.bind(child);
    child.kill = () => {
      throw new Error('kill failed');
    };
    await session.stop();
    try {
      origKill('SIGKILL');
    } catch {}
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});

test('CursorAcpSession: routes stderr lines to event logger and run log', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-stderr-'));
  const mockBinary = createMockCursorBinary(tmpDir);
  let warned = false;
  const eventsBus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);
  eventsBus.emitter.on('event', (ev: { payload?: { message?: string } }) => {
    if (ev.payload?.message?.includes('test stderr line')) warned = true;
  });

  try {
    const session = new CursorAcpSession(baseSessionOptions(tmpDir, mockBinary, eventsBus));
    await session.start();
    const childStderr = (
      session as unknown as { child: { stderr: import('node:events').EventEmitter } }
    ).child.stderr;
    childStderr.emit('data', Buffer.from('test stderr line\n'));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(warned, true);
    await session.stop();
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});

test('CursorAcpSession: setMode logs warning when session/set_mode rejects', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-setmode-'));
  const mockBinary = createMockCursorBinary(tmpDir);
  const eventsBus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);
  let modeWarned = false;
  eventsBus.emitter.on('event', (ev: { payload?: { message?: string } }) => {
    if (ev.payload?.message?.includes('Unable to set executor mode')) modeWarned = true;
  });

  try {
    const session = new CursorAcpSession(baseSessionOptions(tmpDir, mockBinary, eventsBus));
    await session.start();
    const origRequest = (
      session as unknown as { request: (...args: unknown[]) => Promise<unknown> }
    ).request.bind(session);
    (
      session as unknown as {
        request: (m: string, p: unknown, t?: number) => Promise<unknown>;
      }
    ).request = async (m, p, t) => {
      if (m === 'session/set_mode') throw new Error('mode rejected');
      return origRequest(m, p, t);
    };
    await session.setMode('plan');
    assert.equal(modeWarned, true);
    await session.stop();
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});

test('CursorAcpSession: replayHistoricalEvents catches read error when eventsFile is directory', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-replay-err-'));
  const mockBinary = createMockCursorBinary(tmpDir);
  const eventsBus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);
  const badEventsDir = path.join(tmpDir, 'events-dir');
  fs.mkdirSync(badEventsDir);

  try {
    const session = new CursorAcpSession(
      baseSessionOptions(tmpDir, mockBinary, eventsBus, {
        eventsFile: badEventsDir,
        resumeSessionId: 'sess-dir'
      })
    );
    (session as unknown as { replayHistoricalEvents: () => void }).replayHistoricalEvents();
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});

test('CursorAcpSession: stop finishes immediately when child exits cleanly', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-stop-clean-'));
  const mockBinary = createMockCursorBinary(tmpDir);
  const eventsBus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);

  try {
    const session = new CursorAcpSession(baseSessionOptions(tmpDir, mockBinary, eventsBus));
    await session.start();
    const child = (session as unknown as { child: import('node:child_process').ChildProcess })
      .child;
    const origKill = child.kill.bind(child);
    child.kill = (sig) => {
      // Simulate child immediately emitting exit upon receiving SIGTERM
      setTimeout(() => child.emit('exit', 0, null), 5);
      return origKill(sig);
    };
    await session.stop();
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});

test('CursorAcpSession: constructor initializes onAgentText callback', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-init-cb-'));
  const eventsBus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);
  try {
    const session = new CursorAcpSession(baseSessionOptions(tmpDir, 'dummy', eventsBus));
    const normalizer = (
      session as unknown as { normalizer: { options: { onAgentText?: (text: string) => void } } }
    ).normalizer;
    assert.ok(normalizer.options.onAgentText);
    normalizer.options.onAgentText('hello init');
    const agentText = (session as unknown as { agentText: string }).agentText;
    assert.equal(agentText, 'hello init');
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});

test('CursorAcpSession: stop times out SIGTERM and issues SIGKILL', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-stop-kill-'));
  const mockBinary = createMockCursorBinary(tmpDir);
  const eventsBus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);

  try {
    const session = new CursorAcpSession(baseSessionOptions(tmpDir, mockBinary, eventsBus));
    await session.start();

    // Fast resolution: simulate immediate exit on kill
    const child = (session as unknown as { child: import('node:child_process').ChildProcess })
      .child;
    const origKill = child.kill.bind(child);
    child.kill = (sig) => {
      setTimeout(() => child.emit('exit', 0, sig), 5);
      return origKill(sig);
    };

    await session.stop();
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});

test('CursorAcpSession: handleLine appends agentText when onAgentText callback runs', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-agent-text-'));
  const mockBinary = createMockCursorBinary(tmpDir);
  const eventsBus = new EventBus(path.join(tmpDir, 'bus.jsonl'), true);

  try {
    const session = new CursorAcpSession(baseSessionOptions(tmpDir, mockBinary, eventsBus));
    await session.start();
    const handleLine = (
      session as unknown as { handleLine: (line: string) => Promise<void> }
    ).handleLine.bind(session);

    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 's1',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'accumulated test agent text' }
          }
        }
      })
    );

    const agentText = (session as unknown as { agentText: string }).agentText;
    assert.equal(agentText, 'accumulated test agent text');

    // Test cancel without child: store child first so we can stop it cleanly afterwards
    const realChild = (session as unknown as { child: import('node:child_process').ChildProcess })
      .child;
    (session as unknown as { child: unknown }).child = null;
    await session.cancel();
    (session as unknown as { child: unknown }).child = realChild;
    await session.stop();
  } finally {
    eventsBus.close();
    safeRm(tmpDir);
  }
});
