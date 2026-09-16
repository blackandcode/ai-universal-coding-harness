/**
 * @fileoverview Workspace manager for target project directories.
 * Manages the local .ai-orchestrator runtime directory, configuration templates, run locks, run cleanups, and git status.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ROOT,
  STATE_ROOT,
  RUNS_ROOT,
  STAGE_INPUT_ROOT,
  STAGE_RUNTIME_ROOT,
  LOCAL_CONFIG_FILE,
  LOCAL_PERMISSIONS_FILE,
  LATEST_FILE,
  LOCK_FILE
} from '../core/paths.js';
import { removeTree } from '../core/fs.js';
import { projectPlaceholderConfigTemplate, projectPermissionsTemplate } from '../core/config.js';
import { LockConflictError } from '../errors.js';

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function git(args: string[]) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * Summary of created filesystem paths returned when initializing an orchestrator workspace.
 */
export interface WorkspaceInitResult {
  /** Target workspace root directory. */
  root: string;
  /** Local project configuration path (`.ai-orchestrator/config.jsonc`). */
  config: string;
  /** Local project permissions path (`.ai-orchestrator/permissions.jsonc`). */
  permissions: string;
  /** Directory storing historical runs (`.ai-orchestrator/runs/`). */
  runs: string;
  /** Directory containing frozen stage specification copies (`.ai-orchestrator/stage-input/`). */
  stageInput: string;
  /** Directory containing active stage execution evidence (`.ai-orchestrator/stage-runtime/`). */
  stageRuntime: string;
}

/**
 * Diagnostic summary of a persisted run record.
 */
export interface RunSummary {
  /** Unique run identifier. */
  id: string;
  /** Execution status of the run, if available. */
  status?: string;
  /** ISO 8601 timestamp of last state update, if available. */
  updated_at?: string;
  /** Dedicated AI branch name used for this run, if available. */
  branch?: string;
}

/**
 * Manages `.ai-orchestrator/` initialization, Git exclude rules, and run history maintenance.
 *
 * @remarks
 * Invariants:
 * - `ai-harness init` creates a single `.ai-orchestrator/` workspace and adds it to `.git/info/exclude`.
 * - No tracked files or commits are created in the target repository during initialization.
 * - History deletion and reset operations verify lock safety to avoid corrupting active runs.
 */
export class ProjectWorkspace {
  readonly root = ROOT;

  /** True when `ROOT` is inside a Git work tree. */
  isGitRepository(): boolean {
    return git(['rev-parse', '--is-inside-work-tree']).status === 0;
  }

  /** True when local config and state root exist (post-`ai-harness init`). */
  isInitialized(): boolean {
    return fs.existsSync(LOCAL_CONFIG_FILE) && fs.existsSync(STATE_ROOT);
  }

  /** Throws when the workspace has not been initialized for harness runs. */
  requireInitialized(): void {
    if (!this.isInitialized()) {
      throw new Error(
        `Project is not initialized for AI Universal Coding Harness. Run: ai-harness init`
      );
    }
  }

  /**
   * Creates the local `.ai-orchestrator` tree, default config templates, and Git exclude entry.
   *
   * @param force - Overwrite README and placeholder config when true.
   */
  init(force = false): WorkspaceInitResult {
    if (!this.isGitRepository()) {
      throw new Error(
        `AI Universal Coding Harness requires a Git repository. Initialize Git first, then run ai-harness init.`
      );
    }
    ensureDir(STATE_ROOT);
    ensureDir(RUNS_ROOT);
    ensureDir(STAGE_INPUT_ROOT);
    ensureDir(STAGE_RUNTIME_ROOT);
    if (force || !fs.existsSync(LOCAL_CONFIG_FILE)) {
      fs.writeFileSync(LOCAL_CONFIG_FILE, projectPlaceholderConfigTemplate());
    }
    if (force || !fs.existsSync(LOCAL_PERMISSIONS_FILE)) {
      fs.writeFileSync(LOCAL_PERMISSIONS_FILE, projectPermissionsTemplate());
    }
    const readme = path.join(STATE_ROOT, 'README.md');
    if (force || !fs.existsSync(readme)) {
      fs.writeFileSync(
        readme,
        `# .ai-orchestrator\n\nLocal runtime workspace for AI Universal Coding Harness.\n\n- \`config.jsonc\` — local project overrides\n- \`permissions.jsonc\` — local permission overrides\n- \`runs/\` — machine + human run history\n- \`stage-input/\` — frozen selected stage specifications for the active run\n- \`stage-runtime/\` — executor evidence/runtime files\n\nThis directory is excluded locally through \`.git/info/exclude\` and should not be committed.\n`
      );
    }
    this.ensureGitExclude();
    return {
      root: STATE_ROOT,
      config: LOCAL_CONFIG_FILE,
      permissions: LOCAL_PERMISSIONS_FILE,
      runs: RUNS_ROOT,
      stageInput: STAGE_INPUT_ROOT,
      stageRuntime: STAGE_RUNTIME_ROOT
    };
  }

