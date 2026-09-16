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
import { projectTrackedConfigPath } from '../../src/config/paths.js';
import { globalConfigPath, projectLocalConfigPath } from '../../src/core/config.js';
import { Orchestrator } from '../../src/orchestrator/Orchestrator.js';
import { RunStateStore } from '../../src/state/RunStateStore.js';
import { RUNS_ROOT, LATEST_FILE, LOCK_FILE } from '../../src/core/paths.js';
import { removeTree } from '../../src/core/fs.js';
import { VERSION } from '../../src/version.js';
import type { RunState } from '../../src/types.js';

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

test('dispatchCliCommand: tail invokes followInkUi when stdout is TTY', async (t) => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  let followCalled = false;
  t.mock.module('../../src/ui/InkUi.js', {
    namedExports: {
      followInkUi: async () => {
        followCalled = true;
      },
      startInkUi: async () => ({ close: () => {} }),
      App: {},
      reducer: (state: unknown) => state
    }
  });

  const testRunId = `tail-tty-${Date.now()}`;
  const runDir = path.join(RUNS_ROOT, testRunId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'run.json'),
    JSON.stringify({
      version: 1,
      run_id: testRunId,
      status: 'completed',
      workspace: process.cwd(),
      base_ref: 'HEAD',
      base_commit: 'abc1234',
      original_branch: 'main',
      original_head: 'abc1234',
      branch: 'ai-harness/tail-tty',
      branch_created: true,
      stage_source: '/dummy',
      feature: null,
      stages: [],
      executor_harness: 'cursor',
      reviewer_harness: 'codex',
      quality_cmd: 'npm test'
    })
  );
  fs.writeFileSync(path.join(runDir, 'ui-events.jsonl'), '');
  fs.writeFileSync(LATEST_FILE, testRunId + '\n');

  const origTTY = process.stdout.isTTY;
  try {
    process.stdout.isTTY = true;
    const code = await dispatchCliCommand({ kind: 'tail', runId: testRunId });
    assert.equal(code, 0);
    assert.equal(followCalled, true);
  } finally {
    process.stdout.isTTY = origTTY;
    removeTree(runDir);
    fs.rmSync(LATEST_FILE, { force: true });
  }
});

