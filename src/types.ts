/**
 * @fileoverview Core domain types, models, branded identifiers, and contracts for AI Universal Coding Harness.
 *
 * Defines machine state models for runs and stages, reviewer verdicts, executor evidence structures,
 * command observation records, and typed semantic UI event stream payloads.
 *
 * @remarks
 * Architectural Invariants:
 * - Machine state is persisted strictly as JSON under `.ai-orchestrator/runs/<run_id>/`.
 * - The orchestrator owns workflow, state transitions, and Git lifecycle.
 * - Executors execute commands and produce implementation artifacts and evidence.
 * - Reviewers evaluate plans, answers, permissions, and code diffs but never execute code or mutate Git state.
 * - Evidence must belong to the active run, stage, attempt, and quality epoch.
 */

import type { ReviewerFallbackMetadata } from './harness/types.js';

// Semantic branded identifier types

declare const RunIdBrand: unique symbol;

/**
 * Branded nominal type representing a validated unique run identifier.
 *
 * @remarks
 * Prevents accidental mixing of raw string IDs with stage names or path segments.
 */
export type RunId = string & { readonly [RunIdBrand]?: typeof RunIdBrand };

declare const StageNameBrand: unique symbol;

/**
 * Branded nominal type representing a validated canonical stage folder name.
 *
 * @remarks
 * Expected format conforms to `stage-NN-kebab-name` as validated by stage source checks.
 */
export type StageName = string & { readonly [StageNameBrand]?: typeof StageNameBrand };

/**
 * Casts a validated string identifier into a branded {@link RunId}.
 *
 * @param id - Non-empty string identifier conforming to run ID format.
 * @returns Branded {@link RunId} value.
 */
export const asRunId = (id: string): RunId => id as RunId;

/**
 * Casts a validated string stage name into a branded {@link StageName}.
 *
 * @param name - Canonical stage name conforming to `stage-NN-kebab-name`.
 * @returns Branded {@link StageName} value.
 */
export const asStageName = (name: string): StageName => name as StageName;

/**
 * Supported built-in or externally registered harness identifier.
 */
export type HarnessId = 'cursor' | 'codex' | (string & {});

/**
 * High-level execution status of an overall orchestrator run across all selected stages.
 */
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

/**
 * Lifecycle status of an individual stage within a multi-stage run.
 */
export type StageStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Discrete phase in the sequential lifecycle of a single stage execution.
 *
 * @remarks
 * Order of execution:
 * `pending` -> `plan` -> `implementation` -> `quality` -> `review` -> `commit` -> `completed`.
 */
export type StagePhase =
  | 'pending'
  | 'plan'
  | 'implementation'
  | 'quality'
  | 'review'
  | 'commit'
  | 'completed';

/**
 * Security policy mode governing command execution requests from the executor agent.
 *
 * @remarks
 * - `auto_safe`: Automatically permits read-only and benign workspace inspection commands; escalates unknowns.
 * - `allow_all`: Permits all commands within workspace boundaries without prompting.
 * - `allowlist`: Permits commands matching explicit prefix rules in `permissions.jsonc`.
 * - `ask_reviewer`: Delegates unclassified or sensitive command decisions directly to the reviewer harness.
 */
export type PermissionMode = 'auto_safe' | 'allow_all' | 'allowlist' | 'ask_reviewer';

/**
 * Outcome status reported in executor quality evidence.
 */
export type QualityEvidenceStatus = 'PASS' | 'FAIL';

/**
 * Immutable manifest capturing metadata and SHA256 hashes of stage specification files.
 */
export interface StageManifest {
  /** Canonical directory name of the stage (e.g. `stage-01-core-engine`). */
  name: string;
  /** CLI selector string used to pick this stage (e.g. `01`, `core`, or `stage-01-core-engine`). */
  selector: string;
  /** Absolute path or ZIP entry origin of the stage files. */
  source: string;
  /** Relative directory path within the stage source repository or archive. */
  relative_path: string;
  /** Map of relative file names to SHA256 hex digests of their contents. */
  sha256: Record<string, string>;
}

