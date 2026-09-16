/**
 * @fileoverview Cursor ACP executor harness implementation and session management.
 *
 * Implements ExecutorHarness and ExecutorSession for Cursor CLI, orchestrating the ACP subprocess,
 * managing session configuration and lifetime, streaming updates, and delegating protocol accumulation
 * to AcpToolAccumulator and durable observation tracking to ObservationJournal.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import type {
  ExecutorHarness,
  ExecutorSession,
  ExecutorSessionCallbacks,
  HarnessInfo,
  HarnessPreflightResult
} from '../types.js';
import type { CommandObservation, HarnessContext } from '../../types.js';
import { CONFIG, harnessNumber, harnessString } from '../../core/config.js';
import {
  execSyncText,
  commandExists,
  runShellCommand,
  normalizeSpawnArgs
} from '../../core/process.js';
import { appendBounded, ensureDir, rotateFile } from '../../core/fs.js';
import { iso } from '../../core/time.js';
import type { PermissionRequest } from '../../permissions/PermissionEngine.js';
import { VERSION } from '../../version.js';
import { AcpToolAccumulator } from './AcpToolAccumulator.js';
import { ObservationJournal } from './ObservationJournal.js';
import { AcpEventNormalizer } from './AcpEventNormalizer.js';
import {
  errorMessage,
  isRecord,
  type AcpConfigOptionGroup,
  type AcpConfigOptionItem,
  type AcpNewSessionResult,
  type AcpQuestionParams,
  type HarnessEventEmitter,
  type JsonRpcId,
  type JsonRpcRequest,
  type PendingJsonRpcRequest
} from './types.js';

/**
 * Options supplied to initialize an interactive {@link CursorAcpSession}.
 */
export interface CursorAcpSessionOptions {
  /** Target repository workspace path. */
  workspace: string;
  /** Path to output run log. */
  runLog: string;
  /** Path to output ACP events JSONL file. */
  eventsFile: string;
  /** Path to focus log file. */
  focusFile: string;
  /** Session identifier to resume if supported. */
  resumeSessionId?: string;
  /** Orchestrator callbacks for plans, questions, permissions. */
  callbacks: ExecutorSessionCallbacks;
  /** Executable binary to spawn. */
  binary: string;
  /** Model identifier. */
  model: string;
  /** Thinking mode string. */
  thinking: string;
  /** Turn timeout in minutes. */
  turnTimeoutMinutes: number;
  /** Optional event emitter for UI logs and status. */
  events?: HarnessEventEmitter | null;
  /** Canonical name of the active stage. */
  stageName?: string;
  /** Active attempt counter. */
  attempt?: number;
  /** Active run identifier. */
  runId?: string;
  /** Optional path to observations file overriding default location. */
  observationsFile?: string;
}

/**
 * Cursor CLI adapter implementing {@link ExecutorHarness} and spawning {@link CursorAcpSession} instances.
 *
 * @remarks
 * Invariants:
 * - Executes Cursor CLI subprocesses via the Agent Client Protocol (ACP) over standard input/output.
 * - The executor harness drives agent turns and quality check executions in the target workspace.
 * - The harness must NEVER manage Git branch lifecycle, push to remotes, or perform merges.
 */
export class CursorExecutorHarness implements ExecutorHarness {
  static defaults = {
    binary: 'agent',
    model: 'gemini-3.8-flash',
    thinking: 'high',
    turnTimeoutMinutes: 45
  };
  private binary = harnessString('cursor', 'binary', CursorExecutorHarness.defaults.binary);
  private model = harnessString('cursor', 'model', CursorExecutorHarness.defaults.model);
  private thinking = harnessString('cursor', 'thinking', CursorExecutorHarness.defaults.thinking);
  private turnTimeoutMinutes = harnessNumber(
    'cursor',
    'turnTimeoutMinutes',
    CursorExecutorHarness.defaults.turnTimeoutMinutes
  );
  info: HarnessInfo = {
    id: 'cursor',
    label: `${this.model} ${this.thinking}`,
    role: 'executor',
    model: this.model
  };

