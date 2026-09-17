/**
 * @fileoverview Persistent state store and validator for runs and stages.
 * Serializes, validates, and deserializes RunState and StageRuntimeState records, managing run directories and run logs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { RUNS_ROOT } from '../core/paths.js';
import { ensureDir, writeJson, writeText, appendText } from '../core/fs.js';
import { iso } from '../core/time.js';
import type {
  RunState,
  StageRuntimeState,
  SelectedStage,
  StageManifest,
  CommandObservation,
  RunStatus,
  StageStatus,
  StagePhase
} from '../types.js';
import { RunStateError } from '../errors.js';
export { RunStateError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeRunId(id: string): string {
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new RunStateError(`Invalid run id: ${id}`);
  }
  return id;
}

const VALID_RUN_STATUSES = new Set<RunStatus>([
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

const VALID_STAGE_STATUSES = new Set<StageStatus>(['pending', 'running', 'completed', 'failed']);

const VALID_STAGE_PHASES = new Set<StagePhase>([
  'pending',
  'plan',
  'implementation',
  'quality',
  'review',
  'commit',
  'completed'
]);

/**
 * Validates structural invariants for an untrusted stage manifest loaded from disk.
 *
 * @remarks
 * Verifies stage name, selector, source path, relative path, and SHA256 checksum mapping.
 *
 * @param data - Untrusted value parsed from disk or stage descriptor.
 * @returns Validated {@link StageManifest}.
 * @throws {@link RunStateError}
 * Thrown when any required manifest field is missing or invalid.
 */
export function validateStageManifest(data: unknown): StageManifest {
  if (!isRecord(data)) {
    throw new RunStateError('Stage manifest must be a non-null object');
  }
  if (typeof data.name !== 'string' || !data.name.trim()) {
    throw new RunStateError('Stage manifest missing valid name');
  }
  if (typeof data.selector !== 'string' || !data.selector.trim()) {
    throw new RunStateError('Stage manifest missing valid selector');
  }
  if (typeof data.source !== 'string' || !data.source.trim()) {
    throw new RunStateError('Stage manifest missing valid source');
  }
  if (typeof data.relative_path !== 'string') {
    throw new RunStateError('Stage manifest missing valid relative_path');
  }
  if (!isRecord(data.sha256)) {
    throw new RunStateError('Stage manifest missing valid sha256 map');
  }
  for (const [file, hash] of Object.entries(data.sha256)) {
    if (typeof hash !== 'string') {
      throw new RunStateError(`Stage manifest sha256 hash for "${file}" must be a string`);
    }
  }

  return {
    name: data.name,
    selector: data.selector,
    source: data.source,
    relative_path: data.relative_path,
    sha256: { ...(data.sha256 as Record<string, string>) }
  };
}

/**
 * Validates structural invariants for an untrusted selected stage record.
 *
 * @remarks
 * Asserts stage name, selector, valid {@link StageStatus}, and recursively validates manifest.
 *
 * @param data - Untrusted value representing a stage in a run.
 * @returns Validated {@link SelectedStage}.
 * @throws {@link RunStateError}
 * Thrown when stage properties or nested manifest fail validation.
 */
export function validateSelectedStage(data: unknown): SelectedStage {
  if (!isRecord(data)) {
    throw new RunStateError('Selected stage must be a non-null object');
  }
  if (typeof data.name !== 'string' || !data.name.trim()) {
    throw new RunStateError('Selected stage missing valid name');
  }
  if (typeof data.selector !== 'string' || !data.selector.trim()) {
    throw new RunStateError('Selected stage missing valid selector');
  }
  if (typeof data.status !== 'string' || !VALID_STAGE_STATUSES.has(data.status as StageStatus)) {
    throw new RunStateError(`Selected stage has invalid status: ${String(data.status)}`);
  }
  const manifest = validateStageManifest(data.manifest);

  return {
    name: data.name,
    selector: data.selector,
    status: data.status as StageStatus,
    manifest
  };
}