/**
 * Stage entry selected for execution in the current run.
 */
export interface SelectedStage {
  /** Canonical stage directory name matching {@link StageManifest.name}. */
  name: string;
  /** Selector used when the stage was requested. */
  selector: string;
  /** Current execution status of this stage. */
  status: StageStatus;
  /** Validated frozen manifest describing this stage's inputs. */
  manifest: StageManifest;
}

/**
 * Authoritative persisted state of an orchestration run.
 *
 * @remarks
 * Persisted atomically to `.ai-orchestrator/runs/<run_id>/state.json`.
 * External data loaded from disk must be validated via `validateRunState`
 * before being cast to this type.
 */
export interface RunState {
  /** Schema version for forward/backward compatibility migration. */
  version: number;
  /** Unique run identifier generated at run creation. */
  run_id: string;
  /** ISO 8601 timestamp when the run was initialized. */
  created_at: string;
  /** Overall execution status of the run. */
  status: RunStatus;
  /** Absolute path to the target repository workspace. */
  workspace: string;
  /** Git ref from which the run's AI branch was created (e.g. `HEAD` or branch name). */
  base_ref: string;
  /** Full Git commit SHA of the base commit. */
  base_commit: string;
  /** Git branch active when the run was initiated. */
  original_branch: string;
  /** Git HEAD commit SHA active when the run was initiated. */
  original_head: string;
  /** Dedicated AI branch name used for all commits in this run. */
  branch: string;
  /** Whether the AI branch has already been created on Git. */
  branch_created: boolean;
  /** ISO 8601 timestamp when the AI branch was created, if created. */
  branch_created_at?: string;
  /** Normalized path or archive source containing the stage definitions. */
  stage_source: string;
  /** Optional feature token used to filter stages during discovery. */
  feature?: string | null;
  /** Ordered list of stages selected for execution in this run. */
  stages: SelectedStage[];
  /** Identifier of the registered harness adapter used for implementation. */
  executor_harness: string;
  /** Identifier of the registered harness adapter used for evaluation. */
  reviewer_harness: string;
  /** Human-readable label of the executor adapter instance. */
  executor_label?: string;
  /** Human-readable label of the reviewer adapter instance. */
  reviewer_label?: string;
  /** Command invoked to execute project quality checks and tests. */
  quality_cmd: string;
  /** Index of the stage currently being executed within the `stages` array. */
  current_stage_index?: number;
  /** Active phase of the current stage. */
  current_phase?: StagePhase;
  /** Stash metadata if uncommitted changes were stashed prior to switching to the AI branch. */
  pre_run_stash?: { label: string; commit: string } | null;
  /** Human-readable error description when status indicates failure. */
  error?: string;
  /** Name of the stage that encountered a blocking condition, if any. */
  blocked_stage?: string;
  /** ISO 8601 timestamp when the run concluded successfully. */
  completed_at?: string;
  /** ISO 8601 timestamp when the run was halted or interrupted. */
  interrupted_at?: string;
  /** ISO 8601 timestamp of the most recent state mutation. */
  updated_at?: string;
}

/**
 * Persisted execution state of an individual stage attempt.
 *
 * @remarks
 * Persisted atomically to `.ai-orchestrator/runs/<run_id>/stages/<stage>/state.json`.
 */
