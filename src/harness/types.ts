/**
 * @fileoverview Domain contracts and interfaces for executor and reviewer harness adapters.
 * Defines session callbacks, preflight contracts, plan decision structures, and harness factories.
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
 * Metadata identifying a harness adapter instance.
 */
export interface HarnessInfo {
  /** Unique harness identifier (e.g. 'cursor', 'codex') */
  id: string;
  /** Human-readable display label */
  label: string;
  /** Role in the staged orchestration lifecycle */
  role: 'executor' | 'reviewer';
  /** Underlying model identifier */
  model: string;
}

/**
 * Outcome of preflight validation checking required binaries and tools.
 */
export interface HarnessPreflightResult {
  /** True if all prerequisites and binaries are available */
  ok: boolean;
  /** Diagnostic log messages detailing checks performed */
  details: string[];
}

/**
 * Plan decision outcome state enum.
 */
export type PlanDecisionOutcome = 'needs_revision' | 'accepted' | 'accepted_with_notes';

/**
 * Input supplied when evaluating an implementation plan.
 */
export interface PlanReviewInput {
  plan?: string;
  current_plan?: string;
  original_stage_inputs?: string;
  prior_feedback?: string;
  review_round?: number | string;
  max_regular_reviews?: number;
  round?: number | string;
  stage?: string;
  [key: string]: unknown;
}

/**
 * Input supplied when asking blocking questions to a reviewer.
 */
export interface QuestionReviewInput {
  title?: string;
  questions?: Array<{
    id: string;
    prompt: string;
    options?: Array<{ id: string; label?: string }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Input supplied when requesting a reviewer decision on permissions.
 */
export interface PermissionReviewInput {
  request?: unknown;
  signature?: string;
  permission_mode?: string;
  command?: string;
  note?: string;
  [key: string]: unknown;
}

/**
 * Input supplied when requesting final implementation review.
 */
export interface FinalReviewInput {
  diff?: string;
  diff_stat?: string;
  evidence?: unknown;
  stage?: string;
  attempt?: number;
  [key: string]: unknown;
}

/**
 * Structured decision returned after plan evaluation.
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
 */
export interface ExecutorSessionCallbacks {
  /** Invoked when the executor submits an execution plan */
  onPlan: (plan: string, metadata: unknown) => Promise<PlanDecision>;
  /** Invoked when the executor requests user/reviewer answers to blocking questions */
  onQuestion: (payload: QuestionReviewInput) => Promise<{
    answers: Array<{ questionId: string; selectedOptionIds: string[] }>;
    rationale: string;
  }>;
  /** Invoked when the executor requests command execution or write permissions */
  onPermission: (
    request: PermissionRequest,
    payload: unknown
  ) => Promise<{ allow: boolean; reason: string }>;
  /** Optional callback invoked when the harness assigns an in-process session ID */
  onSessionId?: (id: string) => void;
}

/**
 * Active interactive session managed by an executor harness.
 */
export interface ExecutorSession {
  /** Session identifier */
  id: string;
  /** Switches session interaction mode */
  setMode(mode: 'plan' | 'agent' | 'ask'): Promise<void>;
  /** Sends a prompt to the executor agent */
  prompt(text: string): Promise<{ text: string; result: unknown }>;
  /** Stops and cleans up the active session */
  stop(): Promise<void>;
  /** Cancels the currently executing turn if supported */
  cancel?(): Promise<void>;
  /** Returns the list of commands observed during this session */
  observedCommands(): CommandObservation[];
  /** Optional sequence counter */
  currentSequence?(): number;
  /** Optional last mutation sequence counter */
  lastMutationSeq?(): number;
  /** Optional quality epoch tracker */
  setQualityEpoch?(epochId: string): void;
}

/**
 * Executor harness adapter contract for driving agent implementations and test executions.
 */
export interface ExecutorHarness {
  /** Harness identifier and metadata */
  info: HarnessInfo;
  /** Verifies binary and environment readiness */
  preflight(): Promise<HarnessPreflightResult>;
  /** Instantiates a new executor session */
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
 */
export interface ReviewerHarness {
  /** Harness identifier and metadata */
  info: HarnessInfo;
  /** Verifies binary and environment readiness */
  preflight(): Promise<HarnessPreflightResult>;
  /** Evaluates an implementation plan */
  reviewPlan(
    input: PlanReviewInput,
    opts?: { finalConsolidation?: boolean }
  ): Promise<PlanReviewVerdict>;
  /** Answers blocking questions posed by the executor */
  answerQuestions(input: QuestionReviewInput): Promise<QuestionVerdict>;
  /** Decides permission requests referred from the permission engine */
  decidePermission(input: PermissionReviewInput): Promise<PermissionVerdict>;
  /** Performs final implementation review against git diff and corroborated evidence */
  reviewImplementation(input: FinalReviewInput): Promise<FinalVerdict>;
}

/** Factory function for creating an ExecutorHarness */
export type ExecutorHarnessFactory = (context: HarnessContext) => ExecutorHarness;

/** Factory function for creating a ReviewerHarness */
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
  /** Identifier of the reviewer harness adapter (e.g. 'codex', 'cursor') */
  harness: string;
  /** Underlying model identifier (e.g. 'gpt-6-astra', 'gemini-3.8-flash') */
  model: string;
  /** Thinking budget / level for models supporting explicit thinking */
  thinking?: 'low' | 'medium' | 'high';
  /** Reasoning effort for OpenAI reasoning models */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Model output verbosity level */
  verbosity?: 'low' | 'medium' | 'high';
  /** Review timeout in minutes */
  timeoutMinutes?: number;
  /** Review timeout in seconds (useful for fast-path permission reviews) */
  timeoutSeconds?: number;
  /** Context isolation mode */
  contextMode?: 'evidence_only' | 'project_readonly';
}

/**
 * Comprehensive configuration for the multi-tier ReviewerRouter subsystem.
 */
export interface ReviewerRouterConfig {
  /** Primary reviewer used for standard plan reviews and final code reviews */
  primary: ReviewerModelConfig;
  /** Fallback reviewer invoked automatically when primary encounters trigger conditions */
  fallback: ReviewerModelConfig & {
    enabled: boolean;
    triggers: ReviewerFallbackTrigger[];
  };
  /** High-context reviewer selected when unified diff character count exceeds threshold */
  largeDiff: ReviewerModelConfig & {
    thresholdChars: number;
  };
  /** Fast lightweight reviewer dedicated to evaluating command permissions */
  permission: ReviewerModelConfig;
}

/**
 * Audit metadata persisted when a review verdict is produced by a fallback reviewer.
 */
export interface ReviewerFallbackMetadata {
  /** Identifier and model of the fallback adapter that executed the review */
  executed_by: string;
  /** Identifier and model of the primary adapter that failed */
  fallback_from: string;
  /** Trigger condition that caused the failover */
  trigger: ReviewerFallbackTrigger;
  /** Error message or diagnostic detail from the primary failure */
  original_error: string;
  /** ISO timestamp when fallback was executed */
  timestamp: string;
}
