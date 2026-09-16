/**
 * @fileoverview Unit tests for JSONL event file reading and tailing.
 * Verifies missing file handling, invalid JSON tolerance, partial line buffering,
 * bounded tail slicing, and live event follow polling.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRecentEvents, followEventFile } from '../../src/ui/eventFile.js';
import type { UiEvent } from '../../src/types.js';

test('readRecentEvents handles missing and empty files safely', () => {
  const missing = readRecentEvents('/nonexistent/event/path.jsonl');
  assert.deepEqual(missing, []);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-file-test-'));
  const emptyPath = path.join(tmpDir, 'empty.jsonl');
  fs.writeFileSync(emptyPath, '');

  try {
    const empty = readRecentEvents(emptyPath);
    assert.deepEqual(empty, []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readRecentEvents parses valid events and skips corrupted lines', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-file-test-'));
  const filePath = path.join(tmpDir, 'events.jsonl');

  const lines = [
    JSON.stringify({ ts: '2026-09-16T00:00:00Z', type: 'run.started', payload: {} }),
    '{ "broken": json line without closing',
    'plain string line',
    JSON.stringify({ ts: '2026-09-16T00:01:00Z', type: 'stage.started', payload: { stage: 's1' } })
  ];
  fs.writeFileSync(filePath, lines.join('\n') + '\n');

  try {
    const events = readRecentEvents(filePath);
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'run.started');
    assert.equal(events[1].type, 'stage.started');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readRecentEvents bounds by maxBytes and maxCount', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-file-test-'));
  const filePath = path.join(tmpDir, 'events.jsonl');

  const lines: string[] = [];
  for (let i = 1; i <= 20; i++) {
    lines.push(
      JSON.stringify({
        ts: '2026-09-16T00:00:00Z',
        type: 'log',
        payload: {
          message: `Log event message #${i} with some padding text to increase byte length`
        }
      })
    );
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n');

  try {
    // Test count bounding
    const boundedCount = readRecentEvents(filePath, 1024 * 1024, 5);
    assert.equal(boundedCount.length, 5);
    const fifthPayload = boundedCount[4].payload as Record<string, unknown>;
    assert.equal(
      fifthPayload.message,
      'Log event message #20 with some padding text to increase byte length'
    );

    // Test byte bounding: only read small trailing window (e.g. 250 bytes)
    const boundedBytes = readRecentEvents(filePath, 250, 100);
    assert.ok(boundedBytes.length > 0 && boundedBytes.length < 5);
    const lastEvent = boundedBytes.at(-1);
    assert.ok(lastEvent);
    const lastPayload = lastEvent.payload as Record<string, unknown>;
    assert.equal(
      lastPayload.message,
      'Log event message #20 with some padding text to increase byte length'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('followEventFile tails newly appended lines and buffers partial lines across ticks', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-file-test-'));
  const filePath = path.join(tmpDir, 'tail.jsonl');

  // Pre-populate with one event
  const initialEvent = { ts: '2026-09-16T00:00:00Z', type: 'run.started', payload: { id: 'pre' } };
  fs.writeFileSync(filePath, JSON.stringify(initialEvent) + '\n');

  const received: UiEvent[] = [];
  const watcher = followEventFile(
    filePath,
    (e) => {
      received.push(e);
    },
    20 // 20ms poll interval for fast testing
  );

  try {
    // Append a full event
    const event1 = { ts: '2026-09-16T00:01:00Z', type: 'stage.started', payload: { stage: 's1' } };
    fs.appendFileSync(filePath, JSON.stringify(event1) + '\n');

    await new Promise((r) => setTimeout(r, 60));
    assert.equal(received.length, 1);
    assert.equal(received[0].type, 'stage.started');

    // Append half a line
    const event2 = {
      ts: '2026-09-16T00:02:00Z',
      type: 'stage.completed',
      payload: { stage: 's1' }
    };
    const serialized = JSON.stringify(event2);
    const half1 = serialized.slice(0, 20);
    const half2 = serialized.slice(20) + '\n';

    fs.appendFileSync(filePath, half1);
    await new Promise((r) => setTimeout(r, 60));
    // Still only 1 event received because line was incomplete
    assert.equal(received.length, 1);

    // Append second half
    fs.appendFileSync(filePath, half2);
    await new Promise((r) => setTimeout(r, 60));

    // Now second event should be received
    assert.equal(received.length, 2);
    assert.equal(received[1].type, 'stage.completed');
    const secondPayload = received[1].payload as Record<string, unknown>;
    assert.equal(secondPayload.stage, 's1');

    // Test file truncation / rotation reset
    fs.writeFileSync(
      filePath,
      JSON.stringify({ ts: '2026-09-16T00:03:00Z', type: 'run.completed', payload: {} }) + '\n'
    );
    await new Promise((r) => setTimeout(r, 60));
    assert.ok(received.length >= 3);
    assert.equal(received.at(-1)?.type, 'run.completed');
  } finally {
    watcher.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('followEventFile handles initially missing file and watcher stop', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-file-missing-'));
  const filePath = path.join(tmpDir, 'not-yet.jsonl');
  const received: UiEvent[] = [];
  const watcher = followEventFile(filePath, (e) => received.push(e), 20);

  try {
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(received.length, 0);

    fs.writeFileSync(
      filePath,
      JSON.stringify({ ts: '2026-09-16T00:00:00Z', type: 'run.started', payload: {} }) + '\n'
    );
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(received.length, 1);

    watcher.stop();
    fs.appendFileSync(
      filePath,
      JSON.stringify({ ts: '2026-09-16T00:01:00Z', type: 'stage.started', payload: {} }) + '\n'
    );
    await new Promise((r) => setTimeout(r, 60));
    // No new events because watcher stopped
    assert.equal(received.length, 1);
  } finally {
    watcher.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