export interface StageRuntimeState {
  /** Schema version for stage runtime records. */
  version: number;
  /** Active phase within the stage lifecycle. */
  phase: StagePhase;
  /** 1-based attempt counter for this stage. */
  attempt?: number;
  /** Plan review verdict or outcome status (e.g. `accepted`, `needs_revision`). */
  plan_status?: string;
  /** SHA256 hex digest of the accepted plan markdown. */
  plan_sha256?: string;
  /** SHA256 hex digest of the stage specification inputs. */
  spec_sha256?: string;
  /** Unresolved reviewer notes carried forward from prior review rounds or attempts. */
  reviewer_carryover?: string;
  /** Session identifier assigned by the active executor adapter. */
  executor_session_id?: string;
  /** Legacy V7 compatibility when resuming an older run. */
  cursor_session_id?: string;
  /** Relative path to the corroborated evidence JSON file for this attempt. */
  evidence_file?: string;
  /** Git patch SHA256 fingerprint verified against evidence. */
  patch_fingerprint?: string;
  /** Feedback provided by the reviewer during the most recent review. */
  reviewer_feedback?: string;
  /** Git commit SHA created when this stage was approved and committed. */
  commit_sha?: string;
  /** ISO 8601 timestamp of the most recent runtime state update. */
  updated_at?: string;
}

/**
 * Targeted test execution result reported in executor quality evidence.
 */
export interface FocusedTestResult {
  /** Test command invoked (e.g. `npm test -- -t "parser"`). */
  command: string;
  /** Process exit code (0 for pass). */
  exit_code: number;
  /** Short summary of test execution or failure output. */
  summary?: string;
}

/**
 * Observed execution telemetry captured during the quality epoch.
 */
export interface ObservedQuality {
  /** Command line executed. */
  command?: string;
  /** Process exit code observed by the harness. */
  exit_code?: number | null;
  /** ISO 8601 timestamp when the command completed. */
  timestamp?: string;
  /** Duration of execution in milliseconds. */
  duration_ms?: number;
  /** Captured stdout/stderr output excerpt. */
  output?: string;
  [key: string]: unknown;
}

/**
 * Authoritative record of an executor tool or subprocess invocation.
 *
 * @remarks
 * Captured by ACP normalizers or observation journals. Used by `EvidenceVerifier`
 * to corroborate that quality checks and tests were genuinely executed by the agent
 * rather than fabricated in `evidence.json`.
 */
export interface CommandObservation {
  /** Unique identifier for this observation entry. */
  observation_id: string;
  /** Run ID associated with this command. */
  run_id?: string;
  /** Stage name during which the command occurred. */
  stage?: string;
  /** Attempt number during which the command occurred. */
  attempt?: number;
  /** Harness session ID in which the command executed. */
  session_id: string;
  /** Harness tool name (e.g. `terminal`, `bash`). */
  tool_id: string;
  /** Unique invocation call ID from the protocol. */
  tool_call_id: string;
  /** Monotonically increasing sequence number within the session. */
  sequence: number;
  /** ISO 8601 timestamp of command execution. */
  timestamp: string;
  /** Origin source of the observation record. */
  source: 'acp' | 'broker' | 'replay';
  /** Raw command string as dispatched. */
  command: string;
  /** Normalized command string with shell wrappers stripped. */
  normalized_command: string;
  /** Classification confidence of command extraction. */
  command_confidence: 'high' | 'medium' | 'low';
  /** Terminal execution status of the command. */
  status: 'completed' | 'failed' | 'error' | 'in_progress' | 'pending';
  /** Command exit code (0 for success), or null if killed or timed out. */
  exit_code: number | null;
  /** Working directory where the command was executed. */
  cwd?: string;
  /** Quality epoch ID if executed during the stage quality phase. */
  quality_epoch_id?: string;
}

/**
 * Authoritative outcome of repository hygiene and diff inspection checks.
 */
export interface GitDiffCheckResult {
  /** True when the working tree diff complies with hygiene rules (no banned files, trailing whitespace). */
  ok: boolean;
  /** List of hygiene violations or issues found. */
  issues: string[];
  /** Command output or diff inspection summary. */
  output: string;
}

/**
 * Authoritative record marking the start of a quality verification epoch.
 *
 * @remarks
 * Invariant: Quality verification is partitioned into deterministic quality epochs.
 * Persisted to observation journals and ACP event logs so that historical replay
 * and crash recovery can reconstruct quality epoch boundaries.
 */