  /** Ensures `.ai-orchestrator/` is listed in `.git/info/exclude` (never committed). */
  ensureGitExclude(): void {
    const gitDirRes = git(['rev-parse', '--git-dir']);
    if (gitDirRes.status !== 0) return;
    const raw = String(gitDirRes.stdout).trim();
    const gitDir = path.resolve(ROOT, raw);
    const info = path.join(gitDir, 'info');
    ensureDir(info);
    const file = path.join(info, 'exclude');
    const entry = '.ai-orchestrator/';
    let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (!text.split(/\r?\n/).includes(entry)) {
      if (text && !text.endsWith('\n')) text += '\n';
      text += entry + '\n';
      fs.writeFileSync(file, text);
    }
  }

  /** Lists run folders under `runs/`, newest ids first, with status from `run.json` when present. */
  listRuns(): RunSummary[] {
    if (!fs.existsSync(RUNS_ROOT)) return [];
    return fs
      .readdirSync(RUNS_ROOT, { withFileTypes: true })
      .filter((x) => x.isDirectory())
      .map((x) => {
        const file = path.join(RUNS_ROOT, x.name, 'run.json');
        try {
          const j = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
          return {
            id: x.name,
            status: typeof j.status === 'string' ? j.status : undefined,
            updated_at: typeof j.updated_at === 'string' ? j.updated_at : undefined,
            branch: typeof j.branch === 'string' ? j.branch : undefined
          };
        } catch {
          return { id: x.name };
        }
      })
      .sort((a, b) => b.id.localeCompare(a.id));
  }

  /**
   * Throws {@link LockConflictError} when a live orchestrator lock file references a running PID.
   * Stale locks from dead processes are ignored.
   */
  assertNoActiveRun(): void {
    if (!fs.existsSync(LOCK_FILE)) return;
    try {
      const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')) as Record<string, unknown>;
      const pid = Number(lock.pid);
      if (pid > 0) {
        try {
          process.kill(pid, 0);
          throw new LockConflictError(
            `Another orchestrator process is active (PID ${pid}, run ${String(lock.run_id || 'unknown')}).`
          );
        } catch (e: unknown) {
          if (e instanceof LockConflictError) throw e;
          if (
            typeof e === 'object' &&
            e !== null &&
            'code' in e &&
            (e as { code: string }).code !== 'ESRCH'
          ) {
            throw e;
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof LockConflictError) throw e;
      if (e instanceof Error && /Another orchestrator/.test(e.message)) throw e;
    }
  }

  /**
   * Deletes all run history and runtime trees while preserving local config and permissions.
   *
   * @param force - Required safety flag; refuses without it.
   */
  resetRuns(force = false): { deleted: string; preserved: string[] } {
    this.requireInitialized();
    if (!force) throw new Error('Refusing to delete run history without --force.');
    this.assertNoActiveRun();
    removeTree(RUNS_ROOT);
    removeTree(STAGE_INPUT_ROOT);
    removeTree(STAGE_RUNTIME_ROOT);
    ensureDir(RUNS_ROOT);
    ensureDir(STAGE_INPUT_ROOT);
    ensureDir(STAGE_RUNTIME_ROOT);
    for (const p of [
      LATEST_FILE,
      LOCK_FILE,
      path.join(STATE_ROOT, 'preflight-events.jsonl'),
      path.join(STATE_ROOT, 'creating-events.jsonl'),
      path.join(STATE_ROOT, 'preflight.log')
    ]) {
      try {
        fs.rmSync(p, { force: true });
      } catch {}
    }
    return { deleted: 'all run history', preserved: [LOCAL_CONFIG_FILE, LOCAL_PERMISSIONS_FILE] };
  }

  /**
   * Deletes a single run directory and reconciles the `latest` pointer.
   *
   * @returns The deleted run id on success.
   */
  deleteRun(id: string, force = false): string {
    this.requireInitialized();
    if (!id) throw new Error('--run <run-id> is required.');
    if (!force) throw new Error('Refusing to delete a run without --force.');
    this.assertNoActiveRun();
    if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error(`Invalid run id: ${id}`);
    const dir = path.join(RUNS_ROOT, id);
    if (!fs.existsSync(dir)) throw new Error(`Run not found: ${id}`);
    removeTree(dir);
    if (fs.existsSync(LATEST_FILE) && fs.readFileSync(LATEST_FILE, 'utf8').trim() === id) {
      const remaining = this.listRuns();
      if (remaining.length > 0 && remaining[0]) {
        fs.writeFileSync(LATEST_FILE, remaining[0].id + '\n');
      } else {
        fs.rmSync(LATEST_FILE, { force: true });
      }
    }
    return id;
  }
}
