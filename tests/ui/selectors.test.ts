/**
 * @fileoverview Unit tests for pure UI presentation selectors.
 * Verifies active task derivations, todo/phase progress calculations, tool prioritizing,
 * message slicing, and viewport text windowing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  selectActiveTask,
  selectTodoProgress,
  selectPhaseProgress,
  selectActiveAndRecentTools,
  selectRecentMessages,
  selectFocusContent,
  selectVisibleFocusLines,
  selectFormattedTodos,
  selectFormattedLogs
} from '../../src/ui/selectors.js';
import type { UiLogEntry, UiMessage, UiPhaseMap, UiTodo, UiTool } from '../../src/ui/types.js';

test('selectActiveTask prioritizes in_progress before pending', () => {
  const empty: UiTodo[] = [];
  assert.equal(selectActiveTask(empty), undefined);

  const pendingOnly: UiTodo[] = [
    { id: '1', content: 'First', status: 'completed' },
    { id: '2', content: 'Second', status: 'pending' },
    { id: '3', content: 'Third', status: 'pending' }
  ];
  assert.equal(selectActiveTask(pendingOnly)?.id, '2');

  const withActive: UiTodo[] = [
    { id: '1', content: 'First', status: 'pending' },
    { id: '2', content: 'Second', status: 'in_progress' },
    { id: '3', content: 'Third', status: 'pending' }
  ];
  assert.equal(selectActiveTask(withActive)?.id, '2');
});

test('selectTodoProgress accurately calculates completion metrics', () => {
  assert.deepEqual(selectTodoProgress([]), { done: 0, total: 0, ratio: 0 });

  const todos: UiTodo[] = [
    { id: '1', status: 'completed' },
    { id: '2', status: 'completed' },
    { id: '3', status: 'in_progress' },
    { id: '4', status: 'pending' },
    { id: '5', status: 'cancelled' } // cancelled should be excluded from total
  ];

  const progress = selectTodoProgress(todos);
  assert.equal(progress.done, 2);
  assert.equal(progress.total, 4);
  assert.equal(progress.ratio, 0.5);
});

test('selectPhaseProgress derives completion percentage and active flag', () => {
  const allPending: UiPhaseMap = {
    PLAN: 'pending',
    IMPLEMENT: 'pending',
    QUALITY: 'pending',
    REVIEW: 'pending',
    COMMIT: 'pending'
  };
  assert.deepEqual(selectPhaseProgress(allPending), {
    done: 0,
    active: false,
    ratio: 0,
    percent: 0
  });

  const planActive: UiPhaseMap = {
    ...allPending,
    PLAN: 'active'
  };
  const activeProg = selectPhaseProgress(planActive);
  assert.equal(activeProg.done, 0);
  assert.equal(activeProg.active, true);
  assert.equal(activeProg.percent, 9); // 0.45 / 5 = 0.09 -> 9%

  const planDoneImplActive: UiPhaseMap = {
    ...allPending,
    PLAN: 'completed',
    IMPLEMENT: 'active'
  };
  const midProg = selectPhaseProgress(planDoneImplActive);
  assert.equal(midProg.done, 1);
  assert.equal(midProg.active, true);
  assert.equal(midProg.percent, 29); // (1 + 0.45) / 5 = 0.29 -> 29%

  const allDone: UiPhaseMap = {
    PLAN: 'completed',
    IMPLEMENT: 'completed',
    QUALITY: 'completed',
    REVIEW: 'completed',
    COMMIT: 'completed'
  };
  assert.deepEqual(selectPhaseProgress(allDone), {
    done: 5,
    active: false,
    ratio: 1,
    percent: 100
  });
});

test('selectActiveAndRecentTools prioritizes active tools and caps total display', () => {
  const tools: Record<string, UiTool> = {
    t1: { id: 't1', title: 'Tool 1', status: 'completed' },
    t2: { id: 't2', title: 'Tool 2', status: 'active' },
    t3: { id: 't3', title: 'Tool 3', status: 'failed' },
    t4: { id: 't4', title: 'Tool 4', status: 'in_progress' },
    t5: { id: 't5', title: 'Tool 5', status: 'started' }
  };
  const toolOrder = ['t1', 't2', 't3', 't4', 't5'];

  // Should take 2 active (t2, t4) + 1 recent inactive (t3) = 3 total
  const selected = selectActiveAndRecentTools(tools, toolOrder, 3);
  assert.equal(selected.length, 3);
  assert.equal(selected[0].id, 't2');
  assert.equal(selected[1].id, 't4');
  assert.equal(selected[2].id, 't3');
});

test('selectRecentMessages returns last N messages', () => {
  const msgs: UiMessage[] = [
    { id: '1', role: 'system', text: 'One' },
    { id: '2', role: 'executor', text: 'Two' },
    { id: '3', role: 'reviewer', text: 'Three' }
  ];

  const recent = selectRecentMessages(msgs, 2);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].text, 'Two');
  assert.equal(recent[1].text, 'Three');
});

test('selectFocusContent prefers disk file over memory text when present', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-focus-test-'));
  const filePath = path.join(tmpDir, 'focus.txt');
  fs.writeFileSync(filePath, 'Disk content');

  try {
    const fromDisk = selectFocusContent(filePath, 'Memory fallback');
    assert.equal(fromDisk, 'Disk content');

    const fromMemory = selectFocusContent('/nonexistent/path/here', 'Memory fallback');
    assert.equal(fromMemory, 'Memory fallback');

    const empty = selectFocusContent('', '');
    assert.equal(empty, '');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('selectVisibleFocusLines returns fixed viewport height without jitter', () => {
  const multiline = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7';

  // Following tail (height = 4)
  const tail = selectVisibleFocusLines(multiline, 4, 0, true, 80);
  assert.equal(tail.length, 4);
  assert.deepEqual(tail, ['Line 4', 'Line 5', 'Line 6', 'Line 7']);

  // Scrolled up by 2 lines
  const scrolled = selectVisibleFocusLines(multiline, 4, 2, false, 80);
  assert.equal(scrolled.length, 4);
  assert.deepEqual(scrolled, ['Line 2', 'Line 3', 'Line 4', 'Line 5']);

  // Padding when fewer lines exist than viewport
  const shortText = 'Only one line';
  const padded = selectVisibleFocusLines(shortText, 3, 0, true, 80);
  assert.equal(padded.length, 3);
  assert.equal(padded[0], 'Only one line');
  assert.equal(padded[1], '');
  assert.equal(padded[2], '');
});

test('selectFormattedTodos and selectFormattedLogs handle empty and populated lists', () => {
  assert.deepEqual(selectFormattedTodos([]), ['(No todos recorded)']);

  const todos: UiTodo[] = [
    { id: '1', content: 'Build', status: 'completed' },
    { id: '2', content: 'Test', status: 'in_progress' },
    { id: '3', content: 'Lint', status: 'pending' }
  ];
  assert.deepEqual(selectFormattedTodos(todos), ['✓ Build', '◐ Test', '○ Lint']);

  assert.deepEqual(selectFormattedLogs([], 5), ['(No recent logs)']);

  const logs: UiLogEntry[] = [
    { level: 'info', message: 'Starting process' },
    { level: 'warn', message: 'High memory usage' },
    { level: 'error', message: 'Connection timed out' }
  ];
  const formattedLogs = selectFormattedLogs(logs, 2);
  assert.equal(formattedLogs.length, 2);
  assert.equal(formattedLogs[0], 'warn · High memory usage');
  assert.equal(formattedLogs[1], 'error · Connection timed out');
});
