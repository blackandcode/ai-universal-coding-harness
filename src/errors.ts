/**
 * @fileoverview Domain error class hierarchy for AI Universal Coding Harness.
 * Distinguishes actionable failure categories across configuration, stage sources,
 * Git lifecycle, run locks, run states, evidence verification, and process execution.
 */

export interface ErrorOptions {
  cause?: unknown;
}

/**
 * Base error for all domain errors produced by the harness.
 */
export class HarnessError extends Error {
  /** @param message - Human-readable failure description. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HarnessError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when configuration files, environment variables, or CLI config inputs are invalid.
 */
export class ConfigError extends HarnessError {
  /** @param message - Describes the invalid configuration input or constraint violation. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConfigError';
  }
}

/**
 * Thrown when stage directories or zip archives fail structural or content validation.
 */
export class StageSourceError extends HarnessError {
  /** @param message - Describes the stage layout, ZIP, or manifest validation failure. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StageSourceError';
  }
}

/**
 * Thrown when a Git command or branch lifecycle invariant fails.
 */
export class GitLifecycleError extends HarnessError {
  /** @param message - Describes the failed Git command or branch invariant. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GitLifecycleError';
  }
}

/**
 * Thrown when an active orchestrator run lock conflicts with another process.
 */
export class LockConflictError extends HarnessError {
  /** @param message - Describes the conflicting lock holder (PID/run id). */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LockConflictError';
  }
}

/**
 * Thrown when persisted run or stage state is missing, corrupt, or fails runtime schema validation.
 */
export class RunStateError extends HarnessError {
  /** @param message - Describes missing, corrupt, or schema-invalid persisted state. */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RunStateError';
  }
}

/**
 * Thrown when a subprocess execution times out, is aborted, or exits with an unexpected non-zero code.
 */
export class ProcessExecutionError extends HarnessError {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;

  /**
   * @param message - Summary of the subprocess failure.
   * @param details - Captured exit metadata and optional `cause` for chaining.
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
