/**
 * @fileoverview CLI command dispatcher for AI Universal Coding Harness.
 * Routes typed CliCommand objects to specific domain handlers and coordinates exit codes.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CliCommand } from './parser.js';
import {
  CONFIG,
  PROJECT_ROOT,
  configSummary,
  globalConfigPath,
  projectLocalConfigPath,
  projectTrackedConfigPath,
  writeConfig
} from '../core/config.js';
import { ROOT, STATE_ROOT } from '../core/paths.js';
import { StageSource } from '../stages/StageSource.js';
import { Orchestrator } from '../orchestrator/Orchestrator.js';
import { RunStateStore } from '../state/RunStateStore.js';
import { RunLock } from '../state/RunLock.js';
import { EventBus } from '../ui/EventBus.js';
import { ProjectWorkspace } from '../project/ProjectWorkspace.js';
import { VERSION, PRODUCT_NAME } from '../version.js';
import type { RunState } from '../types.js';

/** Prints CLI usage, command list, and stage contract summary to stdout. */
export function printHelp(): void {
  console.log(
    `${PRODUCT_NAME} v${VERSION}\n\nUsage:\n  ai-harness <command> [options]\n\nStart a project:\n  ai-harness init\n  ai-harness validate --stage-source <dir|zip> --stage 06\n  ai-harness preflight --stage-source <dir|zip> --stage 06\n  ai-harness run --stage-source <dir|zip> --stage 06 [--stage 07 ...]\n\nRun lifecycle:\n  ai-harness resume [--run <run-id>]\n  ai-harness recover [--run <run-id>] [--stage <stage>] [--dry-run] [--apply]\n  ai-harness status [--run <run-id>]\n  ai-harness tail [--run <run-id>]\n  ai-harness runs list\n  ai-harness runs delete --run <run-id> --force\n  ai-harness runs reset --force\n\nStage discovery:\n  ai-harness list-stages --stage-source <dir|zip> [--feature token]\n  ai-harness inspect --stage-source <dir|zip> --stage 06\n  ai-harness validate --stage-source <dir|zip> [--stage 06 ...]\n\nConfiguration:\n  ai-harness config paths\n  ai-harness config show\n  ai-harness config init --global\n  ai-harness config init --project\n  ai-harness config init --local\n\nProject targeting:\n  --project <path>   Target another Git repository.\n\nStage contract:\n  stage-NN-kebab-name/{functional-spec.md,technical-spec.md,prompt.md}\n\nOne run = one dedicated AI branch. One approved stage = one commit. No push or merge.`
  );
}

/**
 * Handles `config` subcommands: path listing, effective config dump, and template initialization.
 *
 * @param cmd - Parsed config command with subcommand and scope flags.
 */
export function handleConfigCommand(cmd: Extract<CliCommand, { kind: 'config' }>): void {
  if (cmd.subCommand === 'paths') {
    console.log(
      JSON.stringify(
        {
          global: globalConfigPath(),
          project: projectTrackedConfigPath(),
          projectLocal: projectLocalConfigPath(),
          projectRoot: PROJECT_ROOT
        },
        null,
        2
      )
    );
    return;
  }
  if (cmd.subCommand === 'show') {
    console.log(JSON.stringify(configSummary(), null, 2));
    return;
  }
  if (cmd.subCommand === 'init') {
    const target =
      cmd.targetScope === 'global'
        ? globalConfigPath()
        : cmd.targetScope === 'local'
          ? projectLocalConfigPath()
          : projectTrackedConfigPath();
    console.log(writeConfig(target, cmd.force));
    return;
  }
}

/**
 * Creates the run UI event bus and optional Ink dashboard for an active run.
 *
 * @param runId - Durable run identifier.
 * @param state - Current run state used for dashboard metadata.
 * @param mode - UI mode override (`line`, `raw`, `compact`, etc.).
 * @returns Event bus handle and a `close` cleanup function.
 */
async function makeUi(runId: string, state: RunState, mode?: string) {
  const file = path.join(STATE_ROOT, 'runs', runId, 'ui-events.jsonl');
  const effective = mode || (!process.stdout.isTTY ? 'line' : 'compact');
  const events = new EventBus(
    file,
    effective === 'line',
    CONFIG.runLogMaxBytes,
    CONFIG.uiEventCoalesceMs
  );
  if (effective === 'raw') {
    events.emitter.on('event', (e: unknown) => console.log(JSON.stringify(e)));
  }
  let ink: { close?: () => void } | null = null;
  if (process.stdout.isTTY && !['line', 'raw'].includes(effective)) {
    const { startInkUi } = await import('../ui/InkUi.js');
    ink = await startInkUi({
      emitter: events.emitter,
      eventFile: file,
      meta: {
        runId,
        branch: state.branch,
        stageTotal: state.stages?.length || 0,
        status: state.status,
        dashboardMaxRows: CONFIG.uiDashboardMaxRows,
        executorLabel: state.executor_label || state.executor_harness,
        reviewerLabel: state.reviewer_label || state.reviewer_harness
      }
    });
  }
  return {
    events,
    close: () => {
      events.close();
      ink?.close?.();
    }
  };
}

