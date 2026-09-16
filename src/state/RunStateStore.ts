/**
 * @fileoverview Persistent state store and validator for runs and stages.
 * Serializes, validates, and deserializes RunState and StageRuntimeState records, managing run directories and run logs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { RUNS_ROOT } from '../core/paths.js';
import { ensureDir, writeJson, writeText, appendText } from '../core/fs.js';
import { iso } from '../core/time.js';
import type { RunState, StageRuntimeState } from '../types.js';
import { RunStateError } from '../errors.js';

function safeRunId(id: string): string {
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new RunStateError(`Invalid run id: ${id}`);
  }
  return id;
}

const VALID_RUN_STATUSES = new Set<string>([
  'created',
  'running',
  'interrupted',
  'retryable_error',
  'external_dependency',
  'specification_blocked',
  'autonomous_limit_reached',
  'failed',
  'completed'
]);

const VALID_STAGE_PHASES = new Set<string>([
  'pending',
  'plan',
  'implementation',
  'quality',
  'review',
  'commit',
  'completed'
]);

/**
 * Validates minimal structural invariants for a persisted {@link RunState} record.
 *
 * @throws {@link RunStateError} when required fields or status enums are invalid.
 */
export function validateRunState(data: unknown): RunState {
  if (typeof data !== 'object' || data === null) {
    throw new RunStateError('Run state must be a non-null object');
  }
  const s = data as Record<string, unknown>;
  if (typeof s.run_id !== 'string' || !s.run_id) {
    throw new RunStateError('Run state missing valid run_id');
  }
  if (typeof s.status !== 'string' || !VALID_RUN_STATUSES.has(s.status)) {
    throw new RunStateError(`Run state has invalid status: ${String(s.status)}`);
  }
  if (typeof s.branch !== 'string' || !s.branch) {
    throw new RunStateError('Run state missing valid branch');
  }
  if (typeof s.workspace !== 'string' || !s.workspace) {
    throw new RunStateError('Run state missing valid workspace');
  }
  if (!Array.isArray(s.stages)) {
    throw new RunStateError('Run state stages must be an array');
  }
  return s as unknown as RunState;
}

/**
 * Validates stage runtime phase metadata loaded from disk.
 *
 * @throws {@link RunStateError} when `phase` is missing or not a known value.
 */
export function validateStageRuntimeState(data: unknown): StageRuntimeState {
  if (typeof data !== 'object' || data === null) {
    throw new RunStateError('Stage runtime state must be a non-null object');
  }
  const s = data as Record<string, unknown>;
  if (typeof s.phase !== 'string' || !VALID_STAGE_PHASES.has(s.phase)) {
    throw new RunStateError(`Stage runtime state has invalid phase: ${String(s.phase)}`);
  }
  return s as unknown as StageRuntimeState;
}

/**
 * Filesystem-backed store for run and per-stage machine state plus human Markdown artifacts.
 */
export class RunStateStore {
  /**
   * @param runsRoot - Directory containing one folder per `run_id` (defaults to project runs root).
   */
  constructor(private runsRoot = RUNS_ROOT) {
    ensureDir(this.runsRoot);
  }

  /** Absolute path to a run's artifact directory. */
  runDir(id: string): string {
    return path.join(this.runsRoot, safeRunId(id));
  }

  /** Path to the canonical `run.json` machine state file. */
  runStatePath(id: string): string {
    return path.join(this.runDir(id), 'run.json');
  }

