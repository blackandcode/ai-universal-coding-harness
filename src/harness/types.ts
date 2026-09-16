/**
 * @fileoverview Domain contracts and interfaces for executor and reviewer harness adapters.
 *
 * Defines session callbacks, preflight contracts, plan decision structures, reviewer roles,
 * failover metadata, and harness factory signatures.
 *
 * @remarks
 * Architectural Invariants:
 * - The orchestration engine is harness-neutral; adapters encapsulate model, binary, and protocol quirks.
 * - Executor adapters drive interactive coding sessions, command executions, and evidence production.
 * - Reviewer adapters evaluate evidence, plans, and diffs; they must NEVER execute code or mutate repository files.
 * - Adapters must NEVER perform Git push, merge, rebase, or branch resets; Git lifecycle is owned by the engine.
 */

import type {
  FinalVerdict,
  PermissionVerdict,
  PlanReviewVerdict,
  QuestionVerdict,
  CommandObservation,
  HarnessContext
} from '../types.js';
import type { PermissionRequest } from '../permissions/PermissionEngine.js';

/**
 * Metadata identifying a registered harness adapter instance.
 */
export interface HarnessInfo {
  /** Unique harness identifier (e.g. `'cursor'`, `'codex'`). */
  id: string;
  /** Human-readable display label. */
  label: string;
  /** Role in the staged orchestration lifecycle (`'executor'` or `'reviewer'`). */
  role: 'executor' | 'reviewer';
  /** Underlying model identifier (e.g. `'gemini-3.8-flash'`, `'gpt-6-astra'`). */
  model: string;
}

/**
 * Outcome of preflight validation checking required binaries and tools.
 */
export interface HarnessPreflightResult {
  /** True if all prerequisites, binaries, and environment requirements are satisfied. */
  ok: boolean;
  /** Diagnostic log messages detailing specific checks performed. */
  details: string[];
}

/**
 * Possible outcome categories for an implementation plan review.
 */
export type PlanDecisionOutcome = 'needs_revision' | 'accepted' | 'accepted_with_notes';

/**
 * Input supplied to a reviewer harness when evaluating an implementation plan.
 */
export interface PlanReviewInput {
  /** Plan markdown drafted by the executor. */
  plan?: string;
  /** Current active plan markdown if different from original draft. */
  current_plan?: string;
  /** Concatenated text of functional and technical specifications for the stage. */
  original_stage_inputs?: string;
  /** Feedback delivered in earlier review rounds of this stage. */
  prior_feedback?: string;
  /** Current review round number. */
  review_round?: number | string;
  /** Configured limit of regular review iterations before forced carryover consolidation. */
  max_regular_reviews?: number;
  /** Legacy alias for `review_round`. */
  round?: number | string;
  /** Canonical name of the stage under review. */
  stage?: string;
  [key: string]: unknown;
}

/**
 * Input supplied to a reviewer harness when answering blocking questions posed by an executor.
 */
