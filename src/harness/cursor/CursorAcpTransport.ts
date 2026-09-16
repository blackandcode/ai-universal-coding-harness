/**
 * @fileoverview Subprocess transport and JSON-RPC message framing for Cursor ACP.
 *
 * Encapsulates child process lifecycle, standard I/O stream framing, pending request
 * tracking, raw event journaling, and stderr logging.
 *
 * @remarks
 * Architectural Invariants:
 * - Transport owns process execution, stdio readline framing, and RPC request correlation.
 * - Transport remains agnostic of higher-level session semantics (plans, questions, permissions).
 * - Messages from stdout are logged to `eventsFile` as `SERVER <json>` before dispatching.
 * - Messages sent to stdin are logged to `eventsFile` as `CLIENT <json>`.
 */

import fs from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';
import { CONFIG } from '../../core/config.js';
import { normalizeSpawnArgs } from '../../core/process.js';
import { appendBounded } from '../../core/fs.js';
import { errorMessage } from '../../errors.js';
import { AcpEventDecoder } from './AcpEventDecoder.js';
import {
  isRecord,
  type DecodedAcpMessage,
  type HarnessEventEmitter,
  type JsonRpcId,
  type PendingJsonRpcRequest
} from './types.js';

/**
 * Configuration options required to instantiate {@link CursorAcpTransport}.
 */
export interface CursorAcpTransportOptions {
  /** Path to the Cursor executable binary. */
  binary: string;
  /** Subprocess command-line arguments. */
  args: string[];
  /** Working directory for the ACP subprocess. */
  workspace: string;
  /** File path where raw CLIENT/SERVER event lines are journaled. */
  eventsFile: string;
  /** File path where diagnostic stderr messages are logged. */
  runLog: string;
  /** Default timeout in minutes for prompt and RPC turns. */
  turnTimeoutMinutes: number;
  /** Optional event emitter for UI diagnostics. */
  events?: HarnessEventEmitter | null;
  /** Callback invoked when a non-response server message or request arrives. */
  onMessage?: (message: unknown, decoded: DecodedAcpMessage) => Promise<void> | void;
  /** Optional callback invoked on incoming stderr lines. */
  onStderrLine?: (line: string) => void;
  /** Optional callback invoked when the child process exits. */
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  /** Optional timeout in milliseconds before escalating SIGTERM to SIGKILL during stop. Defaults to 3000ms. */
  killTimeoutMs?: number;
}

/**
 * Manages the low-level stdio transport and JSON-RPC 2.0 lifecycle for Cursor ACP.
 */
export class CursorAcpTransport {
  private child: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private er: readline.Interface | null = null;
  private nextId = 1;
  private pending = new Map<JsonRpcId, PendingJsonRpcRequest<unknown>>();

  /**
   * Initializes transport with process parameters and logging paths.
   *
   * @param options - Transport configuration options.
   */
  constructor(private readonly options: CursorAcpTransportOptions) {}

  /**
   * Emits a diagnostic log event to the configured event emitter.
   *
   * @param level - Log severity level.
   * @param message - Diagnostic message string.
   */
  private emitLog(level: 'info' | 'warn' | 'error', message: string): void {
    this.options.events?.emit('log', { level, message });
  }

