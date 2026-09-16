/**
 * @fileoverview Process execution utilities for AI Universal Coding Harness.
 * Provides strongly-typed ProcessResult, timeout handling, AbortSignal cancellation, and command resolution.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import readline from 'node:readline';
import { ProcessExecutionError } from '../errors.js';

/**
 * Normalized outcome of a child process execution.
 */
export interface ProcessResult {
  /** Subprocess exit code, or null if terminated by a signal or timed out. */
  readonly exitCode: number | null;
  /** Termination signal if killed by signal, or null if exited normally. */
  readonly signal: NodeJS.Signals | null;
  /** Complete captured standard output stream as UTF-8 string. */
  readonly stdout: string;
  /** Complete captured standard error stream as UTF-8 string. */
  readonly stderr: string;
  /** True if execution was terminated because the configured timeout duration elapsed. */
  readonly timedOut: boolean;
  /** Backwards compatibility alias returning `exitCode ?? 1`. */
  readonly code: number;
}

/** Builds a normalized {@link ProcessResult} with a legacy `code` getter alias. */
export function createProcessResult(
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  stdout: string,
  stderr: string,
  timedOut = false
): ProcessResult {
  return {
    exitCode,
    signal,
    stdout,
    stderr,
    timedOut,
    get code(): number {
      return exitCode ?? 1;
    }
  };
}

/**
 * Options configuring synchronous process execution via {@link execSyncText}.
 */
export interface SyncProcessOptions {
  /** Working directory for the spawned process. */
  cwd?: string;
  /** Environment variable map override. */
  env?: NodeJS.ProcessEnv;
  /** Standard input data piped to the process. */
  input?: string | Buffer;
  /** Maximum execution time in milliseconds before sending SIGTERM. */
  timeout?: number;
}

/**
 * Options configuring asynchronous process execution via {@link runProcess}.
 */
export interface ProcessOptions {
  /** Working directory for the spawned process. */
  cwd?: string;
  /** Environment variable map override. */
  env?: NodeJS.ProcessEnv;
  /** Standard input text fed into the process. */
  stdinText?: string;
  /** Maximum execution time in milliseconds before sending SIGTERM. */
  timeoutMs?: number;
  /** Abort signal for graceful or immediate process cancellation. */
  signal?: AbortSignal;
  /** Streaming line callback invoked on stdout lines. */
  onStdoutLine?: (line: string) => void;
  /** Streaming line callback invoked on stderr lines. */
  onStderrLine?: (line: string) => void;
}

/** Synchronously spawns a subprocess and captures stdout/stderr as UTF-8 text. */
export function execSyncText(
  cmd: string,
  args: string[] = [],
  opts: SyncProcessOptions = {}
): ProcessResult {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    windowsHide: true,
    cwd: opts.cwd,
    env: opts.env,
    input: opts.input,
    timeout: opts.timeout
  });

  const timedOut = Boolean(r.error && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT');
  return createProcessResult(
    r.status,
    r.signal,
    String(r.stdout || ''),
    String(r.stderr || ''),
    timedOut
  );
}

/**
 * Spawns a subprocess with optional stdin, line callbacks, timeout, and {@link AbortSignal} cancellation.
 * Rejects with {@link ProcessExecutionError} on timeout or abort.
 */