export interface QuestionReviewInput {
  /** Optional title or context summary for the question set. */
  title?: string;
  /** Array of multiple-choice questions requiring architectural resolution. */
  questions?: Array<{
    /** Unique question identifier. */
    id: string;
    /** Question prompt text explaining the ambiguity or decision needed. */
    prompt: string;
    /** Discrete selectable options for this question. */
    options?: Array<{ id: string; label?: string }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Input supplied when requesting a reviewer decision on an unclassified or sensitive permission request.
 */
export interface PermissionReviewInput {
  /** Original permission request metadata. */
  request?: unknown;
  /** Deterministic command or path signature for caching. */
  signature?: string;
  /** Active autonomous permission mode. */
  permission_mode?: string;
  /** Raw shell command line requested by the executor. */
  command?: string;
  /** Contextual note explaining why the request was escalated. */
  note?: string;
  [key: string]: unknown;
}

/**
 * Input supplied to a reviewer harness for final code review of a completed stage.
 */
export interface FinalReviewInput {
  /** Unified Git diff showing code changes introduced during this stage. */
  diff?: string;
  /** Git diffstat summary showing file change metrics. */
  diff_stat?: string;
  /** Corroborated execution evidence asserting test and quality outcomes. */
  evidence?: unknown;
  /** Canonical name of the stage under review. */
  stage?: string;
  /** Current attempt counter for this stage. */
  attempt?: number;
  [key: string]: unknown;
}

/**
 * Structured decision returned to the executor session after plan evaluation.
 */
export type PlanDecision =
  | {
      outcome: 'needs_revision';
      accepted: false;
      feedback: string;
      verdict?: PlanReviewVerdict;
      status?: string;
      carryover?: string;
    }
  | {
      outcome: 'accepted';
      accepted: true;
      status: 'APPROVE';
      carryover?: string;
      verdict?: PlanReviewVerdict;
      feedback?: string;
    }
  | {
      outcome: 'accepted_with_notes';
      accepted: true;
      status: 'APPROVE_WITH_NOTES';
      carryover: string;
      verdict?: PlanReviewVerdict;
      feedback?: string;
    };

/**
 * Callbacks supplied by the orchestrator to handle interactive session events.
 *
 * @remarks
 * Bridges executor-initiated protocol events to the orchestrator's review services
 * and permission engine.
 */
export interface ExecutorSessionCallbacks {
  /**
   * Invoked when the executor submits an implementation plan for review.
   *
   * @param plan - Raw plan markdown generated by the agent.
   * @param metadata - Untrusted auxiliary metadata provided by the harness protocol.
   * @returns Structured {@link PlanDecision} containing approval or revision feedback.
   */
  onPlan: (plan: string, metadata: unknown) => Promise<PlanDecision>;

  /**
   * Invoked when the executor requests reviewer answers to blocking questions.
   *
   * @param payload - Structured question review input.
   * @returns Selected options and rationale for each question.
   */
  onQuestion: (payload: QuestionReviewInput) => Promise<{
    answers: Array<{ questionId: string; selectedOptionIds: string[] }>;
    rationale: string;
  }>;

  /**
   * Invoked when the executor requests execution or write permissions.
   *
   * @param request - Structured permission request containing command line or paths.
   * @param payload - Untrusted raw request payload from the protocol transport.
   * @returns Allowed/denied decision with supporting reason.
   */
  onPermission: (
    request: PermissionRequest,
    payload: unknown
  ) => Promise<{ allow: boolean; reason: string }>;

  /**
   * Optional notification invoked when the harness assigns or confirms a session identifier.
   *
   * @param id - Session identifier string.
   */
  onSessionId?: (id: string) => void;
}

/**
 * Active interactive session managed by an executor harness.
 *
 * @remarks
 * Invariants:
 * - Represents a single stateful agent session spanning a stage attempt.
 * - Callers must invoke `stop()` when terminating the session to release child processes and handles.
 */
export interface ExecutorSession {
  /** Unique session identifier assigned by the harness. */
  id: string;

  /**
   * Switches the session interaction mode.
   *
   * @param mode - Target mode (`'plan'`, `'agent'`, or `'ask'`).
   */
  setMode(mode: 'plan' | 'agent' | 'ask'): Promise<void>;

  /**
   * Sends a prompt to the executor agent and awaits turn completion.
   *
   * @param text - Prompt instructions sent to the agent.
   * @returns Accumulated text response and raw harness turn result.
   */
  prompt(text: string): Promise<{ text: string; result: unknown }>;

  /**
   * Stops and cleans up the active session and child processes.
   */
  stop(): Promise<void>;

  /**
   * Cancels the currently active turn if supported by the harness protocol.
   */
  cancel?(): Promise<void>;

  /**
   * Returns all command observations recorded during this session.
   *
   * @returns Array of {@link CommandObservation} records.
   */
  observedCommands(): CommandObservation[];

  /**
   * Optional sequence counter for ordered event corroboration.
   *
   * @returns Monotonically increasing sequence number.
   */
  currentSequence?(): number;

  /**
   * Optional sequence counter marking the last recorded repository file mutation.
   *
   * @returns Sequence number of the last mutation event.
   */
  lastMutationSeq?(): number;

  /**
   * Sets the active quality epoch identifier to isolate quality commands from earlier implementation steps.
   *
   * @param epochId - Epoch identifier string.
   */
  setQualityEpoch?(epochId: string): void;
}

/**
 * Executor harness adapter contract for driving agent implementations and test executions.
 *
 * @remarks
 * Invariants:
 * - Adapters manage binary invocations, protocol streams, and session lifetimes.
 * - Adapters must NEVER perform Git push, merge, rebase, or branch checkout operations.
 * - Project quality commands and test executions are executed within the executor environment.
 */
export interface ExecutorHarness {
  /** Harness identifier, model, and metadata. */
  info: HarnessInfo;

  /**
   * Verifies local binary and environment readiness before starting a run.
   *
   * @returns Preflight validation result detailing prerequisite checks.
   */
  preflight(): Promise<HarnessPreflightResult>;

  /**
   * Instantiates a new interactive executor session.
   *
   * @param opts - Session options including workspace path, log paths, and event callbacks.
   * @returns Initialized {@link ExecutorSession}.
   */
  createSession(opts: {
    workspace: string;
    runLog: string;
    eventsFile: string;
    focusFile: string;
    resumeSessionId?: string;
    callbacks: ExecutorSessionCallbacks;
  }): Promise<ExecutorSession>;
}

/**
 * Reviewer harness adapter contract for evaluating plans, answering questions, and reviewing code.
 *
 * @remarks
 * Invariants:
 * - Reviewers are purely evaluative; they inspect diffs and evidence but MUST NOT modify files or run commands.
 * - Reviewer implementations must be stateless between invocations.
 */
export interface ReviewerHarness {
  /** Harness identifier, model, and metadata. */
  info: HarnessInfo;

  /**
   * Verifies local binary and environment readiness before starting a run.
   *
   * @returns Preflight validation result detailing prerequisite checks.
   */
  preflight(): Promise<HarnessPreflightResult>;

  /**
   * Evaluates an implementation plan against stage requirements.
   *
   * @param input - Plan text, specifications, and prior feedback.
   * @param opts - Optional flags such as `finalConsolidation` when budget limits are reached.
   * @returns Evaluated {@link PlanReviewVerdict}.
   */
  reviewPlan(
    input: PlanReviewInput,
    opts?: { finalConsolidation?: boolean }
  ): Promise<PlanReviewVerdict>;

  /**
   * Answers blocking questions posed by the executor agent.
   *
   * @param input - Structured question review input.
   * @returns Evaluated {@link QuestionVerdict} containing selected options and rationale.
   */
  answerQuestions(input: QuestionReviewInput): Promise<QuestionVerdict>;

  /**
   * Decides permission requests referred from the permission engine.
   *
   * @param input - Permission review details including command line and context.
   * @returns Evaluated {@link PermissionVerdict}.
   */
  decidePermission(input: PermissionReviewInput): Promise<PermissionVerdict>;

  /**
   * Performs final code review against the Git diff and corroborated evidence.
   *
   * @param input - Diff text, diffstat, and corroborated evidence.
   * @returns Evaluated {@link FinalVerdict}.
   */
  reviewImplementation(input: FinalReviewInput): Promise<FinalVerdict>;
}

/**
 * Factory function for creating an {@link ExecutorHarness} given an execution context.
 *
 * @param context - Execution context containing workspace paths and model settings.
 * @returns Instantiated {@link ExecutorHarness}.
 */
export type ExecutorHarnessFactory = (context: HarnessContext) => ExecutorHarness;

/**
 * Factory function for creating a {@link ReviewerHarness} given an execution context.
 *
 * @param context - Execution context containing workspace paths and model settings.
 * @returns Instantiated {@link ReviewerHarness}.
 */
export type ReviewerHarnessFactory = (context: HarnessContext) => ReviewerHarness;

/**
 * Functional roles assigned to reviewer model instances in routed execution.
 */
export type ReviewerRole = 'primary' | 'fallback' | 'large_diff' | 'permission';

/**
 * Recognizable infrastructure and provider failure conditions triggering automatic reviewer fallback.
 */
export type ReviewerFallbackTrigger =
  | 'usage_limit'
  | 'rate_limit'
  | 'quota_exhausted'
  | 'no_result'
  | 'process_crash'
  | 'timeout'
  | 'turn_failed';

/**
 * Configuration options for an individual reviewer harness/model role.
 */
export interface ReviewerModelConfig {
  /** Identifier of the reviewer harness adapter (e.g. `'codex'`, `'cursor'`). */
  harness: string;
  /** Underlying model identifier (e.g. `'gpt-6-astra'`, `'gemini-3.8-flash'`). */
  model: string;
  /** Thinking budget / level for models supporting explicit thinking controls. */
  thinking?: 'low' | 'medium' | 'high';
  /** Reasoning effort for OpenAI reasoning models. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Model output verbosity level. */
  verbosity?: 'low' | 'medium' | 'high';
  /** Review timeout in minutes. */
  timeoutMinutes?: number;
  /** Review timeout in seconds (useful for fast-path permission reviews). */
  timeoutSeconds?: number;
  /** Context isolation mode. */
  contextMode?: 'evidence_only' | 'project_readonly';
}

/**
 * Comprehensive configuration for the multi-tier ReviewerRouter subsystem.
 */
export interface ReviewerRouterConfig {
  /** Primary reviewer used for standard plan reviews and final code reviews. */
  primary: ReviewerModelConfig;
  /** Fallback reviewer invoked automatically when primary encounters trigger conditions. */
  fallback: ReviewerModelConfig & {
    /** Whether automatic failover is enabled. */
    enabled: boolean;
    /** Failure triggers that activate the fallback reviewer. */
    triggers: ReviewerFallbackTrigger[];
  };
  /** High-context reviewer selected when unified diff character count exceeds threshold. */
  largeDiff: ReviewerModelConfig & {
    /** Character count threshold triggering large-diff reviewer selection. */
    thresholdChars: number;
  };
  /** Fast lightweight reviewer dedicated to evaluating command permissions. */
  permission: ReviewerModelConfig;
}

/**
 * Audit metadata persisted when a review verdict is produced by a fallback reviewer.
 */
export interface ReviewerFallbackMetadata {
  /** Identifier and model of the fallback adapter that executed the review. */
  executed_by: string;
  /** Identifier and model of the primary adapter that failed. */
  fallback_from: string;
  /** Trigger condition that caused the failover. */
  trigger: ReviewerFallbackTrigger;
  /** Error message or diagnostic detail from the primary failure. */
  original_error: string;
  /** ISO 8601 timestamp when fallback was executed. */
  timestamp: string;
}