export interface QualityEpochMarker {
  /** Discriminator marking this record as a quality epoch start event. */
  record_type: 'quality_epoch_started';
  /** Optional run identifier associated with the epoch. */
  run_id?: string;
  /** Canonical name of the stage being verified. */
  stage?: string;
  /** 1-based attempt counter for the stage. */
  attempt?: number;
  /** Executor session ID active when the epoch started. */
  session_id?: string;
  /** Authoritative unique identifier of the quality epoch. */
  quality_epoch_id: string;
  /** Monotonic sequence counter at epoch start. */
  sequence: number;
  /** ISO 8601 timestamp when the epoch was initiated. */
  timestamp: string;
}

/**
 * Contextual metadata required to corroborate execution evidence against
 * active run, session, stage, attempt, sequence ordering, quality epoch, and git state.
 *
 * @remarks
 * Invariant: Evidence verification requires exact identity binding. Unscoped observations
 * or observations from mismatched runs, sessions, stages, attempts, or quality epochs
 * are strictly ineligible to prove quality claims.
 */
export interface VerificationContext {
  /** Authoritative run identifier (camelCase). */
  runId?: string;
  /** Authoritative run identifier (snake_case). */
  run_id?: string;
  /** Active executor session identifier (camelCase). */
  sessionId?: string;
  /** Active executor session identifier (snake_case). */
  session_id?: string;
  /** Expected stage name. */
  stage?: string;
  /** 1-based attempt counter for the current stage attempt. */
  attempt?: number;
  /** Unique identifier of the active quality epoch (camelCase). */
  qualityEpochId?: string;
  /** Unique identifier of the active quality epoch (snake_case). */
  quality_epoch_id?: string;
  /** Authoritative patch fingerprint calculated from repository diff (camelCase). */
  expectedPatchFingerprint?: string;
  /** Authoritative patch fingerprint calculated from repository diff (snake_case). */
  expected_patch_fingerprint?: string;
  /** Sequence number of the last detected repository mutation (camelCase). */
  lastMutationSequence?: number;
  /** Sequence number of the last detected repository mutation (snake_case). */
  last_mutation_sequence?: number;
  /** Outcome of authoritative Git diff hygiene check (camelCase). */
  orchestratorDiffCheckOk?: boolean;
  /** Outcome of authoritative Git diff hygiene check (snake_case). */
  orchestrator_diff_check_ok?: boolean;
  /** Target workspace root directory path. */
  workspace?: string;
}

/**
 * Authoritative quality evidence produced by the executor agent after implementation.
 *
 * @remarks
 * Written to `.ai-orchestrator/stage-runtime/<stage>/evidence.json`.
 * Must be corroborated by `EvidenceService` against observed command logs before
 * being accepted for reviewer evaluation.
 */
export interface ExecutionEvidence {
  /** Canonical name of the stage this evidence pertains to. */
  stage: string;
  /** Attempt number this evidence was produced for. */
  attempt: number;
  /** Overall quality gate verdict declared by the executor (`PASS` or `FAIL`). */
  status: QualityEvidenceStatus;
  /** Exact command used to execute project quality checks. */
  quality_command: string;
  /** Exit code returned by the quality command. */
  quality_exit_code: number;
  /** Exit code returned by the Git diff check command. */
  git_diff_check_exit_code: number;
  /** Detailed results of focused sub-tests executed. */
  focused_tests: FocusedTestResult[];
  /** Human-readable summary of quality check execution. */
  quality_summary: string;
  /** List of workspace files modified during this attempt. */
  changed_files: string[];
  /** Explicit list of known unresolved items or caveats. */
  unresolved: string[];
  /** Observed execution metadata captured by the harness during quality runs. */
  observed_quality?: ObservedQuality | null;
  /** SHA256 fingerprint of the repository diff when evidence was generated. */
  patch_fingerprint?: string;
  /** Identifier of the quality epoch during which these checks were run. */
  quality_epoch_id?: string;
}

