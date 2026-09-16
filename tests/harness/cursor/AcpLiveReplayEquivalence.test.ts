/**
 * @fileoverview Live stream vs historical replay parity tests.
 *
 * Validates Criterion 6 of the Stage 01 Technical Specification:
 * Ensures that feeding identical multi-chunk ACP stream fixtures through both
 * the live AcpEventNormalizer and the historical replay parseAcpEvents()
 * produces 1:1 identical CommandObservation sequences, exit codes, and sequence numbers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AcpToolAccumulator } from '../../../src/harness/cursor/AcpToolAccumulator.js';
import { ObservationJournal } from '../../../src/harness/cursor/ObservationJournal.js';
import { AcpEventNormalizer } from '../../../src/harness/cursor/AcpEventNormalizer.js';
import { parseAcpEvents } from '../../../src/harness/cursor/CursorExecutorHarness.js';

test('AcpLiveReplayEquivalence (Criterion 6): live and replay yield identical observations', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-parity-test-'));
  const eventsFile = path.join(tmpDir, 'parity-events.jsonl');
  const journalFile = path.join(tmpDir, 'live-journal.jsonl');

  const fixtureMessages = [
    // Command 1: npm test (split across 3 updates)
    {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess-parity',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call_cmd_1',
          title: '`npm test`',
          status: 'pending',
          rawInput: { command: 'npm test' }
        }
      }
    },
    {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess-parity',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'call_cmd_1',
          status: 'in_progress'
        }
      }
    },
    {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess-parity',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'call_cmd_1',
          status: 'completed',
          rawOutput: { exit_code: 0, output: '10 tests passed' }
        }
      }
    },
    // Interleaved agent thought and message chunks
    {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess-parity',
        update: {
          sessionUpdate: 'agent_thought_chunk',
          content: { text: 'Running git diff next' }
        }
      }
    },
    // Command 2: git diff (completed in single chunk)
    {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess-parity',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call_cmd_2',
          title: '`git diff`',
          status: 'completed',
          rawInput: { command: 'git diff' },
          rawOutput: { code: 0, output: 'diff content' }
        }
      }
    },
    // Command 3: failed build check
    {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess-parity',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call_cmd_3',
          title: '`npm run build`',
          status: 'pending',
          rawInput: { command: 'npm run build' }
        }
      }
    },
    {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess-parity',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'call_cmd_3',
          status: 'failed',
          rawOutput: { exitCode: 1, output: 'Type error found' }
        }
      }
    }
  ];

  try {
    // 1. Live Normalizer Processing
    const liveAccumulator = new AcpToolAccumulator();
    const liveJournal = new ObservationJournal(journalFile);
    const normalizer = new AcpEventNormalizer({
      accumulator: liveAccumulator,
      journal: liveJournal,
      defaultSessionId: 'sess-parity',
      runId: 'run-parity-1',
      stageName: 'stage-parity',
      attempt: 1,
      workspace: tmpDir
    });

    for (const msg of fixtureMessages) {
      liveAccumulator.stepSequence();
      await normalizer.handleMessage(msg);
    }

    const liveObservations = liveJournal.getObservations();

    // 2. Write identical events to events.jsonl with SERVER prefix
    const serverLines = fixtureMessages.map((msg) => `SERVER ${JSON.stringify(msg)}`);
    fs.writeFileSync(eventsFile, serverLines.join('\n') + '\n', 'utf8');

    // 3. Historical Replay Processing
    const replayObservations = parseAcpEvents(eventsFile, {
      runId: 'run-parity-1',
      stageName: 'stage-parity',
      attempt: 1,
      workspace: tmpDir
    });

    // 4. Parity Assertions
    assert.equal(
      liveObservations.length,
      3,
      'Expected exactly 3 recorded observations in live stream'
    );
    assert.equal(
      replayObservations.length,
      3,
      'Expected exactly 3 recorded observations in replay stream'
    );

    for (let i = 0; i < liveObservations.length; i++) {
      const live = liveObservations[i];
      const replay = replayObservations[i];

      assert.equal(live.tool_call_id, replay.tool_call_id, `Item ${i}: tool_call_id mismatch`);
      assert.equal(live.command, replay.command, `Item ${i}: command mismatch`);
      assert.equal(live.status, replay.status, `Item ${i}: status mismatch`);
      assert.equal(live.exit_code, replay.exit_code, `Item ${i}: exit_code mismatch`);
      assert.equal(
        live.command_confidence,
        replay.command_confidence,
        `Item ${i}: confidence mismatch`
      );
      assert.equal(live.sequence, replay.sequence, `Item ${i}: sequence mismatch`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
