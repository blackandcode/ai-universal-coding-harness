/**
 * @fileoverview Unit tests for the pure UI state reducer and state factory.
 * Verifies deterministic state transitions, event handling, bounding capacities, and immutability.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialUiState, uiReducer } from '../../src/ui/reducer.js';
import type { UiEvent } from '../../src/types.js';

test('createInitialUiState produces deterministic default state', () => {
  const state = createInitialUiState({ runId: 'run-1', stageTotal: 3, branch: 'ai-branch' });

  assert.equal(state.status, 'starting');
  assert.equal(state.currentStage, '');
  assert.equal(state.stageIndex, 0);
  assert.equal(state.stageTotal, 3);
  assert.equal(state.attempt, 0);
  assert.deepEqual(state.messages, []);
  assert.deepEqual(state.tools, {});
  assert.deepEqual(state.toolOrder, []);
  assert.deepEqual(state.todos, []);
  assert.equal(state.quality, null);
  assert.deepEqual(state.changedFiles, []);
  assert.deepEqual(state.tokens, { calls: 0, input: 0, output: 0 });
  assert.deepEqual(state.logs, []);
  assert.equal(state.focusText, '');
  assert.equal(state.focusFile, '');
  assert.equal(state.meta.runId, 'run-1');
  assert.equal(state.meta.branch, 'ai-branch');

  // Verify all phases are initialized to pending
  assert.equal(state.phase.PLAN, 'pending');
  assert.equal(state.phase.IMPLEMENT, 'pending');
  assert.equal(state.phase.QUALITY, 'pending');
  assert.equal(state.phase.REVIEW, 'pending');
  assert.equal(state.phase.COMMIT, 'pending');
});

test('uiReducer handles run lifecycle events', () => {
  const initial = createInitialUiState();

  const started = uiReducer(initial, {
    ts: '2026-09-16T00:00:00.000Z',
    type: 'run.started',
    payload: { run_id: 'run-123', branch: 'test-branch' }
  });
  assert.equal(started.status, 'running');
  assert.equal(started.meta.branch, 'test-branch');

  const completed = uiReducer(started, {
    ts: '2026-09-16T00:01:00.000Z',
    type: 'run.completed',
    payload: { branch: 'test-branch', workspace: '/tmp' }
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.phase.PLAN, 'completed');
  assert.equal(completed.phase.COMMIT, 'completed');
  assert.equal(completed.messages.length, 1);
  assert.equal(completed.messages[0].text, 'Run completed.');

  const blocked = uiReducer(started, {
    ts: '2026-09-16T00:02:00.000Z',
    type: 'run.blocked',
    payload: { status: 'failed', reason: 'Critical failure' }
  });
  assert.equal(blocked.status, 'failed');
  assert.equal(blocked.messages.length, 1);
  assert.equal(blocked.messages[0].kind, 'error');
  assert.equal(blocked.messages[0].text, 'Critical failure');
});

test('uiReducer handles stage progression and resets stage state', () => {
  let state = createInitialUiState({ stageTotal: 2 });

  // Stage 1 started
  state = uiReducer(state, {
    ts: '2026-09-16T00:00:00.000Z',
    type: 'stage.started',
    payload: { stage: 'stage-01', index: 1, total: 2 }
  });
  assert.equal(state.currentStage, 'stage-01');
  assert.equal(state.stageIndex, 1);
  assert.equal(state.stageTotal, 2);
  assert.equal(state.phase.PLAN, 'active');
  assert.equal(state.phase.IMPLEMENT, 'pending');

  // Stage attempt
  state = uiReducer(state, {
    ts: '2026-09-16T00:01:00.000Z',
    type: 'stage.attempt',
    payload: { stage: 'stage-01', attempt: 1 }
  });
  assert.equal(state.attempt, 1);
  assert.equal(state.phase.PLAN, 'completed');
  assert.equal(state.phase.IMPLEMENT, 'active');

  // Stage completed
  state = uiReducer(state, {
    ts: '2026-09-16T00:02:00.000Z',
    type: 'stage.completed',
    payload: { stage: 'stage-01' }
  });
  assert.equal(state.phase.COMMIT, 'completed');
  assert.equal(state.messages.at(-1)?.text, 'Stage stage-01 completed.');

  // Stage blocked
  state = uiReducer(state, {
    ts: '2026-09-16T00:03:00.000Z',
    type: 'stage.blocked',
    payload: { stage: 'stage-01', reason: 'Reviewer limit exceeded' }
  });
  assert.equal(state.status, 'blocked');
  assert.equal(state.messages.at(-1)?.kind, 'error');
});

test('uiReducer handles executor mode shifts and focus deltas', () => {
  let state = createInitialUiState();

  state = uiReducer(state, {
    ts: '2026-09-16T00:00:00.000Z',
    type: 'executor.mode',
    payload: { mode: 'plan' }
  });
  assert.equal(state.phase.PLAN, 'active');

  state = uiReducer(state, {
    ts: '2026-09-16T00:01:00.000Z',
    type: 'executor.mode',
    payload: { mode: 'agent' }
  });
  assert.equal(state.phase.PLAN, 'completed');
  assert.equal(state.phase.IMPLEMENT, 'active');

  state = uiReducer(state, {
    ts: '2026-09-16T00:02:00.000Z',
    type: 'executor.focus.delta',
    payload: { text: 'Focus delta line 1\n', focus_file: '/tmp/focus.txt' }
  });
  assert.equal(state.focusText, 'Focus delta line 1\n');
  assert.equal(state.focusFile, '/tmp/focus.txt');

  state = uiReducer(state, {
    ts: '2026-09-16T00:03:00.000Z',
    type: 'executor.focus.delta',
    payload: { text: 'Focus delta line 2\n' }
  });
  assert.equal(state.focusText, 'Focus delta line 1\nFocus delta line 2\n');
  assert.equal(state.focusFile, '/tmp/focus.txt');
});

test('uiReducer handles todos replacement and merging', () => {
  let state = createInitialUiState();

  // Initial list without merge
  state = uiReducer(state, {
    ts: '2026-09-16T00:00:00.000Z',
    type: 'executor.todos',
    payload: {
      todos: [
        { id: 't1', content: 'Task 1', status: 'pending' },
        { id: 't2', content: 'Task 2', status: 'pending' }
      ],
      merge: false
    }
  });
  assert.equal(state.todos.length, 2);
  assert.equal(state.todos[0].status, 'pending');

  // Merged update
  state = uiReducer(state, {
    ts: '2026-09-16T00:01:00.000Z',
    type: 'executor.todos',
    payload: {
      todos: [
        { id: 't1', status: 'completed' },
        { id: 't3', content: 'Task 3', status: 'in_progress' }
      ],
      merge: true
    }
  });
  assert.equal(state.todos.length, 3);
  assert.equal(state.todos.find((t) => t.id === 't1')?.status, 'completed');
  assert.equal(state.todos.find((t) => t.id === 't1')?.content, 'Task 1');
  assert.equal(state.todos.find((t) => t.id === 't3')?.status, 'in_progress');
});

test('uiReducer handles tool calls and order capping', () => {
  let state = createInitialUiState();

  state = uiReducer(state, {
    ts: '2026-09-16T00:00:00.000Z',
    type: 'executor.tool',
    payload: { id: 'call-1', title: 'Shell', detail: 'npm test', status: 'in_progress' }
  });
  assert.equal(state.tools['call-1'].title, 'Shell');
  assert.equal(state.tools['call-1'].status, 'in_progress');
  assert.deepEqual(state.toolOrder, ['call-1']);

  // Updating same tool
  state = uiReducer(state, {
    ts: '2026-09-16T00:01:00.000Z',
    type: 'executor.tool',
    payload: { id: 'call-1', status: 'completed' }
  });
  assert.equal(state.tools['call-1'].status, 'completed');
  assert.equal(state.tools['call-1'].title, 'Shell');
  assert.deepEqual(state.toolOrder, ['call-1']);

  // Add 70 tools to assert capping at 60
  for (let i = 2; i <= 70; i++) {
    state = uiReducer(state, {
      ts: '2026-09-16T00:02:00.000Z',
      type: 'executor.tool',
      payload: { id: `call-${i}`, title: `Tool ${i}`, status: 'completed' }
    });
  }
  assert.equal(state.toolOrder.length, 60);
  assert.equal(state.toolOrder.at(-1), 'call-70');
});

test('uiReducer handles reviewer plan, questions, and permissions', () => {
  let state = createInitialUiState();

  // Reviewer plan rejected
  state = uiReducer(state, {
    ts: '2026-09-16T00:00:00.000Z',
    type: 'reviewer.plan',
    payload: { verdict: 'REJECT', summary: 'Missing tests' }
  });
  assert.equal(state.phase.PLAN, 'active');
  assert.equal(state.messages.at(-1)?.text, 'Plan REJECT: Missing tests');

  // Reviewer plan approved
  state = uiReducer(state, {
    ts: '2026-09-16T00:01:00.000Z',
    type: 'reviewer.plan',
    payload: { verdict: 'APPROVE', summary: 'Ready' }
  });
  assert.equal(state.phase.PLAN, 'completed');

  // Questions
  state = uiReducer(state, {
    ts: '2026-09-16T00:02:00.000Z',
    type: 'executor.question',
    payload: { prompt: 'Which port?' }
  });
  assert.equal(state.messages.at(-1)?.text, 'Question: Which port?');

  state = uiReducer(state, {
    ts: '2026-09-16T00:03:00.000Z',
    type: 'reviewer.question',
    payload: { answer: 'Port 8080', rationale: 'Standard' }
  });
  assert.equal(state.messages.at(-1)?.text, 'Answer: Port 8080 — Standard');

  // Permissions
  state = uiReducer(state, {
    ts: '2026-09-16T00:04:00.000Z',
    type: 'executor.permission',
    payload: { command: 'rm -rf /tmp/cache' }
  });
  assert.equal(state.messages.at(-1)?.text, 'Permission requested: rm -rf /tmp/cache');

  state = uiReducer(state, {
    ts: '2026-09-16T00:05:00.000Z',
    type: 'reviewer.permission',
    payload: { verdict: 'ALLOW', summary: 'Safe cache clean' }
  });
  assert.equal(state.messages.at(-1)?.text, 'Permission ALLOW: Safe cache clean');

  // Fallback
  state = uiReducer(state, {
    ts: '2026-09-16T00:06:00.000Z',
    type: 'reviewer.fallback',
    payload: {
      failed_harness: 'codex',
      failed_model: 'gpt-6-astra',
      fallback_harness: 'cursor',
      fallback_model: 'gemini-3.8-flash',
      trigger: 'usage_limit',
      reason: 'Hit usage limit'
    }
  });
  assert.equal(state.messages.at(-1)?.kind, 'info');
  assert.equal(
    state.messages.at(-1)?.text,
    'Reviewer failover [usage_limit] from codex (gpt-6-astra) to cursor (gemini-3.8-flash): Hit usage limit'
  );
});

test('uiReducer handles quality results, review verdicts, and commit events', () => {
  let state = createInitialUiState();

  state = uiReducer(state, {
    ts: '2026-09-16T00:00:00.000Z',
    type: 'quality.started',
    payload: {}
  });
  assert.equal(state.phase.IMPLEMENT, 'completed');
  assert.equal(state.phase.QUALITY, 'active');

  // Quality PASS
  state = uiReducer(state, {
    ts: '2026-09-16T00:01:00.000Z',
    type: 'quality.result',
    payload: { status: 'PASS', summary: 'All 10 tests passed', changed_files: ['src/foo.ts'] }
  });
  assert.equal(state.phase.QUALITY, 'completed');
  assert.equal(state.quality?.status, 'PASS');
  assert.deepEqual(state.changedFiles, ['src/foo.ts']);
  assert.equal(state.messages.at(-1)?.kind, 'success');

  state = uiReducer(state, {
    ts: '2026-09-16T00:01:30.000Z',
    type: 'quality.result',
    payload: { status: 'FAIL', summary: '', quality_summary: 'Tests failed' }
  });
  assert.equal(state.phase.QUALITY, 'active');
  assert.equal(state.quality?.pass, false);
  assert.equal(state.messages.at(-1)?.kind, 'error');
  assert.ok(state.messages.at(-1)?.text.includes('Quality FAIL'));

  // Review started & approved
  state = uiReducer(state, {
    ts: '2026-09-16T00:02:00.000Z',
    type: 'review.started',
    payload: { stage: 'stage-01', attempt: 1 }
  });
  assert.equal(state.phase.REVIEW, 'active');

  state = uiReducer(state, {
    ts: '2026-09-16T00:03:00.000Z',
    type: 'review.result',
    payload: { verdict: 'APPROVE', summary: 'Looks great' }
  });
  assert.equal(state.phase.REVIEW, 'completed');

  // Commit started & completed
  state = uiReducer(state, {
    ts: '2026-09-16T00:04:00.000Z',
    type: 'commit.started',
    payload: { stage: 'stage-01' }
  });
  assert.equal(state.phase.COMMIT, 'active');

  state = uiReducer(state, {
    ts: '2026-09-16T00:05:00.000Z',
    type: 'stage.committed',
    payload: { stage: 'stage-01', sha: 'abcdef1234567890' }
  });
  assert.equal(state.phase.COMMIT, 'completed');
  assert.equal(state.messages.at(-1)?.text, 'Committed stage-01 · abcdef123456');
});

test('uiReducer accumulates token counters and bounds logs and messages', () => {
  let state = createInitialUiState();

  state = uiReducer(state, {
    ts: '2026-09-16T00:00:00.000Z',
    type: 'reviewer.tokens',
    payload: { input: 1000, output: 250 }
  });
  assert.deepEqual(state.tokens, { calls: 1, input: 1000, output: 250 });

  state = uiReducer(state, {
    ts: '2026-09-16T00:01:00.000Z',
    type: 'reviewer.tokens',
    payload: { input: 500, output: 150 }
  });
  assert.deepEqual(state.tokens, { calls: 2, input: 1500, output: 400 });

  // Add 50 messages to verify capping at 40
  for (let i = 1; i <= 50; i++) {
    state = uiReducer(state, {
      ts: '2026-09-16T00:02:00.000Z',
      type: 'executor.message',
      payload: { text: `Message ${i}` }
    });
  }
  assert.equal(state.messages.length, 40);
  assert.equal(state.messages.at(-1)?.text, 'Message 50');

  // Add 120 logs to verify capping at 100
  for (let i = 1; i <= 120; i++) {
    state = uiReducer(state, {
      ts: '2026-09-16T00:03:00.000Z',
      type: 'log',
      payload: { level: 'info', message: `Log entry ${i}` }
    });
  }
  assert.equal(state.logs.length, 100);
  assert.equal(state.logs.at(-1)?.message, 'Log entry 120');
});

test('uiReducer preserves state immutability', () => {
  const initial = createInitialUiState();
  const event: UiEvent = {
    ts: '2026-09-16T00:00:00.000Z',
    type: 'run.started',
    payload: { branch: 'new-branch' }
  };

  const next = uiReducer(initial, event);

  assert.notEqual(initial, next);
  assert.equal(initial.status, 'starting');
  assert.equal(next.status, 'running');
  assert.equal(initial.meta.branch, undefined);
  assert.equal(next.meta.branch, 'new-branch');
});