  /** Path to per-stage artifacts (`PLAN.md`, `stage-state.json`, reviews, etc.). */
  stageDir(id: string, stage: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(stage)) {
      throw new RunStateError(`Invalid stage name: ${stage}`);
    }
    return path.join(this.runDir(id), 'stages', stage);
  }

  /** Path to `stage-state.json` for a single stage within a run. */
  stageStatePath(id: string, stage: string): string {
    return path.join(this.stageDir(id, stage), 'stage-state.json');
  }

  /** Most recently saved run id from `latest` pointer file, or empty when none exist. */
  latestId(): string {
    const latestPath = path.join(this.runsRoot, 'latest');
    return fs.existsSync(latestPath) ? fs.readFileSync(latestPath, 'utf8').trim() : '';
  }

  /** Persists run state, updates the latest pointer, and refreshes `RUN.md`. */
  save(state: RunState): void {
    state.updated_at = iso();
    writeJson(this.runStatePath(state.run_id), state);
    writeText(path.join(this.runsRoot, 'latest'), state.run_id + '\n');
    this.writeRunMarkdown(state);
  }

  /** Loads and validates `run.json` for the given run id. */
  load(id: string): RunState {
    const p = this.runStatePath(id);
    if (!fs.existsSync(p)) {
      throw new RunStateError(`Run state file not found: ${p}`);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e: unknown) {
      throw new RunStateError(`Corrupted JSON in run state file: ${p}`, { cause: e });
    }
    return validateRunState(raw);
  }

  /** Loads the run referenced by the `latest` pointer. */
  loadLatest(): RunState {
    const id = this.latestId();
    if (!id) throw new RunStateError('No previous run found.');
    return this.load(id);
  }

  /** Loads stage runtime state, defaulting to `{ phase: 'pending' }` when missing or corrupt. */
  loadStage(id: string, stage: string): StageRuntimeState {
    const p = this.stageStatePath(id, stage);
    if (!fs.existsSync(p)) return { version: 1, phase: 'pending' };
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(p, 'utf8'));
      return validateStageRuntimeState(raw);
    } catch {
      return { version: 1, phase: 'pending' };
    }
  }

  /** Merges a partial patch into stage runtime state and writes `stage-state.json`. */
  saveStage(id: string, stage: string, patch: Partial<StageRuntimeState>): StageRuntimeState {
    const next: StageRuntimeState = {
      ...this.loadStage(id, stage),
      ...patch,
      updated_at: iso()
    };
    writeJson(this.stageStatePath(id, stage), next);
    return next;
  }

  /**
   * Appends a dated Markdown section to a stage artifact (for example `DECISIONS.md`).
   * Creates the file with a title heading when it does not yet exist.
   */
  appendHuman(runId: string, stage: string, file: string, heading: string, body = ''): void {
    if (!/^[A-Za-z0-9._-]+$/.test(file)) {
      throw new RunStateError(`Invalid run artifact name: ${file}`);
    }
    const p = path.join(this.stageDir(runId, stage), file);
    ensureDir(path.dirname(p));
    if (!fs.existsSync(p)) writeText(p, `# ${file.replace(/\.md$/, '').replace(/_/g, ' ')}\n\n`);
    appendText(p, `## ${heading}\n\n${body}\n\n`);
  }

  /** Regenerates human-readable `RUN.md` summary alongside machine `run.json`. */
  private writeRunMarkdown(state: RunState): void {
    const lines = [
      `# AI Universal Coding Harness Run ${state.run_id}`,
      '',
      `- **Status:** ${state.status}`,
      `- **AI branch:** \`${state.branch}\``,
      `- **Original branch:** \`${state.original_branch || '(detached)'}\``,
      `- **Base:** \`${state.base_commit}\``,
      `- **Executor:** ${state.executor_label || state.executor_harness} (\`${state.executor_harness}\`)`,
      `- **Reviewer:** ${state.reviewer_label || state.reviewer_harness} (\`${state.reviewer_harness}\`)`,
      `- **Branch created:** ${state.branch_created ? 'yes' : 'no — branch is created only when planning begins'}`,
      '',
      '## Stages',
      '',
      ...state.stages.map((s, i) => `${i + 1}. **${s.name}** — ${s.status}`),
      ''
    ];
    if (state.pre_run_stash) {
      lines.push(
        '## Preserved developer changes',
        '',
        `The original checkout was dirty. The harness preserved it in stash \`${state.pre_run_stash.label}\` (\`${state.pre_run_stash.commit}\`).`,
        '',
        'After reviewing/merging the AI branch, restore with:',
        '',
        '```bash',
        `git switch ${state.original_branch || '<original-branch>'}`,
        `git stash apply ${state.pre_run_stash.commit}`,
        '```',
        ''
      );
    }
    lines.push(
      '## Human-readable artifacts',
      '',
      'Each stage keeps `PLAN.md`, plan revisions/reviews, `DECISIONS.md`, `EXECUTION.md`, `FINAL_REVIEW.md`, and `STAGE.md` alongside machine JSON state.',
      ''
    );
    writeText(path.join(this.runDir(state.run_id), 'RUN.md'), lines.join('\n'));
  }
}
