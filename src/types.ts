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

export interface UiEvent {
  ts: string;
  type: string;
  payload: Record<string, any>;
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
  status: 'PASS' | 'FAIL';
  quality_command: string;
  quality_exit_code: number;
  git_diff_check_exit_code: number;
  focused_tests: Array<{ command: string; exit_code: number; summary?: string }>;
  quality_summary: string;
  changed_files: string[];
  unresolved: string[];
  observed_quality?: any;
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

export interface FinalVerdict {
  verdict: 'APPROVE' | 'REWORK' | 'NEEDS_CONTEXT' | 'BLOCKED';
  summary: string;
  findings?: string[];
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