  /**
   * @param ctx - Harness context containing semantic event bus and optional model/binary overrides.
   */
  constructor(private ctx: HarnessContext = {}) {
    this.binary = ctx?.executorBinary || this.binary;
    this.model = ctx?.executorModel || this.model;
    this.info = { ...this.info, model: this.model, label: `${this.model} ${this.thinking}` };
  }

  /**
   * Verifies that the Cursor agent binary is installed, runnable, and supports the configured model.
   *
   * @returns Preflight result indicating binary and model availability.
   */
  async preflight(): Promise<HarnessPreflightResult> {
    if (!commandExists(this.binary)) return { ok: false, details: [`${this.binary} not found`] };
    const models = execSyncText(this.binary, ['models']);
    const details = [models.stdout.trim()];
    if (models.code !== 0 || !models.stdout.toLowerCase().includes(this.model.toLowerCase()))
      return { ok: false, details: [...details, `Model ${this.model} not available`] };
    return { ok: true, details };
  }

  /**
   * Creates, starts, and returns a live ACP session bound to the target workspace.
   *
   * @param opts - Session options including workspace path, log targets, and event callbacks.
   * @returns Initialized and connected {@link CursorAcpSession}.
   */
  async createSession(opts: {
    workspace: string;
    runLog: string;
    eventsFile: string;
    focusFile: string;
    resumeSessionId?: string;
    callbacks: ExecutorSessionCallbacks;
    stageName?: string;
    attempt?: number;
    runId?: string;
    observationsFile?: string;
  }): Promise<CursorAcpSession> {
    const s = new CursorAcpSession({
      ...opts,
      binary: this.binary,
      model: this.model,
      thinking: this.thinking,
      turnTimeoutMinutes: this.turnTimeoutMinutes,
      events: this.ctx.events as HarnessEventEmitter | undefined
    });
    await s.start();
    return s;
  }
}

/**
 * Long-lived Cursor ACP subprocess session: JSON-RPC over stdio, tool accumulation, and orchestrator callbacks.
 *
 * @remarks
 * Manages the bidirectional JSON-RPC 2.0 connection to the Cursor `agent` process.
 * Routes streaming progress, tool execution tracking, and interactive callback requests.
 */
export class CursorAcpSession implements ExecutorSession {
  id = '';
  private child: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private er: readline.Interface | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingJsonRpcRequest<unknown>>();
  private agentText = '';
  private capabilities: Record<string, unknown> = {};
  private externalResults: Array<{ command: string; code: number; output: string }> = [];
  private qualityEpochId = '';
  private accumulator: AcpToolAccumulator;
  private journal: ObservationJournal;
  private normalizer: AcpEventNormalizer;

  /** Wires ACP normalizer, observation journal, and optional session resume metadata. */
  constructor(private o: CursorAcpSessionOptions) {
    ensureDir(path.dirname(o.eventsFile));
    ensureDir(path.dirname(o.focusFile));
    const journalFile =
      o.observationsFile || path.join(path.dirname(o.eventsFile), 'executor-observations.jsonl');
    this.accumulator = new AcpToolAccumulator();
    this.journal = new ObservationJournal(journalFile);
    this.normalizer = new AcpEventNormalizer({
      events: o.events,
      accumulator: this.accumulator,
      journal: this.journal,
      defaultSessionId: o.resumeSessionId || 'default',
      runId: o.runId,
      stageName: o.stageName,
      attempt: o.attempt,
      workspace: o.workspace,
      qualityEpochId: this.qualityEpochId,
      onFocusDelta: (text) => this.appendFocus(text),
      onAgentText: (text) => {
        this.agentText += text;
      },
      onPlanRequest: (m) => this.handlePlan(m),
      onQuestionRequest: (m) => this.handleQuestion(m),
      onPermissionRequest: (m) => this.handlePermission(m)
    });
    if (!fs.existsSync(o.focusFile)) fs.writeFileSync(o.focusFile, '');
  }

