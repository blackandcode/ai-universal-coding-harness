/**
 * @fileoverview Unit tests for CLI dispatch routing in src/cli/dispatch.ts.
 *
 * Validates dispatching of typed CliCommand inputs to appropriate subsystem handlers:
 * - help and version commands
 * - config subcommands (paths, show, init)
 * - run management (list, delete, reset)
 * - stage operations (list-stages, inspect, validate)
 * - runtime status reporting and event tailing
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { dispatchCliCommand } from '../../src/cli/dispatch.js';
import { ProjectWorkspace } from '../../src/project/ProjectWorkspace.js';
import { RUNS_ROOT, LATEST_FILE } from '../../src/core/paths.js';
import { VERSION } from '../../src/version.js';

/**
 * Captures console.log output during synchronous or asynchronous execution.
 */
async function captureLog(fn: () => Promise<void> | void): Promise<string[]> {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return lines;
}

test('dispatchCliCommand: help and version display correct information', async () => {
  const helpLogs = await captureLog(async () => {
    const code = await dispatchCliCommand({ kind: 'help' });
    assert.equal(code, 0);
  });
  assert.ok(helpLogs.some((l) => l.includes('Usage:')));
  assert.ok(helpLogs.some((l) => l.includes(VERSION)));

  const versionLogs = await captureLog(async () => {
    const code = await dispatchCliCommand({ kind: 'version' });
    assert.equal(code, 0);
  });
  assert.ok(versionLogs.some((l) => l.includes(VERSION)));
});

test('dispatchCliCommand: config paths and show subcommands output valid JSON', async () => {
  const pathsLogs = await captureLog(async () => {
    const code = await dispatchCliCommand({
      kind: 'config',
      subCommand: 'paths',
      targetScope: 'project',
      force: false
    });
    assert.equal(code, 0);
  });
  const parsedPaths = JSON.parse(pathsLogs.join('\n'));
  assert.ok(parsedPaths.global);
  assert.ok(parsedPaths.project);
  assert.ok(parsedPaths.projectRoot);

  const showLogs = await captureLog(async () => {
    const code = await dispatchCliCommand({
      kind: 'config',
      subCommand: 'show',
      targetScope: 'project',
      force: false
    });
    assert.equal(code, 0);
  });
  const parsedConfig = JSON.parse(showLogs.join('\n'));
  assert.ok(parsedConfig.effective.permissionMode);
  assert.ok(parsedConfig.effective.branchPrefix);
});

test('dispatchCliCommand: runs list, delete, and reset subcommands', async () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const testRunId = `dispatch-run-${Date.now()}`;
  const runDir = path.join(RUNS_ROOT, testRunId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'run.json'),
    JSON.stringify({
      version: 1,
      run_id: testRunId,
      status: 'completed',
      branch: 'ai-harness/test-dispatch',
      updated_at: new Date().toISOString()
    })
  );

  try {
    const listLogs = await captureLog(async () => {
      const code = await dispatchCliCommand({ kind: 'runs', subCommand: 'list', force: false });
      assert.equal(code, 0);
    });
    assert.ok(listLogs.some((l) => l.includes(testRunId)));

    // Refuses delete without force
    await assert.rejects(
      async () =>
        dispatchCliCommand({ kind: 'runs', subCommand: 'delete', runId: testRunId, force: false }),
      /--force/
    );

    // Deletes with force
    const deleteLogs = await captureLog(async () => {
      const code = await dispatchCliCommand({
        kind: 'runs',
        subCommand: 'delete',
        runId: testRunId,
        force: true
      });
      assert.equal(code, 0);
    });
    assert.ok(deleteLogs.some((l) => l.includes(`Deleted run ${testRunId}`)));
  } finally {
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  }
});