/**
 * Prints validation results for each stage directory and returns overall success.
 *
 * @param src - Stage source used to validate contract files.
 * @param dirs - Resolved stage directory paths to validate.
 */
function printValidation(src: StageSource, dirs: string[]): boolean {
  let ok = true;
  for (const dir of dirs) {
    const r = src.validateDir(dir);
    console.log(`${r.valid ? '✓' : '✗'} ${r.stage}`);
    for (const i of r.issues) {
      console.log(
        `  ${i.level === 'error' ? 'ERROR' : 'WARN'}${i.file ? ` ${i.file}` : ''}: ${i.message}`
      );
    }
    if (!r.valid) ok = false;
  }
  if (!dirs.length) {
    console.log('No stage folders found.');
    ok = false;
  }
  return ok;
}

/**
 * Dispatches a parsed CLI command to domain handlers and returns a process exit code.
 *
 * @param cmd - Strongly typed command produced by {@link parseCliArgs}.
 * @returns Shell exit code (`0` success, `2` validation failure, `3` run failure, etc.).
 */
export async function dispatchCliCommand(cmd: CliCommand): Promise<number> {
  const workspace = new ProjectWorkspace();

  if (cmd.kind === 'help') {
    printHelp();
    return 0;
  }

  if (cmd.kind === 'version') {
    console.log(VERSION);
    return 0;
  }

  if (cmd.kind === 'init') {
    const result = workspace.init(cmd.force);
    console.log(`${PRODUCT_NAME} initialized in ${ROOT}`);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  if (cmd.kind === 'config') {
    handleConfigCommand(cmd);
    return 0;
  }

  if (cmd.kind === 'runs') {
    workspace.requireInitialized();
    if (cmd.subCommand === 'list') {
      const runs = workspace.listRuns();
      if (!runs.length) {
        console.log('No runs found.');
        return 0;
      }
      for (const r of runs) {
        console.log(`${r.id}\t${r.status || 'unknown'}\t${r.branch || ''}\t${r.updated_at || ''}`);
      }
      return 0;
    }
    if (cmd.subCommand === 'reset') {
      console.log(JSON.stringify(workspace.resetRuns(cmd.force), null, 2));
      return 0;
    }
    if (cmd.subCommand === 'delete') {
      console.log(`Deleted run ${workspace.deleteRun(cmd.runId || '', cmd.force)}`);
      return 0;
    }
    return 0;
  }

  if (cmd.kind === 'list-stages') {
    const src = new StageSource(cmd.stageSource);
    try {
      for (const d of src.list(cmd.feature || '')) {
        console.log(path.relative(src.root, d));
      }
      return 0;
    } finally {
      src.close();
    }
  }

  if (cmd.kind === 'inspect') {
    const src = new StageSource(cmd.stageSource);
    try {
      for (const selector of cmd.stages) {
        const d = src.resolve(selector, cmd.feature || '');
        const m = src.manifest(d, selector);
        console.log(`Selected: ${m.name}`);
        console.log(`Source:   ${d}`);
        for (const [k, v] of Object.entries(m.sha256)) {
          console.log(`  ${k}: ${v}`);
        }
      }
      return 0;
    } finally {
      src.close();
    }
  }

  if (cmd.kind === 'validate') {
    const src = new StageSource(cmd.stageSource);
    try {
      const dirs = cmd.stages.length
        ? cmd.stages.map((s) => src.find(s, cmd.feature || ''))
        : src.list(cmd.feature || '');
      const ok = printValidation(src, dirs);
      return ok ? 0 : 2;
    } finally {
      src.close();
    }
  }

  if (cmd.kind === 'preflight') {
    workspace.requireInitialized();
    let src: StageSource | null = null;
    try {
      if (cmd.stageSource) {
        src = new StageSource(cmd.stageSource);
        if (cmd.stages.length) {
          for (const selector of cmd.stages) src.resolve(selector, cmd.feature || '');
        }
      }
      const dummyEvents = new EventBus(path.join(STATE_ROOT, 'preflight-events.jsonl'), true);
      const orch = new Orchestrator(dummyEvents);
      const result = await orch.preflight({
        executor_harness: cmd.executorHarness || CONFIG.executorHarness,
        reviewer_harness: cmd.reviewerHarness || CONFIG.reviewerHarness
      });
      console.log('Preflight OK');
      console.log(`Project:  ${ROOT}`);
      console.log(`Executor: ${result.executor.details.join(' | ')}`);
      console.log(`Reviewer: ${result.reviewer.details.join(' | ')}`);
      dummyEvents.close();
      return 0;
    } finally {
      src?.close();
    }
  }

  workspace.requireInitialized();
  const store = new RunStateStore();

  if (cmd.kind === 'status') {
    const st = cmd.runId ? store.load(cmd.runId) : store.loadLatest();
    console.log(JSON.stringify(st, null, 2));
    return 0;
  }

  if (cmd.kind === 'tail') {
    const st = cmd.runId ? store.load(cmd.runId) : store.loadLatest();
    const file = path.join(store.runDir(st.run_id), 'ui-events.jsonl');
    if (process.stdout.isTTY) {
      const { followInkUi } = await import('../ui/InkUi.js');
      await followInkUi({
        eventFile: file,
        meta: {
          runId: st.run_id,
          branch: st.branch,
          stageTotal: st.stages.length,
          status: st.status,
          dashboardMaxRows: CONFIG.uiDashboardMaxRows,
          executorLabel: st.executor_label || st.executor_harness,
          reviewerLabel: st.reviewer_label || st.reviewer_harness
        }
      });
    } else if (fs.existsSync(file)) {
      process.stdout.write(fs.readFileSync(file, 'utf8'));
    }
    return 0;
  }

  if (cmd.kind === 'recover') {
    const { RecoveryManager } = await import('../orchestrator/RecoveryManager.js');
    const { GitRepository } = await import('../git/GitRepository.js');
    const rm = new RecoveryManager(ROOT, store, new GitRepository(ROOT));
    const result = await rm.recover({
      runId: cmd.runId,
      stageName: cmd.stageName,
      apply: cmd.apply,
      force: cmd.force
    });
    for (const line of result.details) console.log(line);
    if (!result.ok) {
      if (result.error) console.error(`ERROR: ${result.error}`);
      return 1;
    }
    return 0;
  }

  if (cmd.kind !== 'run' && cmd.kind !== 'resume') {
    return 0;
  }

  // cmd.kind === 'run' || cmd.kind === 'resume'
  const lock = new RunLock();
  let orch: Orchestrator | null = null;
  let ui: Awaited<ReturnType<typeof makeUi>> | null = null;
  let state: RunState | null = null;
  let shutting = false;

  const shutdown = async (sig: string) => {
    if (shutting) return;
    shutting = true;
    try {
      await orch?.cancel();
      if (state) {
        const s = store.load(state.run_id);
        if (!['completed', 'failed', 'specification_blocked'].includes(s.status)) {
          s.status = 'interrupted';
          s.interrupted_at = new Date().toISOString();
          s.error = `Interrupted by ${sig}`;
          store.save(s);
        }
      }
    } finally {
      ui?.close();
      lock.release();
      cleanupSignals();
    }
    process.exit(sig === 'SIGINT' ? 130 : 143);
  };

  const onSigInt = () => void shutdown('SIGINT');
  const onSigTerm = () => void shutdown('SIGTERM');

  process.on('SIGINT', onSigInt);
  process.on('SIGTERM', onSigTerm);

  const cleanupSignals = () => {
    process.removeListener('SIGINT', onSigInt);
    process.removeListener('SIGTERM', onSigTerm);
  };

  try {
    if (cmd.kind === 'run') {
      const validationSource = new StageSource(cmd.stageSource);
      try {
        for (const selector of cmd.stages) {
          validationSource.resolve(selector, cmd.feature || '');
        }
      } finally {
        validationSource.close();
      }
      lock.acquire('creating', cmd.branch || '');
      const bootEvents = new EventBus(path.join(STATE_ROOT, 'creating-events.jsonl'), true);
      orch = new Orchestrator(bootEvents);
      await orch.preflight({
        executor_harness: cmd.executorHarness || CONFIG.executorHarness,
        reviewer_harness: cmd.reviewerHarness || CONFIG.reviewerHarness
      });
      state = orch.createRun({
        stageSource: cmd.stageSource,
        selectors: cmd.stages,
        feature: cmd.feature,
        branch: cmd.branch,
        base: cmd.base,
        qualityCmd: cmd.qualityCmd,
        executorHarness: cmd.executorHarness,
        reviewerHarness: cmd.reviewerHarness
      });
      bootEvents.close();
      lock.update(state.run_id, state.branch);
    } else {
      state = cmd.runId ? store.load(cmd.runId) : store.loadLatest();
      lock.acquire(state.run_id, state.branch);
    }

    ui = await makeUi(state.run_id, state, cmd.ui || 'compact');
    orch = new Orchestrator(ui.events);
    await orch.preflight(state);
    await orch.run(store.load(state.run_id), state.current_stage_index || 0);
    const end = store.load(state.run_id);
    ui.close();
    lock.release();
    if (process.stdout.isTTY) {
      console.log(
        `\n✓ AI run ${end.status}. Branch: ${end.branch}\nWorkspace: ${end.workspace}\nNo push or merge performed.`
      );
    }
    cleanupSignals();
    return 0;
  } catch (e: unknown) {
    const errMessage = e instanceof Error ? e.message : String(e);
    let finalStatus = 'failed';
    if (state) {
      try {
        const s = store.load(state.run_id);
        if (s.status === 'running' || s.status === 'created') {
          s.status = 'failed';
          s.error = errMessage;
          store.save(s);
        }
        finalStatus = s.status || 'failed';
      } catch {}
    }
    ui?.events?.emit('run.blocked', {
      status: finalStatus,
      reason: errMessage,
      branch: state?.branch
    });
    ui?.close();
    lock.release();
    cleanupSignals();
    console.error(`ERROR: ${errMessage}`);
    return 3;
  }
}