test('dispatchCliCommand: init and config init commands', async () => {
  const trackedConfig = projectTrackedConfigPath();
  const originalContent = fs.existsSync(trackedConfig)
    ? fs.readFileSync(trackedConfig, 'utf8')
    : null;

  try {
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
  } finally {
    if (originalContent !== null) {
      fs.writeFileSync(trackedConfig, originalContent, 'utf8');
    } else if (fs.existsSync(trackedConfig)) {
      fs.unlinkSync(trackedConfig);
    }
  }
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

test('dispatchCliCommand: config init project scope writes tracked config path', async () => {
  const trackedPath = projectTrackedConfigPath();
  const orig = fs.existsSync(trackedPath) ? fs.readFileSync(trackedPath, 'utf8') : null;
  try {
    const logs = await captureLog(async () => {
      const code = await dispatchCliCommand({
        kind: 'config',
        subCommand: 'init',
        targetScope: 'project',
        force: true
      });
      assert.equal(code, 0);
    });
    assert.ok(logs.some((l) => l.includes('config') || l.includes('.jsonc')));
    assert.ok(fs.existsSync(trackedPath));
  } finally {
    if (orig !== null) fs.writeFileSync(trackedPath, orig, 'utf8');
    else if (fs.existsSync(trackedPath)) fs.unlinkSync(trackedPath);
  }
});

test('dispatchCliCommand: run with compact UI on TTY starts Ink UI and closes on success', async (t) => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const tmpStageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-compact-stages-'));
  const stageDir = path.join(tmpStageDir, 'stage-01-compact');
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(path.join(stageDir, 'functional-spec.md'), '# Functional');
  fs.writeFileSync(path.join(stageDir, 'technical-spec.md'), '# Technical');
  fs.writeFileSync(path.join(stageDir, 'prompt.md'), '# Prompt');

  let inkStarted = false;
  let inkClosed = false;
  t.mock.module('../../src/ui/InkUi.js', {
    namedExports: {
      startInkUi: async () => {
        inkStarted = true;
        return {
          close: () => {
            inkClosed = true;
          }
        };
      }
    }
  });

  const origPreflight = Orchestrator.prototype.preflight;
  const origRun = Orchestrator.prototype.run;
  Orchestrator.prototype.preflight = async function () {
    return {
      executor: { ok: true, details: ['mock exec'] },
      reviewer: { ok: true, details: ['mock rev'] }
    };
  };
  Orchestrator.prototype.run = async function (st: RunState): Promise<RunState> {
    st.status = 'completed';
    new RunStateStore().save(st);
    return st;
  };

  const origTTY = process.stdout.isTTY;
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

  try {
    const code = await dispatchCliCommand({
      kind: 'run',
      stageSource: tmpStageDir,
      stages: ['01'],
      feature: '',
      ui: 'compact',
      executorHarness: 'cursor',
      reviewerHarness: 'codex'
    });
    assert.equal(code, 0);
    assert.equal(inkStarted, true);
    assert.equal(inkClosed, true);
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', { value: origTTY, configurable: true });
    Orchestrator.prototype.preflight = origPreflight;
    Orchestrator.prototype.run = origRun;
    fs.rmSync(tmpStageDir, { recursive: true, force: true });
  }
});

test('dispatchCliCommand: config init global and local scopes', async () => {
  const globalPath = globalConfigPath();
  const localPath = projectLocalConfigPath();
  const origGlobal = fs.existsSync(globalPath) ? fs.readFileSync(globalPath, 'utf8') : null;
  const origLocal = fs.existsSync(localPath) ? fs.readFileSync(localPath, 'utf8') : null;
  try {
    const globalLogs = await captureLog(async () => {
      const code = await dispatchCliCommand({
        kind: 'config',
        subCommand: 'init',
        targetScope: 'global',
        force: true
      });
      assert.equal(code, 0);
    });
    assert.ok(globalLogs.some((l) => l.includes('config') || l.includes('.jsonc')));

    const localLogs = await captureLog(async () => {
      const code = await dispatchCliCommand({
        kind: 'config',
        subCommand: 'init',
        targetScope: 'local',
        force: true
      });
      assert.equal(code, 0);
    });
    assert.ok(localLogs.some((l) => l.includes('config') || l.includes('.jsonc')));
  } finally {
    if (origGlobal !== null) fs.writeFileSync(globalPath, origGlobal, 'utf8');
    else if (fs.existsSync(globalPath)) fs.unlinkSync(globalPath);

    if (origLocal !== null) fs.writeFileSync(localPath, origLocal, 'utf8');
    else if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  }
});

test('dispatchCliCommand: preflight runs preflight checks', async () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const origPreflight = Orchestrator.prototype.preflight;
  Orchestrator.prototype.preflight = async function () {
    return {
      executor: { ok: true, details: ['mock executor ready'] },
      reviewer: { ok: true, details: ['mock reviewer ready'] }
    };
  };

  try {
    const logs = await captureLog(async () => {
      const code = await dispatchCliCommand({
        kind: 'preflight',
        stageSource: '',
        stages: [],
        feature: '',
        executorHarness: 'cursor',
        reviewerHarness: 'codex'
      });
      assert.equal(code, 0);
    });
    assert.ok(logs.some((l) => l.includes('Preflight OK')));
    assert.ok(logs.some((l) => l.includes('mock executor ready')));
  } finally {
    Orchestrator.prototype.preflight = origPreflight;
  }
});