test('dispatchCliCommand: list-stages, inspect, and validate against stage source fixture', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-stage-'));
  const stageDir = path.join(tmpDir, 'stage-01-example');
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(path.join(stageDir, 'functional-spec.md'), '# Functional\nContent\n');
  fs.writeFileSync(path.join(stageDir, 'technical-spec.md'), '# Technical\nContent\n');
  fs.writeFileSync(path.join(stageDir, 'prompt.md'), '# Prompt\nContent\n');

  try {
    // list-stages
    const listLogs = await captureLog(async () => {
      const code = await dispatchCliCommand({
        kind: 'list-stages',
        stageSource: tmpDir
      });
      assert.equal(code, 0);
    });
    assert.ok(listLogs.some((l) => l.includes('stage-01-example')));

    // inspect
    const inspectLogs = await captureLog(async () => {
      const code = await dispatchCliCommand({
        kind: 'inspect',
        stageSource: tmpDir,
        stages: ['01']
      });
      assert.equal(code, 0);
    });
    assert.ok(inspectLogs.some((l) => l.includes('stage-01-example')));

    // validate
    const validateLogs = await captureLog(async () => {
      const code = await dispatchCliCommand({
        kind: 'validate',
        stageSource: tmpDir,
        stages: ['01']
      });
      assert.equal(code, 0);
    });
    assert.ok(validateLogs.some((l) => l.includes('✓ stage-01-example')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('dispatchCliCommand: status and tail commands', async () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const testRunId = `status-test-${Date.now()}`;
  const runDir = path.join(RUNS_ROOT, testRunId);
  fs.mkdirSync(runDir, { recursive: true });

  const runState = {
    version: 1,
    run_id: testRunId,
    status: 'completed',
    workspace: process.cwd(),
    base_ref: 'HEAD',
    base_commit: 'abc1234',
    original_branch: 'main',
    original_head: 'abc1234',
    branch: 'ai-harness/status-test',
    branch_created: true,
    stage_source: '/dummy',
    feature: null,
    stages: [],
    executor_harness: 'cursor',
    reviewer_harness: 'codex',
    quality_cmd: 'npm test'
  };

  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(runState));
  fs.writeFileSync(path.join(runDir, 'ui-events.jsonl'), '{"type":"test.event","payload":{}}\n');
  fs.writeFileSync(LATEST_FILE, testRunId + '\n');

  try {
    const statusLogs = await captureLog(async () => {
      const code = await dispatchCliCommand({ kind: 'status', runId: testRunId });
      assert.equal(code, 0);
    });
    const parsedState = JSON.parse(statusLogs.join('\n'));
    assert.equal(parsedState.run_id, testRunId);
    assert.equal(parsedState.status, 'completed');

    const code = await dispatchCliCommand({ kind: 'tail', runId: testRunId });
    assert.equal(code, 0);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.rmSync(LATEST_FILE, { force: true });
  }
});

test('dispatchCliCommand: init and config init commands', async () => {
  const initLogs = await captureLog(async () => {
    const code = await dispatchCliCommand({ kind: 'init', force: false });
    assert.equal(code, 0);
  });
  assert.ok(initLogs.some((l) => l.includes('initialized')));

  const configInitLogs = await captureLog(async () => {
    const code = await dispatchCliCommand({
      kind: 'config',
      subCommand: 'init',
      targetScope: 'project',
      force: true
    });
    assert.equal(code, 0);
  });
  assert.ok(
    configInitLogs.some(
      (l) => l.includes('.ai-universal-coding-harness.jsonc') || l.includes('config')
    )
  );
});

test('dispatchCliCommand: recover command outputs recovery audit trail', async () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const testRunId = `recover-test-${Date.now()}`;
  const runDir = path.join(RUNS_ROOT, testRunId);
  fs.mkdirSync(runDir, { recursive: true });

  const runState = {
    version: 1,
    run_id: testRunId,
    status: 'failed',
    workspace: process.cwd(),
    base_ref: 'HEAD',
    base_commit: 'abc1234',
    original_branch: 'main',
    original_head: 'abc1234',
    branch: 'ai-harness/recover-test',
    branch_created: true,
    stage_source: '/dummy',
    feature: null,
    stages: [
      {
        name: 'stage-01-rec',
        selector: '01',
        status: 'failed',
        manifest: {
          name: 'stage-01-rec',
          selector: '01',
          source: '/dummy',
          relative_path: 'stage-01-rec',
          sha256: {}
        }
      }
    ],
    executor_harness: 'cursor',
    reviewer_harness: 'codex',
    quality_cmd: 'npm test'
  };

  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(runState));

  try {
    const recoverLogs = await captureLog(async () => {
      const code = await dispatchCliCommand({
        kind: 'recover',
        runId: testRunId,
        apply: false,
        force: false
      });
      assert.equal(code, 0);
    });
    assert.ok(recoverLogs.some((l) => l.includes(testRunId)));
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});