  /** Monotonic ACP event sequence from the tool accumulator (for corroboration). */
  currentSequence(): number {
    return this.accumulator.currentSequence();
  }

  /** Last workspace mutation sequence observed in the session (evidence epoch boundary). */
  lastMutationSeq(): number {
    return this.accumulator.lastMutationSeq();
  }

  /** Tags subsequent command observations with a quality epoch id for evidence corroboration. */
  setQualityEpoch(epochId: string): void {
    this.qualityEpochId = epochId;
    this.normalizer = new AcpEventNormalizer({
      events: this.o.events,
      accumulator: this.accumulator,
      journal: this.journal,
      defaultSessionId: this.id || 'default',
      runId: this.o.runId,
      stageName: this.o.stageName,
      attempt: this.o.attempt,
      workspace: this.o.workspace,
      qualityEpochId: this.qualityEpochId,
      onFocusDelta: (text) => this.appendFocus(text),
      onAgentText: (text) => {
        this.agentText += text;
      },
      onPlanRequest: (m) => this.handlePlan(m),
      onQuestionRequest: (m) => this.handleQuestion(m),
      onPermissionRequest: (m) => this.handlePermission(m)
    });
  }

  /** Command observations recorded for the active implementation attempt. */
  observedCommands(): CommandObservation[] {
    return this.journal.getObservations();
  }

  /** Replays prior ACP JSONL into the journal when resuming an executor session. */
  private replayHistoricalEvents() {
    if (!fs.existsSync(this.o.eventsFile)) return;
    try {
      const replayed = parseAcpEvents(this.o.eventsFile, {
        runId: this.o.runId,
        stageName: this.o.stageName,
        attempt: this.o.attempt,
        workspace: this.o.workspace
      });
      for (const obs of replayed) {
        this.journal.record(obs, true);
      }
      const current = this.journal.getObservations();
      if (current.length > 0) {
        this.emit('log', {
          level: 'info',
          message: `Replayed ${current.length} executor observations from historical ACP log.`
        });
      }
    } catch (e: unknown) {
      appendBounded(
        this.o.runLog,
        `[executor replay failed] ${errorMessage(e)}`,
        CONFIG.runLogMaxBytes
      );
    }
  }

  /** Emits a semantic UI event when an event emitter is configured. */
  private emit(type: string, payload?: Record<string, unknown>) {
    this.o.events?.emit(type, payload);
  }

