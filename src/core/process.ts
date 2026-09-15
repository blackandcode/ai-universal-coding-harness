/**
 * @fileoverview Process execution utilities for AI Universal Coding Harness.
 * Provides strongly-typed ProcessResult, timeout handling, AbortSignal cancellation, and command resolution.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import readline from 'node:readline';
import { ProcessExecutionError } from '../errors.js';

export interface ProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  /** Backwards compatibility alias for exitCode ?? 1 */
  readonly code: number;
}

export function createProcessResult(
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  stdout: string,
  stderr: string,
  timedOut = false,
): ProcessResult {
  return {
    exitCode,
    signal,
    stdout,
    stderr,
    timedOut,
    get code(): number {
      return exitCode ?? 1;
    },
  };
}

export interface SyncProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string | Buffer;
  timeout?: number;
}

export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdinText?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
}

export function execSyncText(
  cmd: string,
  args: string[] = [],
  opts: SyncProcessOptions = {},
): ProcessResult {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    windowsHide: true,
    cwd: opts.cwd,
    env: opts.env,
    input: opts.input,
    timeout: opts.timeout,
  });

  const timedOut = Boolean(r.error && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT');
  return createProcessResult(
    r.status,
    r.signal,
    String(r.stdout || ''),
    String(r.stderr || ''),
    timedOut,
  );
}

export async function runProcess(
  cmd: string,
  args: string[],
  opts: ProcessOptions = {},
): Promise<ProcessResult> {
  if (opts.signal?.aborted) {
    throw new ProcessExecutionError(`Command aborted before start: ${cmd} ${args.join(' ')}`, {
      signal: 'SIGTERM',
      cause: opts.signal.reason,
    });
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
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
              cause: opts.signal?.reason,
            }),
          ),
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
              { timedOut: true, stdout, stderr },
            ),
          ),
        );
      }, opts.timeoutMs);
    }

    child.on('error', (e: Error) =>
      finish(() =>
        reject(
          new ProcessExecutionError(e.message, {
            stdout,
            stderr,
            cause: e,
          }),
        ),
      ),
    );

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) =>
      finish(() => {
        rlOut?.close();
        rlErr?.close();
        resolve(createProcessResult(code, signal, stdout, stderr, false));
      }),
    );
  });
}

export async function runShellCommand(
  command: string,
  opts: ProcessOptions = {},
): Promise<ProcessResult> {
  if (opts.signal?.aborted) {
    throw new ProcessExecutionError(`Command aborted before start: ${command}`, {
      signal: 'SIGTERM',
      cause: opts.signal.reason,
    });
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      cwd: opts.cwd,
      env: opts.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
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
              cause: opts.signal?.reason,
            }),
          ),
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
              stderr,
            }),
          ),
        );
      }, opts.timeoutMs);
    }

    child.on('error', (e: Error) =>
      finish(() =>
        reject(
          new ProcessExecutionError(e.message, {
            stdout,
            stderr,
            cause: e,
          }),
        ),
      ),
    );

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) =>
      finish(() => {
        rlOut?.close();
        rlErr?.close();
        resolve(createProcessResult(code, signal, stdout, stderr, false));
      }),
    );
  });
}

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
        process.platform === 'win32' && path.extname(name) ? name : name + ext,
      );
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return true;
      } catch {}
    }
  }
  return false;
}