  /**
   * Spawns the Cursor ACP subprocess and initializes stdio line readers.
   *
   * @throws Error
   * Thrown if spawning the subprocess fails.
   */
  async start(): Promise<void> {
    const spawnTarget = normalizeSpawnArgs(this.options.binary, this.options.args);
    this.child = spawn(spawnTarget.cmd, spawnTarget.args, {
      cwd: this.options.workspace,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    this.child.stdin.on('error', (e: unknown) => {
      const err = isRecord(e) ? e : {};
      if (err.code !== 'EPIPE') {
        this.emitLog('warn', `Executor stdin: ${errorMessage(e)}`);
      }
    });

    this.rl = readline.createInterface({ input: this.child.stdout });
    this.rl.on('line', (line: string) => {
      void this.handleLine(line);
    });

    this.er = readline.createInterface({ input: this.child.stderr });
    this.er.on('line', (line: string) => {
      appendBounded(this.options.runLog, `[executor-stderr] ${line}`, CONFIG.runLogMaxBytes);
      this.emitLog('warn', `Executor: ${line}`);
      this.options.onStderrLine?.(line);
    });

    this.child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      const exitError = new Error(`Cursor ACP exited ${code ?? signal ?? 'unknown'}`);
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(exitError);
      }
      this.pending.clear();
      this.options.onExit?.(code, signal);
    });
  }

  /**
   * Serializes a JSON-RPC message, writes it to standard input, and journals to `eventsFile`.
   *
   * @param obj - Payload object to send.
   */
  raw(obj: unknown): void {
    const line = JSON.stringify(obj);
    this.child?.stdin?.write(line + '\n');
    fs.appendFileSync(this.options.eventsFile, `CLIENT ${line}\n`);
  }

  /**
   * Sends a JSON-RPC 2.0 response for a server-initiated request.
   *
   * @param id - Identifier of the request being answered.
   * @param result - Result object returned to the server.
   */
  respond(id: JsonRpcId, result: unknown): void {
    this.raw({ jsonrpc: '2.0', id, result });
  }

  /**
   * Sends a JSON-RPC 2.0 error response for a server-initiated request.
   *
   * @param id - Identifier of the request being answered.
   * @param error - Structured error details.
   */
  respondError(id: JsonRpcId, error: { code?: number; message?: string; data?: unknown }): void {
    this.raw({ jsonrpc: '2.0', id, error });
  }

  /**
   * Issues a JSON-RPC request and resolves when a matching response arrives or times out.
   *
   * @typeParam T - Expected response payload type.
   * @param method - JSON-RPC method name.
   * @param params - Request parameter object.
   * @param timeoutMs - Optional timeout in milliseconds.
   * @returns Promise resolving to the server result.
   */
  request<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = this.options.turnTimeoutMinutes * 60_000
  ): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (method === 'session/prompt') {
          void this.cancel().catch(() => {});
        }
        reject(new Error(`Cursor ACP request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (val: unknown) => void,
        reject,
        timer,
        method
      });

      this.raw({ jsonrpc: '2.0', id, method, params });
    });
  }

  /**
   * Requests cancellation of the active prompt turn without tearing down the subprocess.
   *
   * @param sessionId - Optional session ID to include in the cancellation notification.
   */
  async cancel(sessionId?: string): Promise<void> {
    if (this.child && !this.child.killed) {
      try {
        const params = sessionId ? { sessionId } : {};
        this.raw({ jsonrpc: '2.0', method: 'session/cancel', params });
      } catch {}
    }
  }

  /**
   * Terminates the ACP child process, closes streams, and clears pending requests.
   */
  async stop(): Promise<void> {
    try {
      await this.cancel();
    } catch {}

    try {
      this.rl?.close();
    } catch {}
    try {
      this.er?.close();
    } catch {}

    try {
      this.child?.stdin?.destroy();
    } catch {}
    try {
      this.child?.stdout?.destroy();
    } catch {}
    try {
      this.child?.stderr?.destroy();
    } catch {}

    const child = this.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };

        const killTimeout = this.options.killTimeoutMs ?? 3000;
        const timer = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {}
          finish();
        }, killTimeout);

        child.once('exit', () => {
          clearTimeout(timer);
          finish();
        });

        child.once('close', () => {
          clearTimeout(timer);
          finish();
        });

        try {
          child.kill('SIGTERM');
        } catch {
          clearTimeout(timer);
          finish();
        }
      });
    }

    this.pending.clear();
  }

  /**
   * Dispatches an incoming stdout line from the ACP subprocess.
   *
   * @param line - Raw line string received from stdout.
   */
  async handleLine(line: string): Promise<void> {
    fs.appendFileSync(this.options.eventsFile, `SERVER ${line}\n`);

    const decoded = AcpEventDecoder.decode(line);

    // Resolve matching pending request if this is a response
    if (decoded.kind === 'response') {
      let p = this.pending.get(decoded.id);
      if (!p && typeof decoded.id === 'string' && !Number.isNaN(Number(decoded.id))) {
        p = this.pending.get(Number(decoded.id));
      } else if (!p && typeof decoded.id === 'number') {
        p = this.pending.get(String(decoded.id));
      }

      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(decoded.id);
        if (typeof decoded.id === 'string') {
          this.pending.delete(Number(decoded.id));
        } else {
          this.pending.delete(String(decoded.id));
        }

        if (decoded.error) {
          const msg =
            typeof decoded.error.message === 'string' && decoded.error.message.length > 0
              ? decoded.error.message
              : JSON.stringify(decoded.error);
          p.reject(new Error(msg));
        } else {
          p.resolve(decoded.result);
        }
        return;
      }
    }

    // Forward non-pending response messages or notifications to consumer
    if (this.options.onMessage) {
      const rawPayload = isRecord(decoded.raw) ? decoded.raw : line;
      await this.options.onMessage(rawPayload, decoded);
    }
  }

  /**
   * Returns whether the child process is currently alive and active.
   */
  get isAlive(): boolean {
    return Boolean(
      this.child &&
      this.child.exitCode === null &&
      this.child.signalCode === null &&
      !this.child.killed
    );
  }

  /**
   * Returns the underlying child process handle if active.
   */
  get childProcess(): ChildProcessWithoutNullStreams | null {
    return this.child;
  }

  /**
   * Allows setting or clearing the child process handle (useful for tests).
   */
  set childProcess(val: ChildProcessWithoutNullStreams | null) {
    this.child = val;
  }
}