/**
 * Validates structural invariants for an untrusted persisted {@link RunState} record loaded from disk.
 *
 * @remarks
 * External disk data enters as `unknown`. Direct type casting without recursive runtime validation is prohibited.
 * Invariant: Every selected stage in `stages` must have its schema and manifest deeply validated.
 *
 * @param data - Untrusted value parsed from `state.json`.
 * @returns Validated domain {@link RunState}.
 * @throws {@link RunStateError}
 * Thrown when required fields (`run_id`, `branch`, `workspace`, `stages`, etc.) or status enums are invalid.
 */
export function validateRunState(data: unknown): RunState {
  if (!isRecord(data)) {
    throw new RunStateError('Run state must be a non-null object');
  }
  if (typeof data.version !== 'number' || !Number.isInteger(data.version)) {
    throw new RunStateError('Run state missing valid numeric version');
  }
  if (typeof data.run_id !== 'string' || !data.run_id.trim()) {
    throw new RunStateError('Run state missing valid run_id');
  }
  if (typeof data.created_at !== 'string' || !data.created_at.trim()) {
    throw new RunStateError('Run state missing valid created_at timestamp');
  }
  if (typeof data.status !== 'string' || !VALID_RUN_STATUSES.has(data.status as RunStatus)) {
    throw new RunStateError(`Run state has invalid status: ${String(data.status)}`);
  }
  if (typeof data.workspace !== 'string' || !data.workspace.trim()) {
    throw new RunStateError('Run state missing valid workspace');
  }
  if (typeof data.base_ref !== 'string') {
    throw new RunStateError('Run state missing valid base_ref');
  }
  if (typeof data.base_commit !== 'string') {
    throw new RunStateError('Run state missing valid base_commit');
  }
  if (typeof data.original_branch !== 'string') {
    throw new RunStateError('Run state missing valid original_branch');
  }
  if (typeof data.original_head !== 'string') {
    throw new RunStateError('Run state missing valid original_head');
  }
  if (typeof data.branch !== 'string' || !data.branch.trim()) {
    throw new RunStateError('Run state missing valid branch');
  }
  if (typeof data.stage_source !== 'string') {
    throw new RunStateError('Run state missing valid stage_source');
  }
  if (typeof data.executor_harness !== 'string' || !data.executor_harness.trim()) {
    throw new RunStateError('Run state missing valid executor_harness');
  }
  if (typeof data.reviewer_harness !== 'string' || !data.reviewer_harness.trim()) {
    throw new RunStateError('Run state missing valid reviewer_harness');
  }
  if (typeof data.quality_cmd !== 'string') {
    throw new RunStateError('Run state missing valid quality_cmd');
  }
  if (!Array.isArray(data.stages)) {
    throw new RunStateError('Run state stages must be an array');
  }
  const stages: SelectedStage[] = data.stages.map((st, idx) => {
    try {
      return validateSelectedStage(st);
    } catch (e: unknown) {
      throw new RunStateError(
        `Run state stages[${idx}] failed validation: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e }
      );
    }
  });

  const validated: RunState = {
    version: data.version,
    run_id: data.run_id,
    created_at: data.created_at,
    status: data.status as RunStatus,
    workspace: data.workspace,
    base_ref: data.base_ref,
    base_commit: data.base_commit,
    original_branch: data.original_branch,
    original_head: data.original_head,
    branch: data.branch,
    branch_created: typeof data.branch_created === 'boolean' ? data.branch_created : false,
    stage_source: data.stage_source,
    stages,
    executor_harness: data.executor_harness,
    reviewer_harness: data.reviewer_harness,
    quality_cmd: data.quality_cmd
  };

  if (typeof data.branch_created_at === 'string')
    validated.branch_created_at = data.branch_created_at;
  if (typeof data.feature === 'string' || data.feature === null) validated.feature = data.feature;
  if (typeof data.executor_label === 'string') validated.executor_label = data.executor_label;
  if (typeof data.reviewer_label === 'string') validated.reviewer_label = data.reviewer_label;
  if (typeof data.current_stage_index === 'number')
    validated.current_stage_index = data.current_stage_index;
  if (
    typeof data.current_phase === 'string' &&
    VALID_STAGE_PHASES.has(data.current_phase as StagePhase)
  ) {
    validated.current_phase = data.current_phase as StagePhase;
  }
  if (isRecord(data.pre_run_stash)) {
    if (
      typeof data.pre_run_stash.label === 'string' &&
      typeof data.pre_run_stash.commit === 'string'
    ) {
      validated.pre_run_stash = {
        label: data.pre_run_stash.label,
        commit: data.pre_run_stash.commit
      };
    }
  } else if (data.pre_run_stash === null) {
    validated.pre_run_stash = null;
  }
  if (typeof data.error === 'string') validated.error = data.error;
  if (typeof data.blocked_stage === 'string') validated.blocked_stage = data.blocked_stage;
  if (typeof data.completed_at === 'string') validated.completed_at = data.completed_at;
  if (typeof data.interrupted_at === 'string') validated.interrupted_at = data.interrupted_at;
  if (typeof data.updated_at === 'string') validated.updated_at = data.updated_at;

  return validated;
}

/**
 * Validates structural invariants for an untrusted stage runtime state record loaded from disk.
 *
 * @remarks
 * External disk data enters as `unknown`. Invariant: All workflow-relevant optional fields
 * (attempt, plan status, SHA checksums, evidence file, patch fingerprint, etc.) must be typed and validated.
 *
 * @param data - Untrusted value parsed from stage `stage-state.json`.
 * @returns Validated domain {@link StageRuntimeState}.
 * @throws {@link RunStateError}
 * Thrown when `phase` is missing or not a known lifecycle phase value, or optional fields are malformed.
 */
export function validateStageRuntimeState(data: unknown): StageRuntimeState {
  if (!isRecord(data)) {
    throw new RunStateError('Stage runtime state must be a non-null object');
  }
  if (typeof data.phase !== 'string' || !VALID_STAGE_PHASES.has(data.phase as StagePhase)) {
    throw new RunStateError(`Stage runtime state has invalid phase: ${String(data.phase)}`);
  }

  const validated: StageRuntimeState = {
    version: typeof data.version === 'number' ? data.version : 1,
    phase: data.phase as StagePhase
  };

  if (typeof data.attempt === 'number') validated.attempt = data.attempt;
  if (typeof data.plan_status === 'string') validated.plan_status = data.plan_status;
  if (typeof data.plan_sha256 === 'string') validated.plan_sha256 = data.plan_sha256;
  if (typeof data.spec_sha256 === 'string') validated.spec_sha256 = data.spec_sha256;
  if (typeof data.reviewer_carryover === 'string')
    validated.reviewer_carryover = data.reviewer_carryover;
  if (typeof data.executor_session_id === 'string')
    validated.executor_session_id = data.executor_session_id;
  if (typeof data.cursor_session_id === 'string')
    validated.cursor_session_id = data.cursor_session_id;
  if (typeof data.evidence_file === 'string') validated.evidence_file = data.evidence_file;
  if (typeof data.patch_fingerprint === 'string')
    validated.patch_fingerprint = data.patch_fingerprint;
  if (typeof data.reviewer_feedback === 'string')
    validated.reviewer_feedback = data.reviewer_feedback;
  if (typeof data.commit_sha === 'string') validated.commit_sha = data.commit_sha;
  if (typeof data.updated_at === 'string') validated.updated_at = data.updated_at;

  return validated;
}

/**
 * Validates structural invariants for an untrusted persisted command observation record.
 *
 * @remarks
 * Validates command observation properties when loaded from disk or replayed from journals.
 *
 * @param data - Untrusted command observation record.
 * @returns Validated {@link CommandObservation}.
 * @throws {@link RunStateError}
 * Thrown when required observation fields are missing or invalid.
 */
export function validateCommandObservation(data: unknown): CommandObservation {
  if (!isRecord(data)) {
    throw new RunStateError('Command observation must be a non-null object');
  }
  if (typeof data.observation_id !== 'string' || !data.observation_id) {
    throw new RunStateError('Command observation missing valid observation_id');
  }
  if (typeof data.session_id !== 'string' || !data.session_id) {
    throw new RunStateError('Command observation missing valid session_id');
  }
  if (typeof data.tool_id !== 'string' || !data.tool_id) {
    throw new RunStateError('Command observation missing valid tool_id');
  }
  if (typeof data.tool_call_id !== 'string' || !data.tool_call_id) {
    throw new RunStateError('Command observation missing valid tool_call_id');
  }
  if (typeof data.sequence !== 'number' || !Number.isFinite(data.sequence)) {
    throw new RunStateError('Command observation missing valid sequence');
  }
  if (typeof data.timestamp !== 'string') {
    throw new RunStateError('Command observation missing valid timestamp');
  }
  if (typeof data.source !== 'string' || !['acp', 'broker', 'replay'].includes(data.source)) {
    throw new RunStateError(`Command observation invalid source: ${String(data.source)}`);
  }
  if (typeof data.command !== 'string') {
    throw new RunStateError('Command observation missing valid command');
  }
  if (typeof data.normalized_command !== 'string') {
    throw new RunStateError('Command observation missing valid normalized_command');
  }
  if (
    typeof data.command_confidence !== 'string' ||
    !['high', 'medium', 'low'].includes(data.command_confidence)
  ) {
    throw new RunStateError(
      `Command observation invalid command_confidence: ${String(data.command_confidence)}`
    );
  }
  if (
    typeof data.status !== 'string' ||
    !['completed', 'failed', 'error', 'in_progress', 'pending'].includes(data.status)
  ) {
    throw new RunStateError(`Command observation invalid status: ${String(data.status)}`);
  }
  if (data.exit_code !== null && typeof data.exit_code !== 'number') {
    throw new RunStateError('Command observation exit_code must be number or null');
  }

  const obs: CommandObservation = {
    observation_id: data.observation_id,
    session_id: data.session_id,
    tool_id: data.tool_id,
    tool_call_id: data.tool_call_id,
    sequence: data.sequence,
    timestamp: data.timestamp,
    source: data.source as 'acp' | 'broker' | 'replay',
    command: data.command,
    normalized_command: data.normalized_command,
    command_confidence: data.command_confidence as 'high' | 'medium' | 'low',
    status: data.status as 'completed' | 'failed' | 'error' | 'in_progress' | 'pending',
    exit_code: data.exit_code
  };

  if (typeof data.run_id === 'string') obs.run_id = data.run_id;
  if (typeof data.stage === 'string') obs.stage = data.stage;
  if (typeof data.attempt === 'number') obs.attempt = data.attempt;
  if (typeof data.cwd === 'string') obs.cwd = data.cwd;
  if (typeof data.quality_epoch_id === 'string') obs.quality_epoch_id = data.quality_epoch_id;

  return obs;
}

/**
 * Filesystem-backed store for run and per-stage machine state plus human Markdown artifacts.
 *
 * @remarks
 * Invariant: Machine state is saved strictly as JSON; human logs and retrospective audits are saved as Markdown.
 * Uses atomic writes to prevent partially written state files on unexpected termination.
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

  /**
   * Loads and validates stage runtime state from disk.
   *
   * @remarks
   * Invariant: If `stage-state.json` is missing, returns documented pending default `{ version: 1, phase: 'pending' }`.
   * If the file exists but contains corrupted JSON or invalid schema properties, throws {@link RunStateError}.
   * Existing corrupted state must never silently reset to pending.
   *
   * @param id - Run identifier.
   * @param stage - Canonical stage directory name.
   * @returns Validated {@link StageRuntimeState}.
   * @throws {@link RunStateError}
   * Thrown when stage state file contains malformed JSON or invalid schema values.
   */
  loadStage(id: string, stage: string): StageRuntimeState {
    const p = this.stageStatePath(id, stage);
    if (!fs.existsSync(p)) return { version: 1, phase: 'pending' };
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e: unknown) {
      throw new RunStateError(`Corrupted JSON in stage state file: ${p}`, { cause: e });
    }
    return validateStageRuntimeState(raw);
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
   * Tracks the most recent permission decision per run stage for deduplication.
   */
  private lastPermissionRecord = new Map<
    string,
    {
      allow: boolean;
      source: string;
      signature: string;
      reason: string;
      count: number;
      blockText: string;
    }
  >();

  /**
   * Records a permission decision in `DECISIONS.md`, deduplicating consecutive identical decisions
   * into a single Markdown block with an updated occurrence count.
   *
   * @remarks
   * When an agent performs tens of file operations or repeated tool calls with the identical
   * signature, source, and decision, logging each one individually floods `DECISIONS.md`.
   * This method replaces the trailing identical decision block in-place with an incremented count.
   *
   * @param runId - Run identifier.
   * @param stage - Stage name.
   * @param decision - Decision details including allow status, source, signature, and policy reason.
   */
  recordPermissionDecision(
    runId: string,
    stage: string,
    decision: { allow: boolean; source: string; signature: string; reason: string }
  ): void {
    const key = `${safeRunId(runId)}:${safeRunId(stage)}`;
    const p = path.join(this.stageDir(runId, stage), 'DECISIONS.md');
    ensureDir(path.dirname(p));
    if (!fs.existsSync(p)) writeText(p, '# Decisions\n\n');

    const last = this.lastPermissionRecord.get(key);
    const isSame =
      last &&
      last.allow === decision.allow &&
      last.source === decision.source &&
      last.signature === decision.signature &&
      last.reason === decision.reason;

    if (isSame) {
      last.count++;
      const current = fs.readFileSync(p, 'utf8');
      if (current.endsWith(last.blockText)) {
        const countLine = `- **Count:** ${last.count}`;
        const newBlock = `## Permission decision\n\n- **Decision:** ${decision.allow ? 'ALLOW' : 'DENY'}\n- **Source:** ${decision.source}\n- **Signature:** \`${decision.signature}\`\n- **Reason:** ${decision.reason}\n${countLine}\n\n`;
        const updated = current.slice(0, current.length - last.blockText.length) + newBlock;
        writeText(p, updated);
        last.blockText = newBlock;
        return;
      }
    }

    const countLine = '- **Count:** 1';
    const newBlock = `## Permission decision\n\n- **Decision:** ${decision.allow ? 'ALLOW' : 'DENY'}\n- **Source:** ${decision.source}\n- **Signature:** \`${decision.signature}\`\n- **Reason:** ${decision.reason}\n${countLine}\n\n`;

    this.lastPermissionRecord.set(key, {
      allow: decision.allow,
      source: decision.source,
      signature: decision.signature,
      reason: decision.reason,
      count: 1,
      blockText: newBlock
    });

    appendText(p, newBlock);
  }

  /**
   * Appends a dated Markdown section to a stage artifact (for example `DECISIONS.md`).
   * Creates the file with a title heading when it does not yet exist.
   */
  appendHuman(runId: string, stage: string, file: string, heading: string, body = ''): void {
    if (!/^[A-Za-z0-9._-]+$/.test(file)) {
      throw new RunStateError(`Invalid run artifact name: ${file}`);
    }
    if (file === 'DECISIONS.md') {
      this.lastPermissionRecord.delete(`${safeRunId(runId)}:${safeRunId(stage)}`);
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