/**
 * Structured verdict returned by the reviewer harness when evaluating an implementation plan.
 */
export interface PlanReviewVerdict {
  /** Reviewer verdict: approve, request replanning, or signal blocking issue. */
  verdict: 'APPROVE' | 'REPLAN' | 'BLOCKED';
  /** Concise summary of the evaluation. */
  summary: string;
  /** Specific criteria or tasks identified as missing from the plan. */
  missing_items: string[];
  /** Legacy field for Cursor feedback. */
  feedback_for_cursor?: string;
  /** Actionable feedback directed to the executor agent. */
  feedback_for_executor?: string;
  /** Metadata attached when a review was completed by a fallback reviewer model. */
  _orchestrator_meta?: ReviewerFallbackMetadata;
  [key: string]: unknown;
}

/**
 * Structured decision returned by the reviewer harness when resolving a permission request.
 */
export interface PermissionVerdict {
  /** Decision: allow or deny the requested command. */
  verdict: 'ALLOW' | 'DENY';
  /** Whether this decision may be cached for subsequent commands in the current stage. */
  cache_for_stage?: boolean;
  /** Explanation supporting the decision. */
  reason?: string;
  /** Metadata attached when a decision was completed by a fallback reviewer model. */
  _orchestrator_meta?: ReviewerFallbackMetadata;
}

/**
 * Structured decision returned by the reviewer harness when answering blocking questions.
 */
export interface QuestionVerdict {
  /** Decision: provide answers or declare questions blocked/ambiguous. */
  verdict: 'ANSWER' | 'BLOCKED';
  /** Selected option IDs mapped to question IDs. */
  answers?: Array<{ question_id: string; selected_option_ids: string[] }>;
  /** Architectural or specification rationale supporting the chosen answers. */
  rationale?: string;
  /** Metadata attached when answered by a fallback reviewer model. */
  _orchestrator_meta?: ReviewerFallbackMetadata;
}

/**
 * Discrete finding reported by the reviewer during final code review.
 */
export interface FinalVerdictFinding {
  /** Severity classification (e.g. `blocking`, `major`, `minor`, `advisory`). */
  severity?: string;
  /** Functional or architectural area affected. */
  area?: string;
  /** Detailed description of the defect or concern. */
  finding?: string;
  /** Prescribed remediation required before approval. */
  required_fix?: string;
}

/**
 * Authoritative verdict returned by the reviewer harness upon evaluating final stage implementation.
 */
export interface FinalVerdict {
  /** Final decision: approve implementation, require rework, request more context, or declare blocked. */
  verdict: 'APPROVE' | 'REWORK' | 'NEEDS_CONTEXT' | 'BLOCKED';
  /** Executive summary of the review outcome. */
  summary: string;
  /** Granular findings and defects identified during review. */
  findings?: Array<FinalVerdictFinding | string>;
  /** Concrete guidance provided to the executor when rework is required. */
  rework_instructions?: string;
  /** Specific workspace paths requested when context is incomplete. */
  requested_paths?: string[];
  /** Specific tests recommended to validate edge cases. */
  required_follow_up_tests?: string[];
  /** Metadata attached when review was completed by a fallback reviewer model. */
  _orchestrator_meta?: ReviewerFallbackMetadata;
}

/**
 * Execution context supplied to harness adapters during instantiation.
 */