test('dispatchCliCommand: preflight with stageSource and selectors', async () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-preflight-stage-'));
  const stageDir = path.join(tmpDir, 'stage-01-example');
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(path.join(stageDir, 'functional-spec.md'), '# Functional\n');
  fs.writeFileSync(path.join(stageDir, 'technical-spec.md'), '# Technical\n');
  fs.writeFileSync(path.join(stageDir, 'prompt.md'), '# Prompt\n');

  const origPreflight = Orchestrator.prototype.preflight;
  Orchestrator.prototype.preflight = async function () {
    return {
      executor: { ok: true, details: ['mock executor ready'] },
      reviewer: { ok: true, details: ['mock reviewer ready'] }
    };
  };

  try {
    const logs = await captureLog(async () => {
      const code = await dispatchCliCommand({
        kind: 'preflight',
        stageSource: tmpDir,
        stages: ['01'],
        feature: '',
        executorHarness: 'cursor',
        reviewerHarness: 'codex'
      });
      assert.equal(code, 0);
    });
    assert.ok(logs.some((l) => l.includes('Preflight OK')));
  } finally {
    Orchestrator.prototype.preflight = origPreflight;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('dispatchCliCommand: runs reset and empty list handling', async () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  if (fs.existsSync(LOCK_FILE)) {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: 0, run_id: 'unit-test-neutralized' }));
  }

  // reset all runs
  const resetLogs = await captureLog(async () => {
    const code = await dispatchCliCommand({
      kind: 'runs',
      subCommand: 'reset',
      force: true
    });
    assert.equal(code, 0);
  });
  assert.ok(resetLogs.some((l) => l.includes('deleted')));

  // list runs when empty
  const listLogs = await captureLog(async () => {
    const code = await dispatchCliCommand({
      kind: 'runs',
      subCommand: 'list',
      force: false
    });
    assert.equal(code, 0);
  });
  // Integration tests running in parallel may recreate runs immediately after reset.
  assert.ok(
    listLogs.some((l) => l.includes('No runs found.')) ||
      listLogs.some((l) => /\t/.test(l) && /completed|failed|unknown/.test(l))
  );

  // runs fallthrough
  const fallbackCode = await dispatchCliCommand({
    kind: 'runs',
    subCommand: 'unknown' as unknown as 'list',
    force: false
  });
  assert.equal(fallbackCode, 0);
});

