/**
 * @fileoverview Unit tests for EventBus in src/ui/EventBus.ts.
 *
 * Validates real-time event broadcasting via EventEmitter, debounced disk flushing for high-frequency
 * executor tools and focus deltas, bounded file writing, terminal line formatting in lineMode,
 * and graceful closure.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventBus } from '../../src/ui/EventBus.js';
import type { UiEvent } from '../../src/types.js';

test('EventBus: emits events, writes to file, and notifies in-process listeners', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventbus-test-'));
  const eventFile = path.join(tmpDir, 'events.jsonl');
  try {
    const bus = new EventBus(eventFile, false, 1024 * 1024, 10);
    const received: UiEvent[] = [];
    bus.emitter.on('event', (e: UiEvent) => received.push(e));

    bus.emit('run.started', { run_id: 'test-run-1', branch: 'test-branch' });
    assert.equal(received.length, 1);
    assert.equal(received[0].type, 'run.started');

    const lines = fs.readFileSync(eventFile, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.type, 'run.started');
    assert.equal(parsed.payload.run_id, 'test-run-1');

    bus.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('EventBus: debounces tool updates and focus deltas and flushes on close', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventbus-debounce-'));
  const eventFile = path.join(tmpDir, 'events.jsonl');
  try {
    const bus = new EventBus(eventFile, false, 1024 * 1024, 20);
    const received: UiEvent[] = [];
    bus.emitter.on('event', (e: UiEvent) => received.push(e));

    bus.emit('executor.focus.delta', { text: 'chunk 1 ' });
    bus.emit('executor.focus.delta', { text: 'chunk 2' });
    bus.emit('executor.tool', { id: 'call-1', title: 'Running test', status: 'running' });
    bus.emit('executor.tool', { id: 'call-1', title: 'Running test', status: 'completed' });

    // Not yet written immediately before flush
    assert.equal(received.length, 0);

    // Flush manually
    bus.flush();
    assert.equal(received.length, 2); // 1 coalesced focus delta + 1 deduplicated tool
    assert.equal(received[0].type, 'executor.focus.delta');
    assert.equal(received[0].payload.text, 'chunk 1 chunk 2');
    assert.equal(received[1].type, 'executor.tool');
    assert.equal(received[1].payload.status, 'completed');

    bus.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('EventBus: lineMode logs formatted summaries without error', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventbus-linemode-'));
  const eventFile = path.join(tmpDir, 'events.jsonl');
  try {
    const bus = new EventBus(eventFile, true, 1024 * 1024, 10);
    // Emit different event types to exercise formatLine mappings
    bus.emit('run.started', { run_id: 'r1', branch: 'b1' });
    bus.emit('stage.started', { stage: 'stage-01' });
    bus.emit('executor.message', { text: 'Executing commands...' });
    bus.emit('reviewer.plan', { verdict: 'APPROVE', summary: 'Plan approved' });
    bus.emit('reviewer.permission', { verdict: 'ALLOW', summary: 'Tool allowed' });
    bus.emit('reviewer.question', { answer: 'Choice A' });
    bus.emit('quality.result', { status: 'PASS', summary: 'Gates green' });
    bus.emit('quality.result', { status: 'FAIL', summary: 'Gates red' });
    bus.emit('review.result', { verdict: 'APPROVE', summary: 'Stage ready' });
    bus.emit('review.result', { verdict: 'REWORK', summary: 'Fix issues' });
    bus.emit('executor.message', { text: 'Running tests now' });
    bus.emit('stage.committed', { stage: 'stage-01', sha: 'abc1234' });
    bus.emit('stage.completed', { stage: 'stage-01' });
    bus.emit('run.completed', { branch: 'b1' });
    bus.emit('run.blocked', { status: 'failed', reason: 'Error occurred' });
    bus.emit('log', { level: 'error', message: 'Test error message' });

    bus.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
