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
  onPlan: (plan: string, metadata: any) => Promise<PlanDecision>;
  /** Invoked when the executor requests user/reviewer answers to blocking questions */
  onQuestion: (payload: any) => Promise<{
    answers: Array<{ questionId: string; selectedOptionIds: string[] }>;
    rationale: string;
  }>;
  /** Invoked when the executor requests command execution or write permissions */
  onPermission: (
    request: PermissionRequest,
    payload: any,
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
  prompt(text: string): Promise<{ text: string; result: any }>;
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
  reviewPlan(input: any, opts?: { finalConsolidation?: boolean }): Promise<PlanReviewVerdict>;
  /** Answers blocking questions posed by the executor */
  answerQuestions(input: any): Promise<QuestionVerdict>;
  /** Decides permission requests referred from the permission engine */
  decidePermission(input: any): Promise<PermissionVerdict>;
  /** Performs final implementation review against git diff and corroborated evidence */
  reviewImplementation(input: any): Promise<FinalVerdict>;
}

/** Factory function for creating an ExecutorHarness */
export type ExecutorHarnessFactory = (context: any) => ExecutorHarness;

/** Factory function for creating a ReviewerHarness */
export type ReviewerHarnessFactory = (context: any) => ReviewerHarness;