export async function runProcess(
  cmd: string,
  args: string[],
  opts: ProcessOptions = {}
): Promise<ProcessResult> {
  if (opts.signal?.aborted) {
    throw new ProcessExecutionError(`Command aborted before start: ${cmd} ${args.join(' ')}`, {
      signal: 'SIGTERM',
      cause: opts.signal.reason
    });
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | null = null;
    let settled = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (abortHandler && opts.signal) {
        opts.signal.removeEventListener('abort', abortHandler);
      }
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    let abortHandler: (() => void) | null = null;
    if (opts.signal) {
      abortHandler = () => {
        try {
          child.kill('SIGTERM');
        } catch {}
        finish(() =>
          reject(
            new ProcessExecutionError(`Command aborted by signal: ${cmd} ${args.join(' ')}`, {
              signal: 'SIGTERM',
              stdout,
              stderr,
              cause: opts.signal?.reason
            })
          )
        );
      };
      opts.signal.addEventListener('abort', abortHandler, { once: true });
    }

    if (opts.stdinText && child.stdin) {
      child.stdin.write(opts.stdinText);
      child.stdin.end();
    }

    let rlOut: readline.Interface | null = null;
    if (child.stdout) {
      rlOut = readline.createInterface({ input: child.stdout });
      rlOut.on('line', (line: string) => {
        stdout += line + '\n';
        opts.onStdoutLine?.(line);
      });
    }

    let rlErr: readline.Interface | null = null;
    if (child.stderr) {
      rlErr = readline.createInterface({ input: child.stderr });
      rlErr.on('line', (line: string) => {
        stderr += line + '\n';
        opts.onStderrLine?.(line);
      });
    }

    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {}
        finish(() =>
          reject(
            new ProcessExecutionError(
              `Command timed out after ${opts.timeoutMs}ms: ${cmd} ${args.join(' ')}`,
              { timedOut: true, stdout, stderr }
            )
          )
        );
      }, opts.timeoutMs);
    }

    child.on('error', (e: Error) =>
      finish(() =>
        reject(
          new ProcessExecutionError(e.message, {
            stdout,
            stderr,
            cause: e
          })
        )
      )
    );

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) =>
      finish(() => {
        rlOut?.close();
        rlErr?.close();
        resolve(createProcessResult(code, signal, stdout, stderr, false));
      })
    );
  });
}

/** Runs a shell string via `spawn(..., { shell: true })` with the same lifecycle semantics as {@link runProcess}. */
export async function runShellCommand(
  command: string,
  opts: ProcessOptions = {}
): Promise<ProcessResult> {
  if (opts.signal?.aborted) {
    throw new ProcessExecutionError(`Command aborted before start: ${command}`, {
      signal: 'SIGTERM',
      cause: opts.signal.reason
    });
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      cwd: opts.cwd,
      env: opts.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | null = null;
    let settled = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (abortHandler && opts.signal) {
        opts.signal.removeEventListener('abort', abortHandler);
      }
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    let abortHandler: (() => void) | null = null;
    if (opts.signal) {
      abortHandler = () => {
        try {
          child.kill('SIGTERM');
        } catch {}
        finish(() =>
          reject(
            new ProcessExecutionError(`Command aborted by signal: ${command}`, {
              signal: 'SIGTERM',
              stdout,
              stderr,
              cause: opts.signal?.reason
            })
          )
        );
      };
      opts.signal.addEventListener('abort', abortHandler, { once: true });
    }

    let rlOut: readline.Interface | null = null;
    if (child.stdout) {
      rlOut = readline.createInterface({ input: child.stdout });
      rlOut.on('line', (line: string) => {
        stdout += line + '\n';
        opts.onStdoutLine?.(line);
      });
    }

    let rlErr: readline.Interface | null = null;
    if (child.stderr) {
      rlErr = readline.createInterface({ input: child.stderr });
      rlErr.on('line', (line: string) => {
        stderr += line + '\n';
        opts.onStderrLine?.(line);
      });
    }

    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {}
        finish(() =>
          reject(
            new ProcessExecutionError(`Command timed out after ${opts.timeoutMs}ms: ${command}`, {
              timedOut: true,
              stdout,
              stderr
            })
          )
        );
      }, opts.timeoutMs);
    }

    child.on('error', (e: Error) =>
      finish(() =>
        reject(
          new ProcessExecutionError(e.message, {
            stdout,
            stderr,
            cause: e
          })
        )
      )
    );

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) =>
      finish(() => {
        rlOut?.close();
        rlErr?.close();
        resolve(createProcessResult(code, signal, stdout, stderr, false));
      })
    );
  });
}

/** Returns whether an executable exists on `PATH` (or at an absolute path). */
export function commandExists(name: string): boolean {
  if (!name) return false;
  if (path.isAbsolute(name) || name.includes('/') || name.includes('\\')) {
    try {
      fs.accessSync(name, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const exts =
    process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const p = path.join(
        dir,
        process.platform === 'win32' && path.extname(name) ? name : name + ext
      );
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return true;
      } catch {}
    }
  }
  return false;
}
