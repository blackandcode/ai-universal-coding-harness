/**
 * Core domain types and contracts for AI Universal Coding Harness.
 */

// Semantic branded identifier types
declare const RunIdBrand: unique symbol;
export type RunId = string & { readonly [RunIdBrand]?: typeof RunIdBrand };

declare const StageNameBrand: unique symbol;
export type StageName = string & { readonly [StageNameBrand]?: typeof StageNameBrand };

export const asRunId = (id: string): RunId => id as RunId;
export const asStageName = (name: string): StageName => name as StageName;

export type HarnessId = 'cursor' | 'codex' | (string & {});

export type RunStatus =
  | 'created'
  | 'running'
  | 'interrupted'
  | 'retryable_error'
  | 'external_dependency'
  | 'specification_blocked'
  | 'autonomous_limit_reached'
  | 'failed'
  | 'completed';

export type StageStatus = 'pending' | 'running' | 'completed' | 'failed';

export type StagePhase =
  | 'pending'
  | 'plan'
  | 'implementation'
  | 'quality'
  | 'review'
  | 'commit'
  | 'completed';

export type PermissionMode = 'auto_safe' | 'allow_all' | 'allowlist' | 'ask_reviewer';

export type QualityEvidenceStatus = 'PASS' | 'FAIL';

export interface StageManifest {
  name: string;
  selector: string;
  source: string;
  relative_path: string;
  sha256: Record<string, string>;
}

export interface SelectedStage {
  name: string;
  selector: string;
  status: StageStatus;
  manifest: StageManifest;
}

export interface RunState {
  version: number;
  run_id: string;
  created_at: string;
  status: RunStatus;
  workspace: string;
  base_ref: string;
  base_commit: string;
  original_branch: string;
  original_head: string;
  branch: string;
  branch_created: boolean;
  branch_created_at?: string;
  stage_source: string;
  feature?: string | null;
  stages: SelectedStage[];
  executor_harness: string;
  reviewer_harness: string;
  executor_label?: string;
  reviewer_label?: string;
  quality_cmd: string;
  current_stage_index?: number;
  current_phase?: StagePhase;
  pre_run_stash?: { label: string; commit: string } | null;
  error?: string;
  blocked_stage?: string;
  completed_at?: string;
  interrupted_at?: string;
  updated_at?: string;
}

export interface StageRuntimeState {
  version: number;
  phase: StagePhase;
  attempt?: number;
  plan_status?: string;
  plan_sha256?: string;
  spec_sha256?: string;
  reviewer_carryover?: string;
  executor_session_id?: string;
  /** Legacy V7 compatibility when resuming an older run. */
  cursor_session_id?: string;
  evidence_file?: string;
  patch_fingerprint?: string;
  reviewer_feedback?: string;
  commit_sha?: string;
  updated_at?: string;
}

export interface FocusedTestResult {
  command: string;
  exit_code: number;
  summary?: string;
}

export interface ObservedQuality {
  command?: string;
  exit_code?: number | null;
  timestamp?: string;
  duration_ms?: number;
  output?: string;
  [key: string]: unknown;
}

export interface CommandObservation {
  observation_id: string;
  run_id?: string;
  stage?: string;
  attempt?: number;
  session_id: string;
  tool_id: string;
  tool_call_id: string;
  sequence: number;
  timestamp: string;
  source: 'acp' | 'broker' | 'replay';
  command: string;
  normalized_command: string;
  command_confidence: 'high' | 'medium' | 'low';
  status: 'completed' | 'failed' | 'error' | 'in_progress' | 'pending';
  exit_code: number | null;
  cwd?: string;
  quality_epoch_id?: string;
}

export interface GitDiffCheckResult {
  ok: boolean;
  issues: string[];
  output: string;
}

export interface ExecutionEvidence {
  stage: string;
  attempt: number;
  status: QualityEvidenceStatus;
  quality_command: string;
  quality_exit_code: number;
  git_diff_check_exit_code: number;
  focused_tests: FocusedTestResult[];
  quality_summary: string;
  changed_files: string[];
  unresolved: string[];
  observed_quality?: ObservedQuality | null;
  patch_fingerprint?: string;
  quality_epoch_id?: string;
}

export interface PlanReviewVerdict {
  verdict: 'APPROVE' | 'REPLAN' | 'BLOCKED';
  summary: string;
  missing_items: string[];
  feedback_for_cursor: string;
}

export interface PermissionVerdict {
  verdict: 'ALLOW' | 'DENY';
  cache_for_stage?: boolean;
  reason?: string;
}

export interface QuestionVerdict {
  verdict: 'ANSWER' | 'BLOCKED';
  answers?: Array<{ question_id: string; selected_option_ids: string[] }>;
  rationale?: string;
}

export interface FinalVerdictFinding {
  severity?: string;
  area?: string;
  finding?: string;
  required_fix?: string;
}

export interface FinalVerdict {
  verdict: 'APPROVE' | 'REWORK' | 'NEEDS_CONTEXT' | 'BLOCKED';
  summary: string;
  findings?: Array<FinalVerdictFinding | string>;
  rework_instructions?: string;
  requested_paths?: string[];
  required_follow_up_tests?: string[];
}

export interface HarnessContext {
  workspace: string;
  runId: string;
  stageName: string;
  runDir: string;
  stageDir: string;
  frozenStageDir: string;
  qualityCommand: string;
}

// UI Event Definitions
export interface UiEventPayloadMap {
  'run.started': { run_id: string; branch: string; workspace?: string };
  'run.completed': { branch: string; workspace: string };
  'run.blocked': { status: string; reason: string; branch?: string };
  'stage.started': { stage: string; run_id?: string; selector?: string };
  'stage.attempt': { stage: string; attempt: number };
  'stage.committed': { stage: string; sha: string };
  'stage.completed': { stage: string };
  'stage.blocked': { stage: string; reason: string };
  'commit.started': { stage: string };
  'executor.mode': { mode: string };
  'executor.todos': { todos: unknown[] };
  'executor.task': { task: unknown };
  'executor.tool': { id?: string; toolCallId?: string; [key: string]: unknown };
  'executor.focus.delta': { text: string; focus_file?: string };
  'executor.message': { text: string; stream?: boolean };
  'executor.plan.request': { name?: string; overview?: string };
  'executor.question': { prompt?: string; [key: string]: unknown };
  'executor.permission': { command?: string; [key: string]: unknown };
  'reviewer.plan': { verdict?: string; summary?: string; [key: string]: unknown };
  'reviewer.question': { answer?: string; [key: string]: unknown };
  'reviewer.permission': { verdict?: string; summary?: string; [key: string]: unknown };
  'reviewer.tokens': { [key: string]: unknown };
  'quality.result': {
    status?: string;
    summary?: string;
    quality_summary?: string;
    [key: string]: unknown;
  };
  'review.started': { stage: string; attempt: number };
  'review.result': { verdict?: string; summary?: string; [key: string]: unknown };
  log: { level?: 'info' | 'warn' | 'error' | string; message?: string; [key: string]: unknown };
}

export type KnownUiEventType = keyof UiEventPayloadMap;

export interface TypedUiEvent<K extends KnownUiEventType = KnownUiEventType> {
  ts: string;
  type: K;
  payload: UiEventPayloadMap[K];
}

export interface GenericUiEvent {
  ts: string;
  type: string;
  payload: Record<string, any>;
}

export interface UiEvent<TPayload = Record<string, any>> {
  ts: string;
  type: string;
  payload: TPayload;
}