  /** Writes a JSON-RPC line to the ACP subprocess and mirrors it in the events log. */
  private raw(obj: unknown) {
    const line = JSON.stringify(obj);
    this.child?.stdin?.write(line + '\n');
    fs.appendFileSync(this.o.eventsFile, `CLIENT ${line}\n`);
  }
  /** Sends a JSON-RPC response for a server-initiated request id. */
  private respond(id: JsonRpcId, result: unknown) {
    this.raw({ jsonrpc: '2.0', id, result });
  }
  /** Issues a JSON-RPC request and resolves when the matching response arrives or times out. */
  private request<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = this.o.turnTimeoutMinutes * 60_000
  ): Promise<T> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (method === 'session/prompt') this.cancel().catch(() => {});
        reject(new Error(`Cursor ACP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (val: unknown) => void, reject, timer, method });
      this.raw({ jsonrpc: '2.0', id, method, params });
    });
  }

  /** Spawns the Cursor ACP subprocess, negotiates protocol, and creates or resumes a session. */
  async start() {
    const spawnTarget = normalizeSpawnArgs(this.o.binary, ['--model', this.o.model, 'acp']);
    this.child = spawn(spawnTarget.cmd, spawnTarget.args, {
      cwd: this.o.workspace,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });
    this.child.stdin?.on?.('error', (e: unknown) => {
      const err = isRecord(e) ? e : {};
      if (err.code !== 'EPIPE')
        this.emit('log', {
          level: 'warn',
          message: `Executor stdin: ${errorMessage(e)}`
        });
    });
    this.rl = readline.createInterface({ input: this.child.stdout! });
    this.rl.on('line', (l: string) => this.handleLine(l));
    this.er = readline.createInterface({ input: this.child.stderr! });
    this.er.on('line', (l: string) => {
      appendBounded(this.o.runLog, `[executor-stderr] ${l}`, CONFIG.runLogMaxBytes);
      this.emit('log', { level: 'warn', message: `Executor: ${l}` });
    });
    this.child.on('exit', (code: number) => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`Cursor ACP exited ${code}`));
      }
      this.pending.clear();
    });
    const init = await this.request<Record<string, unknown>>(
      'initialize',
      {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: 'ai-universal-coding-harness', version: VERSION }
      },
      60_000
    );
    this.capabilities = (init?.agentCapabilities || init?.agent_capabilities || {}) as Record<
      string,
      unknown
    >;
    try {
      await this.request('authenticate', { methodId: 'cursor_login' }, 60_000);
    } catch {}
    let ns: AcpNewSessionResult | null = null;
    if (
      this.o.resumeSessionId &&
      (this.capabilities.loadSession === true || this.capabilities.load_session === true)
    ) {
      try {
        ns = await this.request<AcpNewSessionResult>(
          'session/load',
          { sessionId: this.o.resumeSessionId, cwd: this.o.workspace, mcpServers: [] },
          60_000
        );
        this.id = this.o.resumeSessionId;
        this.emit('log', {
          level: 'info',
          message: `Resumed executor session ${this.id}.`
        });
      } catch (e: unknown) {
        appendBounded(
          this.o.runLog,
          `[executor session/load failed] ${errorMessage(e)}`,
          CONFIG.runLogMaxBytes
        );
      }
    }
    if (!this.id) {
      ns = await this.request<AcpNewSessionResult>(
        'session/new',
        { cwd: this.o.workspace, mcpServers: [] },
        60_000
      );
      this.id = ns?.sessionId || '';
    }
    this.normalizer = new AcpEventNormalizer({
      events: this.o.events,
      accumulator: this.accumulator,
      journal: this.journal,
      defaultSessionId: this.id || 'default',
      runId: this.o.runId,
      stageName: this.o.stageName,
      attempt: this.o.attempt,
      workspace: this.o.workspace,
      qualityEpochId: this.qualityEpochId,
      onFocusDelta: (text) => this.appendFocus(text),
      onAgentText: (text) => {
        this.agentText += text;
      },
      onPlanRequest: (m) => this.handlePlan(m),
      onQuestionRequest: (m) => this.handleQuestion(m),
      onPermissionRequest: (m) => this.handlePermission(m)
    });
    this.o.callbacks.onSessionId?.(this.id);
    const cfg = ns?.configOptions || ns?.config_options || [];
    const thinking = cfg.find((x: AcpConfigOptionGroup) => x.id === 'thinking');
    if (
      thinking &&
      (thinking.options || []).some(
        (x: AcpConfigOptionItem) => (x.value || x.id) === this.o.thinking
      )
    ) {
      try {
        await this.request(
          'session/set_config_option',
          { sessionId: this.id, configId: 'thinking', value: this.o.thinking },
          60_000
        );
        this.emit('log', {
          level: 'info',
          message: `Executor thinking set to ${this.o.thinking}.`
        });
      } catch {}
    }
    this.replayHistoricalEvents();
  }

  /** Switches Cursor session mode (`plan`, `agent`, or `ask`) when supported by the agent. */
  async setMode(mode: 'plan' | 'agent' | 'ask') {
    try {
      await this.request('session/set_mode', { sessionId: this.id, modeId: mode }, 60_000);
    } catch (e: unknown) {
      this.emit('log', {
        level: 'warn',
        message: `Unable to set executor mode ${mode}: ${errorMessage(e)}`
      });
    }
    this.emit('executor.mode', { mode });
  }

  /**
   * Sends a user prompt turn and drains any broker-injected external command results (up to five rounds).
   */
  async prompt(text: string) {
    this.agentText = '';
    let r = await this.request('session/prompt', {
      sessionId: this.id,
      prompt: [{ type: 'text', text }]
    });
    let combined = this.agentText;
    let n = 0;
    while (this.externalResults.length && n < 5) {
      n++;
      const rs = this.externalResults.splice(0);
      this.agentText = '';
      const note =
        'The autonomous permission broker executed approved command(s) because ACP exposed no direct allow option. Use these exact results and continue without asking a human:\n\n' +
        rs.map((x) => `COMMAND: ${x.command}\nEXIT: ${x.code}\nOUTPUT:\n${x.output}`).join('\n\n');
      r = await this.request('session/prompt', {
        sessionId: this.id,
        prompt: [{ type: 'text', text: note }]
      });
      combined += '\n' + this.agentText;
    }
    return { result: r, text: combined };
  }

  /** Requests cancellation of the in-flight ACP prompt without tearing down the subprocess. */
  async cancel() {
    if (this.child && this.id)
      try {
        this.raw({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: this.id } });
      } catch {}
  }

  /** Cancels, closes streams, and terminates the ACP child process. */
  async stop() {
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
        const finish = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        const timer = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {}
          finish();
        }, 3000);

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

  /** Parses one ACP stdout line, completes pending RPCs, and delegates events to the normalizer. */
  private async handleLine(line: string) {
    this.accumulator.stepSequence();
    fs.appendFileSync(this.o.eventsFile, `SERVER ${line}\n`);
    let m: unknown;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(m)) return;

    if (m.id != null && (Object.hasOwn(m, 'result') || Object.hasOwn(m, 'error'))) {
      const id = typeof m.id === 'number' ? m.id : Number(m.id);
      const p = this.pending.get(id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(id);
      if (m.error) {
        p.reject(new Error(JSON.stringify(m.error)));
      } else {
        p.resolve(m.result);
      }
      return;
    }

    await this.normalizer.handleMessage(m);

    if (m.id != null) {
      this.respond(m.id as JsonRpcId, { outcome: { outcome: 'cancelled' } });
    }
  }

  /** Appends streamed focus text to the focus log and emits a debounced UI delta event. */
  private appendFocus(text: string) {
    if (!text) return;
    rotateFile(this.o.focusFile, CONFIG.focusLogMaxBytes);
    fs.appendFileSync(this.o.focusFile, text);
    this.emit('executor.focus.delta', { text, focus_file: this.o.focusFile });
  }

  /** Bridges ACP plan submissions to orchestrator {@link PlanCoordinator} via callbacks. */
  private async handlePlan(m: JsonRpcRequest) {
    const p = (m.params || {}) as {
      plan?: string;
      name?: string;
      overview?: string;
      [key: string]: unknown;
    };
    const plan = String(p.plan || '').trim();
    this.emit('executor.plan.request', {
      name: p.name || '',
      overview: p.overview || ''
    });
    if (!plan) {
      this.respond(m.id, {
        outcome: { outcome: 'rejected', reason: 'Plan is empty. Submit a complete plan.' }
      });
      return;
    }
    try {
      const d = await this.o.callbacks.onPlan(plan, p);
      if (d.accepted) {
        this.respond(m.id, { outcome: { outcome: 'accepted' } });
        this.emit('reviewer.plan', {
          verdict: d.status || 'APPROVE',
          summary: d.verdict?.summary || 'Plan accepted.',
          feedback: d.carryover || ''
        });
      } else {
        this.respond(m.id, {
          outcome: {
            outcome: 'rejected',
            reason: `Revise the entire current plan and incorporate ALL consolidated feedback below in one revision:\n\n${d.feedback || ''}`
          }
        });
        this.emit('reviewer.plan', {
          verdict: 'REPLAN',
          summary: d.verdict?.summary || '',
          feedback: d.feedback || ''
        });
      }
    } catch (e: unknown) {
      this.respond(m.id, {
        outcome: {
          outcome: 'rejected',
          reason: `Reviewer unavailable or plan review failed. Keep the current complete plan and resubmit once. Error: ${errorMessage(e)}`
        }
      });
    }
  }

  /** Forwards executor multiple-choice questions to the reviewer decision callback. */
  private async handleQuestion(m: JsonRpcRequest) {
    const p = (m.params || {}) as AcpQuestionParams;
    const questions = p.questions || [];
    this.emit('executor.question', {
      title: p.title || '',
      prompt: questions.map((q) => q.prompt || '').join(' | '),
      questions
    });
    try {
      const a = await this.o.callbacks.onQuestion({
        title: p.title || '',
        questions: questions.map((q) => ({
          id: String(q.id || ''),
          prompt: String(q.prompt || ''),
          options: (q.options || []).map((opt) => ({
            id: String(opt.id || ''),
            label: opt.label ? String(opt.label) : undefined
          }))
        }))
      });
      this.respond(m.id, { outcome: { outcome: 'answered', answers: a.answers } });
      this.emit('reviewer.question', {
        answer: a.answers.map((x) => x.selectedOptionIds.join(',')).join(' | '),
        rationale: a.rationale
      });
    } catch (e: unknown) {
      this.respond(m.id, { outcome: { outcome: 'cancelled' } });
      this.emit('log', {
        level: 'warn',
        message: `Question could not be resolved automatically: ${errorMessage(e)}`
      });
    }
  }

  /** Maps an ACP permission tool call payload into a {@link PermissionRequest}. */
  private permissionRequest(p: Record<string, unknown>): PermissionRequest {
    const tc = (p.toolCall || p.tool_call || {}) as Record<string, unknown>;
    const raw = (tc.rawInput || tc.raw_input || p.rawInput || {}) as Record<string, unknown>;
    const command = raw.command || raw.cmd || p.command || '';
    const paths: string[] = [];
    for (const k of ['path', 'file', 'target', 'destination'])
      if (raw[k]) paths.push(String(raw[k]));
    return {
      command: String(command || ''),
      description: String(tc.title || p.description || ''),
      paths,
      raw: p
    };
  }

  /** Selects an allow/deny ACP permission option id when the agent exposes standard option kinds. */
  private pickOption(p: Record<string, unknown>, allow: boolean): string | null {
    const opts = (Array.isArray(p.options) ? p.options : []) as Array<Record<string, unknown>>;
    const words = allow
      ? ['allow_once', 'allow_always', 'allow', 'approve']
      : ['reject_once', 'deny', 'reject'];
    for (const o of opts) {
      const kind = String(o.kind || o.name || o.optionId || '').toLowerCase();
      if (words.some((w) => kind.includes(w))) return String(o.optionId || o.id || '');
    }
    return null;
  }

  /**
   * Resolves permission prompts via orchestrator policy; may broker approved shell commands
   * when ACP exposes no direct allow option.
   */
  private async handlePermission(m: JsonRpcRequest) {
    const p = (m.params || {}) as Record<string, unknown>;
    const req = this.permissionRequest(p);
    this.emit('executor.permission', {
      summary: req.command || req.description || 'permission request'
    });
    let decision: { allow: boolean; reason: string };
    try {
      decision = await this.o.callbacks.onPermission(req, p);
    } catch (e: unknown) {
      decision = {
        allow: false,
        reason: `Permission reviewer failed: ${errorMessage(e)}. Denying this operation only; continue with another approach.`
      };
    }
    this.emit('reviewer.permission', {
      verdict: decision.allow ? 'ALLOW' : 'DENY',
      summary: decision.reason
    });
    let option = this.pickOption(p, decision.allow);
    if (!option && decision.allow && req.command) {
      const denyOpt = this.pickOption(p, false);
      if (denyOpt) {
        const r = await runShellCommand(req.command, {
          cwd: this.o.workspace,
          timeoutMs: 20 * 60_000,
          onStdoutLine: (l: string) =>
            this.emit('log', { level: 'info', message: `Command: ${l}` }),
          onStderrLine: (l: string) => this.emit('log', { level: 'warn', message: `Command: ${l}` })
        });
        this.externalResults.push({
          command: req.command,
          code: r.code,
          output: (r.stdout + r.stderr).slice(-20000)
        });
        const seq = this.accumulator.stepSequence();
        if (
          /git\s+(apply|checkout|restore|clean)|rm\s+|mv\s+|cp\s+|touch\s+|sed\s+/i.test(
            req.command
          )
        ) {
          this.accumulator.markMutation(seq);
        }
        const toolCallId = `broker-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
        this.journal.record({
          observation_id: `${this.id || 'broker'}-${toolCallId}`,
          run_id: this.o.runId,
          stage: this.o.stageName,
          attempt: this.o.attempt,
          session_id: this.id || 'broker',
          tool_id: toolCallId,
          tool_call_id: toolCallId,
          sequence: this.accumulator.currentSequence(),
          timestamp: iso(),
          source: 'broker',
          command: req.command,
          normalized_command: req.command.trim().replace(/\s+/g, ' '),
          command_confidence: 'high',
          status: r.code === 0 ? 'completed' : 'failed',
          exit_code: r.code,
          cwd: this.o.workspace,
          quality_epoch_id: this.qualityEpochId || undefined
        });
        this.respond(m.id, { outcome: { outcome: 'selected', optionId: denyOpt } });
        return;
      }
    }
    if (option) this.respond(m.id, { outcome: { outcome: 'selected', optionId: option } });
    else this.respond(m.id, { outcome: { outcome: 'cancelled' } });
  }
}