export interface HarnessContext {
  /** Absolute path to the repository workspace. */
  workspace?: string;
  /** Active run identifier. */
  runId?: string;
  /** Canonical name of the active stage. */
  stageName?: string;
  /** Directory storing persisted run artifacts. */
  runDir?: string;
  /** Directory storing active stage artifacts. */
  stageDir?: string;
  /** Directory containing frozen read-only stage specification inputs. */
  frozenStageDir?: string;
  /** Project quality command string. */
  qualityCommand?: string;
  /** Event bus instance for UI event emission. */
  events?: unknown;
  /** Concatenated text of functional and technical specifications. */
  stageContext?: string;
  /** Concatenated text of relevant agent skills. */
  skillsText?: string;
  /** Absolute path to the run log file. */
  runLog?: string;
  /** Absolute path to the target project directory. */
  projectDir?: string;
  /** Path to the executor executable binary. */
  executorBinary?: string;
  /** Model identifier configured for the executor harness. */
  executorModel?: string;
  /** Path to the reviewer executable binary. */
  reviewerBinary?: string;
  /** Model identifier configured for the reviewer harness. */
  reviewerModel?: string;
  /** Thinking budget / level configured for models supporting explicit thinking controls. */
  thinking?: string;
  /** Reasoning effort configured for reasoning models. */
  reasoningEffort?: string;
  /** Timeout in minutes configured for operations in this role. */
  timeoutMinutes?: number;
  /** Timeout in seconds configured for operations in this role. */
  timeoutSeconds?: number;
  /** Verbosity level configured for reviewer models supporting verbosity control. */
  verbosity?: 'low' | 'medium' | 'high' | string;
  /** Context isolation mode for reviewer adapters (`'evidence_only'` or `'project_readonly'`). */
  contextMode?: 'evidence_only' | 'project_readonly' | string;
  /** Active attempt counter for the current stage. */
  attempt?: number;
  [key: string]: unknown;
}

// UI Event Definitions

/**
 * Mapping of semantic event names to their strongly typed payload structures.
 *
 * @remarks
 * UI components consume these events reactively without holding or mutating orchestration business state.
 */
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
  'executor.question.budget': {
    stage?: string;
    count?: number;
    limit?: number;
    title?: string;
    [key: string]: unknown;
  };
  'executor.permission': { command?: string; [key: string]: unknown };
  'reviewer.plan': { verdict?: string; summary?: string; [key: string]: unknown };
  'reviewer.question': { answer?: string; [key: string]: unknown };
  'reviewer.permission': { verdict?: string; summary?: string; [key: string]: unknown };
  'reviewer.fallback': {
    stage?: string;
    attempt?: number;
    decision_type?: string;
    failed_harness?: string;
    failed_model?: string;
    trigger?: string;
    fallback_harness?: string;
    fallback_model?: string;
    reason?: string;
    [key: string]: unknown;
  };
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

/**
 * Union of all known semantic event type identifiers emitted by the orchestrator.
 */
export type KnownUiEventType = keyof UiEventPayloadMap;

/**
 * Strongly typed semantic event matching a recognized event key from {@link UiEventPayloadMap}.
 *
 * @typeParam K - Event key from {@link UiEventPayloadMap}.
 */
export interface TypedUiEvent<K extends KnownUiEventType = KnownUiEventType> {
  /** ISO 8601 timestamp when the event was emitted. */
  ts: string;
  /** Semantic event type key. */
  type: K;
  /** Strongly typed payload corresponding to type `K`. */
  payload: UiEventPayloadMap[K];
}

/**
 * Dynamically typed event structure for unclassified or custom events.
 */
export interface GenericUiEvent {
  /** ISO 8601 timestamp when the event was emitted. */
  ts: string;
  /** Event name identifier. */
  type: string;
  /** Arbitrary event payload. */
  payload: Record<string, unknown>;
}

/**
 * General envelope for all events emitted across the semantic EventBus.
 *
 * @typeParam TPayload - Payload type defaulted to `Record<string, unknown>`.
 */
export interface UiEvent<TPayload = Record<string, unknown>> {
  /** ISO 8601 timestamp when the event was emitted. */
  ts: string;
  /** Event name identifier. */
  type: string;
  /** Event payload data. */
  payload: TPayload;
}
