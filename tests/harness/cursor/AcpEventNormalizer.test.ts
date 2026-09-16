/**
 * @fileoverview Unit tests for AcpEventNormalizer in src/harness/cursor/AcpEventNormalizer.ts.
 *
 * Validates JSON-RPC message dispatching, routing of session updates (agent message chunks,
 * thoughts, progress, tool calls), todos and tasks emission, and async request delegation
 * (plans, questions, permissions).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { AcpEventNormalizer } from '../../../src/harness/cursor/AcpEventNormalizer.js';
import { AcpToolAccumulator } from '../../../src/harness/cursor/AcpToolAccumulator.js';
import { ObservationJournal } from '../../../src/harness/cursor/ObservationJournal.js';
import { isRecord } from '../../../src/harness/cursor/types.js';

interface TestEmittedEvent {
  type: string;
  payload?: {
    text?: string;
    todos?: unknown[];
    merge?: boolean;
    title?: string;
    summary?: string;
    id?: string;
    detail?: string;
    status?: string;
    exit_code?: number | null;
    updatedAt?: number;
    [key: string]: unknown;
  };
}

test('AcpEventNormalizer: routes agent message and thought chunks', async () => {
  const emitted: TestEmittedEvent[] = [];
  let agentText = '';
  let focusDelta = '';

  const normalizer = new AcpEventNormalizer({
    events: {
      emit: (type: string, payload?: Record<string, unknown>) => emitted.push({ type, payload })
    },
    accumulator: new AcpToolAccumulator(),
    journal: new ObservationJournal(),
    onAgentText: (t) => {
      agentText += t;
    },
    onFocusDelta: (t) => {
      focusDelta += t;
    }
  });

  // Message chunk
  await normalizer.handleMessage({
    method: 'session/update',
    params: {
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { text: 'Hello from agent' }
      }
    }
  });
  assert.equal(agentText, 'Hello from agent');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]?.type, 'executor.message');
  assert.equal(emitted[0]?.payload?.text, 'Hello from agent');

  // Thought chunk
  await normalizer.handleMessage({
    method: 'session/update',
    params: {
      update: {
        sessionUpdate: 'agent_thought_chunk',
        content: { text: 'Thinking...' }
      }
    }
  });
  assert.equal(focusDelta, 'Thinking...');

  // Progress chunk with fallback text property
  await normalizer.handleMessage({
    method: 'session/update',
    params: {
      update: {
        type: 'agent_progress_chunk',
        text: 'Progressing...'
      }
    }
  });
  assert.equal(focusDelta, 'Thinking...Progressing...');

  // Null update handles gracefully
  await normalizer.handleMessage({
    method: 'session/update',
    params: { update: null }
  });
});

test('AcpEventNormalizer: handles todos, tasks, and tool call updates', async () => {
  const emitted: TestEmittedEvent[] = [];
  const journal = new ObservationJournal();
  const accumulator = new AcpToolAccumulator();

  const normalizer = new AcpEventNormalizer({
    events: {
      emit: (type: string, payload?: Record<string, unknown>) => emitted.push({ type, payload })
    },
    accumulator,
    journal,
    stageName: 'stage-01',
    attempt: 1
  });

  // Todos
  await normalizer.handleMessage({
    method: 'cursor/update_todos',
    params: {
      todos: [{ id: '1', content: 'Step 1', status: 'pending' }],
      merge: false
    }
  });
  assert.equal(emitted[0]?.type, 'executor.todos');
  assert.equal(emitted[0]?.payload?.todos?.length, 1);

  // Task
  await normalizer.handleMessage({
    method: 'cursor/task',
    params: {
      title: 'Current task',
      summary: 'Task summary'
    }
  });
  assert.equal(emitted[1]?.type, 'executor.task');
  assert.equal(emitted[1]?.payload?.title, 'Current task');

  // Tool call update
  await normalizer.handleMessage({
    method: 'session/update',
    params: {
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-1',
        title: 'Run test',
        rawInput: { command: 'npm test' },
        status: 'running'
      }
    }
  });

  assert.equal(emitted[2]?.type, 'executor.tool');
  assert.equal(emitted[2]?.payload?.id, 'tool-1');
  assert.equal(emitted[2]?.payload?.title, 'Run');
  assert.equal(emitted[2]?.payload?.detail, 'npm test');
});

test('AcpEventNormalizer: delegates plan, question, and permission requests', async () => {
  let planRequested = false;
  let questionRequested = false;
  let permissionRequested = false;

  const normalizer = new AcpEventNormalizer({
    events: { emit: () => {} },
    accumulator: new AcpToolAccumulator(),
    journal: new ObservationJournal(),
    onPlanRequest: async () => {
      planRequested = true;
    },
    onQuestionRequest: async () => {
      questionRequested = true;
    },
    onPermissionRequest: async () => {
      permissionRequested = true;
    }
  });

  await normalizer.handleMessage({ method: 'cursor/create_plan', params: {} });
  assert.equal(planRequested, true);

  await normalizer.handleMessage({ method: 'cursor/ask_question', params: {} });
  assert.equal(questionRequested, true);

  await normalizer.handleMessage({ method: 'session/request_permission', params: {} });
  assert.equal(permissionRequested, true);

  // Unknown or null messages do not crash
  await normalizer.handleMessage(null);
  await normalizer.handleMessage('not-an-object');
  await normalizer.handleMessage({ method: 'unknown/method' });
});

test('isRecord accurately differentiates objects from primitives and arrays', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord({ key: 'val' }), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord(undefined), false);
  assert.equal(isRecord('string'), false);
  assert.equal(isRecord(42), false);
  assert.equal(isRecord(true), false);
});

test('AcpToolAccumulator: clear resets state and sequence counters', () => {
  const acc = new AcpToolAccumulator();
  acc.stepSequence();
  acc.stepSequence();
  assert.equal(acc.currentSequence(), 2);
  acc.markMutation(2);
  assert.equal(acc.lastMutationSeq(), 2);
  acc.processUpdate({ toolCallId: 'c1', title: 'Edit', kind: 'edit' }, { workspace: '/tmp' });
  assert.equal(acc.currentSequence(), 3);
  assert.equal(acc.lastMutationSeq(), 3);

  acc.clear();
  assert.equal(acc.currentSequence(), 0);
  assert.equal(acc.lastMutationSeq(), 0);
});