/**
 * Replays `SERVER` JSON-RPC lines from an ACP JSONL log into {@link CommandObservation} records.
 *
 * @remarks
 * Used during session resumption and post-mortem recovery to rebuild the observation journal
 * from historical event streams without duplicating entries on disk.
 *
 * @param eventsFilePath - Absolute path to the `events.jsonl` log file.
 * @param opts - Contextual run, stage, attempt, and workspace metadata to attach to recovered observations.
 * @returns Array of authoritative {@link CommandObservation} records extracted from historical events.
 */
export function parseAcpEvents(
  eventsFilePath: string,
  opts?: { runId?: string; stageName?: string; attempt?: number; workspace?: string }
): CommandObservation[] {
  if (!fs.existsSync(eventsFilePath)) return [];
  const content = fs.readFileSync(eventsFilePath, 'utf8');
  const lines = content.split(/\r?\n/);

  const accumulator = new AcpToolAccumulator();
  const journal = new ObservationJournal();

  for (const line of lines) {
    if (!line.startsWith('SERVER ')) continue;
    let m: unknown;
    try {
      m = JSON.parse(line.slice(7));
    } catch {
      continue;
    }
    if (!isRecord(m)) continue;

    if (m.method === 'session/update' && isRecord(m.params)) {
      const u = m.params.update;
      if (!isRecord(u)) continue;

      const isToolUpdate =
        u.sessionUpdate === 'tool_call' ||
        u.sessionUpdate === 'tool_call_update' ||
        Boolean(u.toolCallId) ||
        Boolean(u.toolCall);
      if (!isToolUpdate) {
        continue;
      }

      const sid = String(m.params.sessionId || u.sessionId || 'default');
      const result = accumulator.processUpdate(
        { ...u, sessionId: sid },
        {
          defaultSessionId: sid,
          runId: opts?.runId,
          stageName: opts?.stageName,
          attempt: opts?.attempt,
          workspace: opts?.workspace,
          isReplay: true
        }
      );

      if (result.observation) {
        journal.record(result.observation, true);
      }
    }
  }

  return journal.getObservations();
}