test('dispatchCliCommand: validate returns error for missing or invalid stages', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-validate-empty-'));
  try {
    // empty directory
    const emptyLogs = await captureLog(async () => {
      const code = await dispatchCliCommand({
        kind: 'validate',
        stageSource: tmpDir,
        stages: []
      });
      assert.equal(code, 2);
    });
    assert.ok(emptyLogs.some((l) => l.includes('No stage folders found.')));

    // invalid stage (missing required prompt.md)
    const invalidDir = path.join(tmpDir, 'stage-02-invalid');
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(path.join(invalidDir, 'functional-spec.md'), '# F');
    const invalidLogs = await captureLog(async () => {
      const code = await dispatchCliCommand({
        kind: 'validate',
        stageSource: tmpDir,
        stages: ['02']
      });
      assert.equal(code, 2);
    });
    assert.ok(invalidLogs.some((l) => l.includes('stage-02-invalid')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('dispatchCliCommand: recover returns error on invalid run or failure', async () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const errorLogs: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    errorLogs.push(args.map(String).join(' '));
  };
  try {
    const code = await dispatchCliCommand({
      kind: 'recover',
      runId: 'non-existent-run-id-999999',
      apply: false,
      force: false
    });
    assert.equal(code, 1);
    assert.ok(errorLogs.some((l) => l.includes('ERROR:')));
  } finally {
    console.error = origError;
  }
});

test('dispatchCliCommand: run and resume execute full lifecycle', async () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const tmpStageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-run-stages-'));
  const stageDir = path.join(tmpStageDir, 'stage-01-mock');
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(path.join(stageDir, 'functional-spec.md'), '# Functional');
  fs.writeFileSync(path.join(stageDir, 'technical-spec.md'), '# Technical');
  fs.writeFileSync(path.join(stageDir, 'prompt.md'), '# Prompt');

  const origPreflight = Orchestrator.prototype.preflight;
  const origRun = Orchestrator.prototype.run;

  let createdRunId = '';
  Orchestrator.prototype.preflight = async function () {
    return {
      executor: { ok: true, details: ['mock exec'] },
      reviewer: { ok: true, details: ['mock rev'] }
    };
  };
  Orchestrator.prototype.run = async function (st: RunState): Promise<RunState> {
    createdRunId = st.run_id;
    st.status = 'completed';
    const store = new RunStateStore();
    store.save(st);
    return st;
  };

  const origTTY = process.stdout.isTTY;
  try {
    // 1. Run with ui: 'raw'
    const code = await dispatchCliCommand({
      kind: 'run',
      stageSource: tmpStageDir,
      stages: ['01'],
      feature: '',
      ui: 'raw',
      executorHarness: 'cursor',
      reviewerHarness: 'codex'
    });
    assert.equal(code, 0);
    assert.ok(createdRunId);

    // 2. Status without runId (loads latest)
    const statusLogs = await captureLog(async () => {
      const statusCode = await dispatchCliCommand({ kind: 'status' });
      assert.equal(statusCode, 0);
    });
    assert.ok(statusLogs.some((l) => l.includes(createdRunId)));

    // 3. Tail when event file does not exist
    const nonExistentFileRunId = `tail-missing-${Date.now()}`;
    const missingRunDir = path.join(RUNS_ROOT, nonExistentFileRunId);
    fs.mkdirSync(missingRunDir, { recursive: true });
    fs.writeFileSync(
      path.join(missingRunDir, 'run.json'),
      JSON.stringify({
        version: 1,
        run_id: nonExistentFileRunId,
        status: 'completed',
        branch: 'ai-harness/test-tail',
        workspace: process.cwd(),
        base_ref: 'HEAD',
        base_commit: 'abc1234',
        original_branch: 'main',
        original_head: 'abc1234',
        branch_created: true,
        stage_source: '/dummy',
        stages: [],
        executor_harness: 'cursor',
        reviewer_harness: 'codex',
        quality_cmd: 'npm test'
      })
    );
    try {
      const tailCode = await dispatchCliCommand({ kind: 'tail', runId: nonExistentFileRunId });
      assert.equal(tailCode, 0);
    } finally {
      removeTree(missingRunDir);
    }

    // 4. Resume latest run with TTY enabled and ui: 'line'
    process.stdout.isTTY = true;
    const resumeLogs = await captureLog(async () => {
      const resumeCode = await dispatchCliCommand({
        kind: 'resume',
        ui: 'line'
      });
      assert.equal(resumeCode, 0);
    });
    assert.ok(resumeLogs.some((l) => l.includes('AI run completed')));
  } finally {
    process.stdout.isTTY = origTTY;
    Orchestrator.prototype.preflight = origPreflight;
    Orchestrator.prototype.run = origRun;
    fs.rmSync(tmpStageDir, { recursive: true, force: true });
    if (createdRunId) {
      const runPath = path.join(RUNS_ROOT, createdRunId);
      removeTree(runPath);
    }
  }
});

test('dispatchCliCommand: run stringifies non-Error runtime failures', async () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const tmpStageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-string-err-'));
  const stageDir = path.join(tmpStageDir, 'stage-01-mock');
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(path.join(stageDir, 'functional-spec.md'), '# Functional');
  fs.writeFileSync(path.join(stageDir, 'technical-spec.md'), '# Technical');
  fs.writeFileSync(path.join(stageDir, 'prompt.md'), '# Prompt');

  const origPreflight = Orchestrator.prototype.preflight;
  const origRun = Orchestrator.prototype.run;
  const origError = console.error;
  const errorLogs: string[] = [];
  console.error = (...args: unknown[]) => {
    errorLogs.push(args.map(String).join(' '));
  };

  Orchestrator.prototype.preflight = async function () {
    return {
      executor: { ok: true, details: ['mock exec'] },
      reviewer: { ok: true, details: ['mock rev'] }
    };
  };
  Orchestrator.prototype.run = async function () {
    throw 'plain-runtime-error';
  };

  try {
    const code = await dispatchCliCommand({
      kind: 'run',
      stageSource: tmpStageDir,
      stages: ['01'],
      feature: '',
      ui: 'line',
      executorHarness: 'cursor',
      reviewerHarness: 'codex'
    });
    assert.equal(code, 3);
    assert.ok(errorLogs.some((l) => l.includes('plain-runtime-error')));
  } finally {
    console.error = origError;
    Orchestrator.prototype.preflight = origPreflight;
    Orchestrator.prototype.run = origRun;
    fs.rmSync(tmpStageDir, { recursive: true, force: true });
  }
});

