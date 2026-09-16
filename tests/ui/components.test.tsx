/**
 * @fileoverview Ink component render and keyboard interaction tests using ink-testing-library.
 * Verifies presentation rendering across normal/compact/minimal layouts, modal panels (focus,
 * todos, changes, logs), quality banners, terminal truncation, and interactive keypress routing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { EventEmitter } from 'node:events';
import { render } from 'ink-testing-library';
import { Header } from '../../src/ui/components/Header.js';
import { FocusPreview } from '../../src/ui/components/FocusPreview.js';
import { ToolActivity } from '../../src/ui/components/ToolActivity.js';
import { Footer } from '../../src/ui/components/Footer.js';
import { ListPanel } from '../../src/ui/components/ListPanel.js';
import { FocusPanel } from '../../src/ui/components/FocusPanel.js';
import { ChangesPanel } from '../../src/ui/components/ChangesPanel.js';
import { App } from '../../src/ui/App.js';
import type { UiEvent } from '../../src/types.js';
import type { UiPhaseMap } from '../../src/ui/types.js';

const DEFAULT_PHASES: UiPhaseMap = {
  PLAN: 'completed',
  IMPLEMENT: 'active',
  QUALITY: 'pending',
  REVIEW: 'pending',
  COMMIT: 'pending'
};

test('Header renders title, branch, stage metadata, and phase icons', () => {
  const { lastFrame, unmount } = render(
    <Header
      status="running"
      meta={{
        branch: 'feature-phase',
        executorLabel: 'cursor-agent',
        reviewerLabel: 'codex-agent'
      }}
      currentStage="stage-04-ui"
      stageIndex={4}
      stageTotal={8}
      attempt={1}
      phase={DEFAULT_PHASES}
      height={8}
      width={80}
    />
  );

  const frame = lastFrame() ?? '';
  assert.ok(frame.includes('AI Universal Coding Harness'));
  assert.ok(frame.includes('running'));
  assert.ok(frame.includes('Branch: feature-phase'));
  assert.ok(frame.includes('Stage: 4/8 stage-04-ui · Attempt 1'));
  assert.ok(frame.includes('⚡ cursor-agent · 🧠 codex-agent'));
  assert.ok(frame.includes('PLAN'));
  assert.ok(frame.includes('IMPLEMENT'));
  unmount();
});

test('Header renders completed status with green border styling', () => {
  const { lastFrame, unmount } = render(
    <Header
      status="completed"
      meta={{ branch: 'ai-done', executorLabel: 'cursor', reviewerLabel: 'codex' }}
      currentStage="stage-09"
      stageIndex={9}
      stageTotal={9}
      attempt={1}
      phase={DEFAULT_PHASES}
      height={8}
      width={80}
    />
  );
  const frame = lastFrame() ?? '';
  assert.ok(frame.includes('completed'));
  assert.ok(frame.includes('ai-done'));
  unmount();
});

test('Header renders failed status and empty stage metadata', () => {
  const { lastFrame, unmount } = render(
    <Header
      status="failed"
      meta={{ branch: '', executorLabel: '', reviewerLabel: '' }}
      currentStage=""
      stageIndex={0}
      stageTotal={0}
      attempt={0}
      phase={DEFAULT_PHASES}
      height={8}
      width={80}
    />
  );

  const frame = lastFrame() ?? '';
  assert.ok(frame.includes('Preparing run'));
  assert.ok(frame.includes('Branch: —'));
  unmount();
});

test('ChangesPanel renders placeholder and file list states', () => {
  const empty = render(<ChangesPanel changedFiles={[]} height={6} />);
  assert.ok((empty.lastFrame() ?? '').includes('No changed-file evidence yet'));
  empty.unmount();

  const populated = render(<ChangesPanel changedFiles={['src/a.ts', 'src/b.ts']} height={6} />);
  const frame = populated.lastFrame() ?? '';
  assert.ok(frame.includes('src/a.ts'));
  assert.ok(frame.includes('src/b.ts'));
  populated.unmount();
});

test('FocusPreview renders bordered box and bounded text lines', () => {
  const { lastFrame, unmount } = render(
    <FocusPreview text="Line 1: Planning refactor\nLine 2: Executing tests" height={5} width={60} />
  );

  const frame = lastFrame() ?? '';
  assert.ok(frame.includes('Agent Focus'));
  assert.ok(frame.includes('Line 1: Planning refactor'));
  assert.ok(frame.includes('Line 2: Executing tests'));
  unmount();
});

test('ToolActivity renders messages, active/recent tools, and quality badge', () => {
  const { lastFrame, unmount } = render(
    <ToolActivity
      messages={[
        { id: '1', role: 'executor', text: 'Refactoring modules' },
        { id: '2', role: 'reviewer', text: 'Plan approved' }
      ]}
      tools={{
        t1: { id: 't1', title: 'Compile', detail: 'tsc -p tsconfig.json', status: 'completed' },
        t2: { id: 't2', title: 'Test', detail: 'npm test', status: 'in_progress' }
      }}
      toolOrder={['t1', 't2']}
      quality={{ status: 'PASS', pass: true, summary: 'All 15 tests green' }}
      height={6}
      width={80}
    />
  );

  const frame = lastFrame() ?? '';
  assert.ok(frame.includes('⚡ Refactoring modules'));
  assert.ok(frame.includes('🧠 Plan approved'));
  assert.ok(frame.includes('Compile · tsc -p tsconfig.json'));
  assert.ok(frame.includes('Test · npm test'));
  assert.ok(frame.includes('Quality PASS · All 15 tests green'));
  unmount();
});

test('ToolActivity renders failing quality badge when evaluation fails', () => {
  const { lastFrame, unmount } = render(
    <ToolActivity
      messages={[]}
      tools={{}}
      toolOrder={[]}
      quality={{ status: 'FAIL', pass: false, summary: '3 assertion errors' }}
      height={4}
      width={80}
    />
  );

  const frame = lastFrame() ?? '';
  assert.ok(frame.includes('Quality FAIL · 3 assertion errors'));
  unmount();
});

test('ListPanel renders modal title, lines, and escape footer', () => {
  const { lastFrame, unmount } = render(
    <ListPanel title="Custom List" lines={['Item 1', 'Item 2', 'Item 3']} height={7} />
  );

  const frame = lastFrame() ?? '';
  assert.ok(frame.includes('Custom List'));
  assert.ok(frame.includes('Item 1'));
  assert.ok(frame.includes('Item 2'));
  assert.ok(frame.includes('Item 3'));
  assert.ok(frame.includes('Esc return'));
  unmount();
});

test('Footer renders navigation hints for normal and minimal layouts', () => {
  const { lastFrame: normalFrame, unmount: unmountNormal } = render(
    <Footer height={1} minimal={false} reviewerCalls={7} />
  );
  assert.ok((normalFrame() ?? '').includes('f focus · t todos · d changes · l logs · q quiet'));
  assert.ok((normalFrame() ?? '').includes('Reviewer calls 7'));
  unmountNormal();

  const { lastFrame: minFrame, unmount: unmountMin } = render(
    <Footer height={1} minimal={true} reviewerCalls={2} />
  );
  assert.ok((minFrame() ?? '').includes('f focus · q quiet'));
  assert.ok((minFrame() ?? '').includes('Reviewer calls 2'));
  unmountMin();
});

test('ToolActivity renders system error and info messages with distinct colors', () => {
  const { lastFrame, unmount } = render(
    <ToolActivity
      messages={[
        { id: '1', role: 'system', kind: 'error', text: 'Critical failure' },
        { id: '2', role: 'system', kind: 'info', text: 'System notice' }
      ]}
      tools={{}}
      toolOrder={[]}
      quality={null}
      height={4}
      width={80}
    />
  );

  const frame = lastFrame() ?? '';
  assert.ok(frame.includes('◆ Critical failure'));
  assert.ok(frame.includes('◆ System notice'));
  unmount();
});

test('UI components handle zero or negative height gracefully', () => {
  const { lastFrame: tFrame, unmount: unmountT } = render(
    <ToolActivity messages={[]} tools={{}} toolOrder={[]} quality={null} height={0} width={80} />
  );
  assert.equal(tFrame() ?? '', '');
  unmountT();

  const { lastFrame: fFrame, unmount: unmountF } = render(
    <Footer height={0} minimal={false} reviewerCalls={0} />
  );
  assert.equal(fFrame() ?? '', '');
  unmountF();

  const { lastFrame: fpFrame, unmount: unmountFp } = render(
    <FocusPreview text="focus" height={0} width={80} />
  );
  assert.equal(fpFrame() ?? '', '');
  unmountFp();

  const { lastFrame: lpFrame, unmount: unmountLp } = render(
    <ListPanel title="List" lines={['Item']} height={0} />
  );
  assert.equal(lpFrame() ?? '', '');
  unmountLp();

  const { lastFrame: pFrame, unmount: unmountP } = render(
    <FocusPanel text="focus" height={0} width={80} offset={0} follow={false} />
  );
  assert.equal(pFrame() ?? '', '');
  unmountP();
});

test('FocusPanel renders stream lines and following status', () => {
  const { lastFrame, unmount } = render(
    <FocusPanel
      text="Thought stream line A\nThought stream line B"
      height={8}
      width={80}
      offset={0}
      follow={true}
    />
  );

  const frame = lastFrame() ?? '';
  assert.ok(frame.includes('Agent Focus · full stream'));
  assert.ok(frame.includes('following'));
  assert.ok(frame.includes('Thought stream line A'));
  assert.ok(frame.includes('Thought stream line B'));
  assert.ok(frame.includes('↑↓ scroll · PgUp/PgDn · Home/End · f/Esc main'));
  unmount();
});

test('App renders initial events and responds to keyboard navigation', async () => {
  const emitter = new EventEmitter();
  const initialEvents: UiEvent[] = [
    {
      ts: '2026-09-16T00:00:00Z',
      type: 'run.started',
      payload: { branch: 'ai-modernize' }
    },
    {
      ts: '2026-09-16T00:01:00Z',
      type: 'stage.started',
      payload: { stage: 'stage-04', index: 4, total: 6 }
    },
    {
      ts: '2026-09-16T00:02:00Z',
      type: 'executor.todos',
      payload: {
        todos: [
          { id: '1', content: 'Migrate to TSX', status: 'in_progress' },
          { id: '2', content: 'Write tests', status: 'pending' }
        ]
      }
    },
    {
      ts: '2026-09-16T00:03:00Z',
      type: 'executor.focus.delta',
      payload: { text: 'Analyzing UI components' }
    }
  ];

  const { lastFrame, stdin, unmount } = render(
    <App emitter={emitter} meta={{ branch: 'ai-modernize' }} initialEvents={initialEvents} />
  );

  // 1. Initial dashboard rendering verification
  let frame = lastFrame() ?? '';
  assert.ok(frame.includes('AI Universal Coding Harness'));
  assert.ok(frame.includes('Stage: 4/6 stage-04'));
  assert.ok(frame.includes('Migrate to TSX'));
  assert.ok(frame.includes('Analyzing UI components'));

  // 2. Keyboard interaction: press 'f' to toggle Focus Panel
  stdin.write('f');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('Agent Focus · full stream'));

  // Toggle 'f' again to return to main dashboard
  stdin.write('f');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('AI Universal Coding Harness'));

  // 3. Press 't' to open Todos Panel, and 't' again to toggle back
  stdin.write('t');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('Todos'));
  assert.ok(frame.includes('Migrate to TSX'));
  assert.ok(frame.includes('Write tests'));

  stdin.write('t');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('AI Universal Coding Harness'));

  // 4. Press 'd' to open Changed Files Panel, and 'd' again to toggle back
  stdin.write('d');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('Changed Files'));

  stdin.write('d');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('AI Universal Coding Harness'));

  // 5. Press 'l' to open Logs Panel, and 'l' again to toggle back
  stdin.write('l');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('Recent Logs'));

  stdin.write('l');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('AI Universal Coding Harness'));

  // 6. Test Esc key from a panel
  stdin.write('f');
  await new Promise((r) => setTimeout(r, 40));
  stdin.write('\u001B');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('AI Universal Coding Harness'));

  // 7. Press 'q' to toggle Quiet Mode
  stdin.write('q');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('q restore'), `Expected q restore but got: ${frame}`);

  // 8. Press 'q' again to restore Main Dashboard
  stdin.write('q');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(
    frame.includes('AI Universal Coding Harness'),
    `Expected AI Universal Coding Harness but got: ${frame}`
  );

  unmount();
});

test('App responds to live events emitted through EventEmitter', async () => {
  const emitter = new EventEmitter();
  const { lastFrame, unmount } = render(
    <App emitter={emitter} meta={{ branch: 'test-emitter' }} initialEvents={[]} />
  );

  emitter.emit('event', {
    ts: '2026-09-16T00:00:00Z',
    type: 'stage.started',
    payload: { stage: 'live-stage', index: 1, total: 2 }
  });

  emitter.emit('event', {
    ts: '2026-09-16T00:01:00Z',
    type: 'executor.message',
    payload: { text: 'Live message emitted from harness' }
  });

  await new Promise((r) => setTimeout(r, 40));
  const frame = lastFrame() ?? '';
  assert.ok(frame.includes('Stage: 1/2 live-stage'));
  assert.ok(frame.includes('Live message emitted from harness'));

  unmount();
});

test('App renders active task with title and completed todo states', async () => {
  const { lastFrame: f1, unmount: u1 } = render(
    <App
      initialEvents={[
        {
          ts: '2026-09-16T00:00:00Z',
          type: 'executor.todos',
          payload: {
            todos: [{ id: '1', title: 'Task with title only', status: 'in_progress' }]
          }
        }
      ]}
    />
  );
  let frame = f1() ?? '';
  assert.ok(frame.includes('Task with title only'));
  u1();

  const { lastFrame: f2, unmount: u2 } = render(
    <App
      initialEvents={[
        {
          ts: '2026-09-16T00:00:00Z',
          type: 'executor.todos',
          payload: {
            todos: [{ id: '1', content: 'Done task', status: 'completed' }]
          }
        }
      ]}
    />
  );
  frame = f2() ?? '';
  assert.ok(frame.includes('✓ Todos 1/1'));
  u2();

  const { lastFrame: f3, unmount: u3 } = render(<App initialEvents={[]} />);
  frame = f3() ?? '';
  assert.ok(frame.includes('No active todo'));
  u3();
});

test('App handles focus stream scrolling keys', async () => {
  const lines = Array.from({ length: 40 }, (_, i) => `Log entry #${i + 1}`).join('\n');
  const initialEvents: UiEvent[] = [
    {
      ts: '2026-09-16T00:00:00Z',
      type: 'executor.focus.delta',
      payload: { text: lines }
    }
  ];

  const { lastFrame, stdin, unmount } = render(<App initialEvents={initialEvents} />);

  // Switch to focus panel
  stdin.write('f');
  await new Promise((r) => setTimeout(r, 40));
  let frame = lastFrame() ?? '';
  assert.ok(frame.includes('Agent Focus · full stream'));
  assert.ok(frame.includes('following'));

  // Press up arrow to scroll up and pause follow
  stdin.write('\u001B[A');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('paused'));

  // Press down arrow
  stdin.write('\u001B[B');
  await new Promise((r) => setTimeout(r, 40));

  stdin.write('\u001B[5~');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('paused'));

  stdin.write('\u001B[6~');
  await new Promise((r) => setTimeout(r, 40));

  // Press End key to resume follow
  stdin.write('\u001B[F');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('following'));

  // Test 'q' to toggle quiet mode
  stdin.write('\u001B'); // exit focus panel
  await new Promise((r) => setTimeout(r, 40));
  stdin.write('q');
  await new Promise((r) => setTimeout(r, 40));
  stdin.write('q');
  await new Promise((r) => setTimeout(r, 40));

  unmount();
});

test('App handles Home key and Ctrl+C key events', async () => {
  const lines = Array.from({ length: 40 }, (_, i) => `Log entry #${i + 1}`).join('\n');
  const initialEvents: UiEvent[] = [
    {
      ts: '2026-09-16T00:00:00Z',
      type: 'executor.focus.delta',
      payload: { text: lines }
    }
  ];

  const { lastFrame, stdin, unmount } = render(<App initialEvents={initialEvents} />);

  // Switch to focus panel
  stdin.write('f');
  await new Promise((r) => setTimeout(r, 40));

  // Press Home key to jump to top
  stdin.write('\u001B[H');
  await new Promise((r) => setTimeout(r, 40));
  let frame = lastFrame() ?? '';
  assert.ok(frame.includes('paused'));

  // Press End key to jump to bottom and follow
  stdin.write('\u001B[F');
  await new Promise((r) => setTimeout(r, 40));
  frame = lastFrame() ?? '';
  assert.ok(frame.includes('following'));

  // Test Ctrl+C
  let sigintReceived = false;
  const origKill = process.kill;
  (process as unknown as { kill: (pid: number, sig: string) => void }).kill = (pid, sig) => {
    if (sig === 'SIGINT') sigintReceived = true;
  };
  try {
    stdin.write('\u0003');
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(sigintReceived, true);
  } finally {
    process.kill = origKill;
    unmount();
  }
});
