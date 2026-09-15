/**
 * @fileoverview Internal boundary types and contracts for Codex reviewer harness.
 *
 * Defines configuration options, prompt parameters, reviewer execution results,
 * and token accounting structures for Codex reviewer subprocess sessions.
 */

export type CodexDecisionKind = 'plan-review' | 'question' | 'permission' | 'final-review';

/**
 * Options for constructing a structured Markdown prompt for Codex reviewer.
 */
export interface PromptBuilderOptions {
  kind: CodexDecisionKind;
  stageName: string;
  stageContext: string;
  skillsText: string;
  payload: unknown;
  extraPromptText?: string;
  readonlyProject?: boolean;
}

/**
 * Options for executing Codex reviewer subprocess.
 */
export interface CodexExecutionOptions {
  binary: string;
  model: string;
  reasoningEffort: string;
  verbosity: string;
  timeoutMinutes: number;
  contextMode: 'evidence_only' | 'project_readonly';
  runDir: string;
  stageName: string;
  decisionKind: CodexDecisionKind;
  decisionSeq: number;
  prompt: string;
  schemaFileName: string;
  events?: any;
  runLog?: string;
}

/**
 * Result of executing Codex reviewer subprocess.
 */
export interface CodexExecutionResult<T> {
  result: T;
  eventsFilePath: string;
  decisionDir: string;
}