test('dispatchCliCommand: run handles runtime execution failure and returns exit code 3', async () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const tmpStageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-fail-stages-'));
  const stageDir = path.join(tmpStageDir, 'stage-01-mock');
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(path.join(stageDir, 'functional-spec.md'), '# Functional');
  fs.writeFileSync(path.join(stageDir, 'technical-spec.md'), '# Technical');
  fs.writeFileSync(path.join(stageDir, 'prompt.md'), '# Prompt');

  const origPreflight = Orchestrator.prototype.preflight;
  const origRun = Orchestrator.prototype.run;
  const origError = console.error;
  const errorLogs: string[] = [];
  console.error = (...args: unknown[]) => {
    errorLogs.push(args.map(String).join(' '));
  };

  Orchestrator.prototype.preflight = async function () {
    return {
      executor: { ok: true, details: ['mock exec'] },
      reviewer: { ok: true, details: ['mock rev'] }
    };
  };
  Orchestrator.prototype.run = async function (): Promise<RunState> {
    throw new Error('Simulated stage run execution failure');
  };

  try {
    const code = await dispatchCliCommand({
      kind: 'run',
      stageSource: tmpStageDir,
      stages: ['01'],
      feature: '',
      ui: 'line',
      executorHarness: 'cursor',
      reviewerHarness: 'codex'
    });
    assert.equal(code, 3);
    assert.ok(errorLogs.some((l) => l.includes('Simulated stage run execution failure')));
  } finally {
    Orchestrator.prototype.preflight = origPreflight;
    Orchestrator.prototype.run = origRun;
    console.error = origError;
    fs.rmSync(tmpStageDir, { recursive: true, force: true });
    try {
      const store = new RunStateStore();
      const latest = store.loadLatest();
      if (latest && latest.stage_source.includes(tmpStageDir)) {
        removeTree(path.join(RUNS_ROOT, latest.run_id));
      }
    } catch {}
  }
});

test('dispatchCliCommand: run handles SIGINT interrupt cleanly', async () => {
  const ws = new ProjectWorkspace();
  ws.init(false);

  const tmpStageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-sigint-stages-'));
  const stageDir = path.join(tmpStageDir, 'stage-01-mock');
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(path.join(stageDir, 'functional-spec.md'), '# Functional');
  fs.writeFileSync(path.join(stageDir, 'technical-spec.md'), '# Technical');
  fs.writeFileSync(path.join(stageDir, 'prompt.md'), '# Prompt');

  const origPreflight = Orchestrator.prototype.preflight;
  const origRun = Orchestrator.prototype.run;
  const origExit = process.exit;

  let createdRunId = '';
  Orchestrator.prototype.preflight = async function () {
    return {
      executor: { ok: true, details: ['mock exec'] },
      reviewer: { ok: true, details: ['mock rev'] }
    };
  };
  let exitResolve!: (code: number) => void;
  const exitPromise = new Promise<number>((resolve) => {
    exitResolve = resolve;
  });

  Orchestrator.prototype.run = async function (st: RunState): Promise<RunState> {
    createdRunId = st.run_id;
    setTimeout(() => {
      process.emit('SIGINT');
    }, 10);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return st;
  };

  process.exit = ((code?: number) => {
    exitResolve(code ?? 0);
  }) as unknown as typeof process.exit;

  try {
    const runPromise = dispatchCliCommand({
      kind: 'run',
      stageSource: tmpStageDir,
      stages: ['01'],
      feature: '',
      ui: 'line',
      executorHarness: 'cursor',
      reviewerHarness: 'codex'
    });

    const exitCode = await exitPromise;
    assert.equal(exitCode, 130);
    await runPromise;
  } finally {
    process.exit = origExit;
    Orchestrator.prototype.preflight = origPreflight;
    Orchestrator.prototype.run = origRun;
    fs.rmSync(tmpStageDir, { recursive: true, force: true });
    if (createdRunId) {
      removeTree(path.join(RUNS_ROOT, createdRunId));
    }
  }
});
