/**
 * @fileoverview Internal boundary types and contracts for Codex reviewer harness.
 *
 * Defines configuration options, prompt parameters, reviewer execution results,
 * and token accounting structures for Codex reviewer subprocess sessions.
 *
 * @remarks
 * Codex reviewer operates non-interactively in an isolated subprocess.
 * It consumes prompts constructed from frozen specifications, diffs, and evidence,
 * and produces structured JSON outputs validated against designated schemas.
 */

/**
 * Categorical type of reviewer decision being requested from Codex.
 *
 * @remarks
 * - `'plan-review'`: Evaluates implementation plans against stage specifications.
 * - `'question'`: Answers blocking multi-choice questions from the executor agent.
 * - `'permission'`: Evaluates sensitive or unclassified command execution permissions.
 * - `'final-review'`: Reviews unified diffs and corroborated evidence for final stage sign-off.
 */
export type CodexDecisionKind = 'plan-review' | 'question' | 'permission' | 'final-review';

/**
 * Options for constructing a structured Markdown prompt for Codex reviewer.
 */
export interface PromptBuilderOptions {
  /** Nature of the review decision requested. */
  kind: CodexDecisionKind;
  /** Canonical name of the stage under review. */
  stageName: string;
  /** Concatenated text of functional and technical specifications. */
  stageContext: string;
  /** Concatenated text of relevant agent skills. */
  skillsText: string;
  /** Domain payload under evaluation (plan, questions, permission request, or final diff). */
  payload: unknown;
  /** Additional instructional prompt text appended to the review prompt. */
  extraPromptText?: string;
  /** Whether the target repository should be exposed in read-only mode to the reviewer. */
  readonlyProject?: boolean;
}

/**
 * Options configuring the Codex reviewer subprocess execution.
 */
export interface CodexExecutionOptions {
  /** Executable binary name or absolute path for Codex CLI. */
  binary: string;
  /** Model identifier configured for Codex review (e.g. `'gpt-6-astra'`). */
  model: string;
  /** Reasoning effort level (`'low'`, `'medium'`, `'high'`). */
  reasoningEffort: string;
  /** Model output verbosity level. */
  verbosity: string;
  /** Subprocess timeout in minutes before aborting. */
  timeoutMinutes: number;
  /** Context isolation mode (`'evidence_only'` or `'project_readonly'`). */
  contextMode: 'evidence_only' | 'project_readonly';
  /** Root directory storing run artifacts and logs. */
  runDir: string;
  /** Canonical name of the active stage. */
  stageName: string;
  /** Type of decision being evaluated. */
  decisionKind: CodexDecisionKind;
  /** Monotonically increasing decision sequence counter. */
  decisionSeq: number;
  /** Fully rendered prompt text delivered to Codex CLI. */
  prompt: string;
  /** File name of the JSON schema enforcing structured output. */
  schemaFileName: string;
  /** Event bus instance for UI event emission. */
  events?: any;
  /** Absolute path to the run log file. */
  runLog?: string;
}

/**
 * Result returned by the Codex subprocess runner.
 *
 * @typeParam T - Strongly typed decision result parsed from Codex output.
 */
export interface CodexExecutionResult<T> {
  /** Parsed and validated domain verdict. */
  result: T;
  /** Path to the event stream JSONL file recorded during the review turn. */
  eventsFilePath: string;
  /** Path to the dedicated artifact directory created for this decision attempt. */
  decisionDir: string;
}
