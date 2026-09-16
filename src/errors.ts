/**
 * @fileoverview Domain error class hierarchy for AI Universal Coding Harness.
 *
 * Distinguishes actionable domain failure categories across configuration, stage sources,
 * Git lifecycle, run locks, run states, evidence verification, and process execution.
 *
 * @remarks
 * Callers and recovery managers inspect error prototypes to distinguish between
 * retryable subprocess timeouts, specification blockers, lock contention, and fatal invariant violations.
 */

/**
 * Standard options supplied when instantiating domain error classes, supporting error chaining.
 */
export interface ErrorOptions {
  /** Underlying cause of the failure, enabling standard `Error.cause` traversal. */
  cause?: unknown;
}

/**
 * Base error class for all domain errors produced by the orchestration engine.
 *
 * @remarks
 * All domain-specific errors inherit from this class to allow coarse-grained
 * error handling at outer CLI boundaries while preserving prototype chains.
 */
export class HarnessError extends Error {
  /**
   * @param message - Human-readable failure description.
   * @param options - Optional error construction options specifying an underlying cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HarnessError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when configuration files, environment variables, or CLI config inputs are invalid or missing.
 */
export class ConfigError extends HarnessError {
  /**
   * @param message - Describes the invalid configuration input or constraint violation.
   * @param options - Optional error construction options specifying an underlying cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConfigError';
  }
}

/**
 * Thrown when stage directories or zip archives fail structural, checksum, or content validation.
 */
export class StageSourceError extends HarnessError {
  /**
   * @param message - Describes the stage layout, ZIP, or manifest validation failure.
   * @param options - Optional error construction options specifying an underlying cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StageSourceError';
  }
}

/**
 * Thrown when a Git command or branch lifecycle invariant fails.
 *
 * @remarks
 * Invariants include one-run-one-branch, clean-working-tree preconditions,
 * and forbidding automatic remote pushes or branch merges.
 */
export class GitLifecycleError extends HarnessError {
  /**
   * @param message - Describes the failed Git command or branch invariant.
   * @param options - Optional error construction options specifying an underlying cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GitLifecycleError';
  }
}

/**
 * Thrown when an active orchestrator run lock conflicts with another process.
 *
 * @remarks
 * Prevents concurrent runs in the same workspace from corrupting state or clobbering Git branches.
 */
export class LockConflictError extends HarnessError {
  /**
   * @param message - Describes the conflicting lock holder (PID or active run ID).
   * @param options - Optional error construction options specifying an underlying cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LockConflictError';
  }
}

/**
 * Thrown when persisted run or stage state is missing, corrupt, or fails runtime schema validation.
 *
 * @remarks
 * Triggered by `validateRunState` or `validateStageRuntimeState` when loading JSON from disk.
 */
export class RunStateError extends HarnessError {
  /**
   * @param message - Describes missing, corrupt, or schema-invalid persisted state.
   * @param options - Optional error construction options specifying an underlying cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RunStateError';
  }
}

/**
 * Thrown when a subprocess execution times out, is aborted, or exits with an unexpected non-zero code.
 */
export class ProcessExecutionError extends HarnessError {
  /** Process exit status code, or null if terminated by a signal. */
  readonly exitCode: number | null;
  /** POSIX signal that caused process termination, if applicable. */
  readonly signal: NodeJS.Signals | null;
  /** Captured standard output up to the point of failure. */
  readonly stdout: string;
  /** Captured standard error up to the point of failure. */
  readonly stderr: string;
  /** True when termination was triggered by exceeding the configured timeout. */
  readonly timedOut: boolean;

  /**
   * @param message - Summary of the subprocess failure.
   * @param details - Captured exit metadata, process streams, and optional cause.
   */
  constructor(
    message: string,
    details?: {
      exitCode?: number | null;
      signal?: NodeJS.Signals | null;
      stdout?: string;
      stderr?: string;
      timedOut?: boolean;
      cause?: unknown;
    }
  ) {
    super(message, details?.cause !== undefined ? { cause: details.cause } : undefined);
    this.name = 'ProcessExecutionError';
    this.exitCode = details?.exitCode ?? null;
    this.signal = details?.signal ?? null;
    this.stdout = details?.stdout ?? '';
    this.stderr = details?.stderr ?? '';
    this.timedOut = details?.timedOut ?? false;
  }
}

/**
 * Extracts a human-readable error message safely from an unknown caught value.
 *
 * @param error - Caught error value of unknown type.
 * @returns Formatted error message string.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error ?? 'Unknown error');
}
