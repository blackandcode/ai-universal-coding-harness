/**
 * @fileoverview Cursor ACP executor harness implementation and session management.
 *
 * Implements ExecutorHarness and ExecutorSession for Cursor CLI, orchestrating the ACP subprocess,
 * managing session configuration and lifetime, streaming updates, and delegating protocol accumulation
 * to AcpToolAccumulator and durable observation tracking to ObservationJournal.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import type {
  ExecutorHarness,
  ExecutorSession,
  ExecutorSessionCallbacks,
  HarnessInfo,
  HarnessPreflightResult,
} from '../types.js';
import type { CommandObservation } from '../../types.js';
import { CONFIG, harnessNumber, harnessString } from '../../core/config.js';
import { execSyncText, commandExists, runShellCommand } from '../../core/process.js';
import { appendBounded, ensureDir, rotateFile } from '../../core/fs.js';
import { iso } from '../../core/time.js';
import type { PermissionRequest } from '../../permissions/PermissionEngine.js';
import { VERSION } from '../../version.js';
import { AcpToolAccumulator } from './AcpToolAccumulator.js';
import { ObservationJournal } from './ObservationJournal.js';
import { AcpEventNormalizer } from './AcpEventNormalizer.js';

export class CursorExecutorHarness implements ExecutorHarness {
  static defaults = {
    binary: 'agent',
    model: 'gemini-3.8-flash',
    thinking: 'high',
    turnTimeoutMinutes: 45,
  };
  private binary = harnessString('cursor', 'binary', CursorExecutorHarness.defaults.binary);
  private model = harnessString('cursor', 'model', CursorExecutorHarness.defaults.model);
  private thinking = harnessString('cursor', 'thinking', CursorExecutorHarness.defaults.thinking);
  private turnTimeoutMinutes = harnessNumber(
    'cursor',
    'turnTimeoutMinutes',
    CursorExecutorHarness.defaults.turnTimeoutMinutes,
  );
  info: HarnessInfo = {
    id: 'cursor',
    label: `${this.model} ${this.thinking}`,
    role: 'executor',
    model: this.model,
  };
  constructor(private ctx: any) {
    this.binary = ctx?.executorBinary || this.binary;
    this.model = ctx?.executorModel || this.model;
    this.info = { ...this.info, model: this.model, label: `${this.model} ${this.thinking}` };
  }
  async preflight(): Promise<HarnessPreflightResult> {
    if (!commandExists(this.binary)) return { ok: false, details: [`${this.binary} not found`] };
    const models = execSyncText(this.binary, ['models']);
    const details = [models.stdout.trim()];
    if (models.code !== 0 || !models.stdout.toLowerCase().includes(this.model.toLowerCase()))
      return { ok: false, details: [...details, `Model ${this.model} not available`] };
    return { ok: true, details };
  }
  async createSession(opts: any) {
    const s = new CursorAcpSession({
      ...opts,
      binary: this.binary,
      model: this.model,
      thinking: this.thinking,
      turnTimeoutMinutes: this.turnTimeoutMinutes,
      events: this.ctx.events,
    });
    await s.start();
    return s;
  }
}

export class CursorAcpSession implements ExecutorSession {
  id = '';
  private child: any;
  private rl: any;
  private er: any;
  private nextId = 1;
  private pending = new Map<number, any>();
  private agentText = '';
  private capabilities: any = {};
  private externalResults: any[] = [];
  private qualityEpochId = '';
  private accumulator: AcpToolAccumulator;
  private journal: ObservationJournal;
  private normalizer: AcpEventNormalizer;

  constructor(
    private o: {
      workspace: string;
      runLog: string;
      eventsFile: string;
      focusFile: string;
      resumeSessionId?: string;
      callbacks: ExecutorSessionCallbacks;
      binary: string;
      model: string;
      thinking: string;
      turnTimeoutMinutes: number;
      events: any;
      stageName?: string;
      attempt?: number;
      runId?: string;
      observationsFile?: string;
    },
  ) {
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
      onPermissionRequest: (m) => this.handlePermission(m),
    });
    if (!fs.existsSync(o.focusFile)) fs.writeFileSync(o.focusFile, '');
  }

  currentSequence(): number {
    return this.accumulator.currentSequence();
  }
  lastMutationSeq(): number {
    return this.accumulator.lastMutationSeq();
  }
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
      onPermissionRequest: (m) => this.handlePermission(m),
    });
  }
  observedCommands(): CommandObservation[] {
    return this.journal.getObservations();
  }

  private replayHistoricalEvents() {
    if (!fs.existsSync(this.o.eventsFile)) return;
    try {
      const replayed = parseAcpEvents(this.o.eventsFile, {
        runId: this.o.runId,
        stageName: this.o.stageName,
        attempt: this.o.attempt,
        workspace: this.o.workspace,
      });
      for (const obs of replayed) {
        this.journal.record(obs, true);
      }
      const current = this.journal.getObservations();
      if (current.length > 0) {
        this.o.events?.emit?.('log', {
          level: 'info',
          message: `Replayed ${current.length} executor observations from historical ACP log.`,
        });
      }
    } catch (e: any) {
      appendBounded(this.o.runLog, `[executor replay failed] ${e.message}`, CONFIG.runLogMaxBytes);
    }
  }

  private raw(obj: any) {
    const line = JSON.stringify(obj);
    this.child?.stdin?.write(line + '\n');
    fs.appendFileSync(this.o.eventsFile, `CLIENT ${line}\n`);
  }
  private respond(id: any, result: any) {
    this.raw({ jsonrpc: '2.0', id, result });
  }
  private request(
    method: string,
    params: any,
    timeoutMs = this.o.turnTimeoutMinutes * 60_000,
  ): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (method === 'session/prompt') this.cancel().catch(() => {});
        reject(new Error(`Cursor ACP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.raw({ jsonrpc: '2.0', id, method, params });
    });
  }
  async start() {
    this.child = spawn(this.o.binary, ['--model', this.o.model, 'acp'], {
      cwd: this.o.workspace,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    this.child.stdin?.on?.('error', (e: any) => {
      if (e?.code !== 'EPIPE')
        this.o.events.emit('log', { level: 'warn', message: `Executor stdin: ${e.message}` });
    });
    this.rl = readline.createInterface({ input: this.child.stdout });
    this.rl.on('line', (l: string) => this.handleLine(l));
    this.er = readline.createInterface({ input: this.child.stderr });
    this.er.on('line', (l: string) => {
      appendBounded(this.o.runLog, `[executor-stderr] ${l}`, CONFIG.runLogMaxBytes);
      this.o.events.emit('log', { level: 'warn', message: `Executor: ${l}` });
    });
    this.child.on('exit', (code: number) => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`Cursor ACP exited ${code}`));
      }
      this.pending.clear();
    });
    const init = await this.request(
      'initialize',
      {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: 'ai-universal-coding-harness', version: VERSION },
      },
      60_000,
    );
    this.capabilities = init?.agentCapabilities || init?.agent_capabilities || {};
    try {
      await this.request('authenticate', { methodId: 'cursor_login' }, 60_000);
    } catch {}
    let ns: any = null;
    if (
      this.o.resumeSessionId &&
      (this.capabilities.loadSession === true || this.capabilities.load_session === true)
    ) {
      try {
        ns = await this.request(
          'session/load',
          { sessionId: this.o.resumeSessionId, cwd: this.o.workspace, mcpServers: [] },
          60_000,
        );
        this.id = this.o.resumeSessionId;
        this.o.events.emit('log', {
          level: 'info',
          message: `Resumed executor session ${this.id}.`,
        });
      } catch (e: any) {
        appendBounded(
          this.o.runLog,
          `[executor session/load failed] ${e.message}`,
          CONFIG.runLogMaxBytes,
        );
      }
    }
    if (!this.id) {
      ns = await this.request('session/new', { cwd: this.o.workspace, mcpServers: [] }, 60_000);
      this.id = ns.sessionId;
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
      onPermissionRequest: (m) => this.handlePermission(m),
    });
    this.o.callbacks.onSessionId?.(this.id);
    const cfg = ns?.configOptions || ns?.config_options || [];
    const thinking = cfg.find((x: any) => x.id === 'thinking');
    if (
      thinking &&
      (thinking.options || []).some((x: any) => (x.value || x.id) === this.o.thinking)
    ) {
      try {
        await this.request(
          'session/set_config_option',
          { sessionId: this.id, configId: 'thinking', value: this.o.thinking },
          60_000,
        );
        this.o.events.emit('log', {
          level: 'info',
          message: `Executor thinking set to ${this.o.thinking}.`,
        });
      } catch {}
    }
    this.replayHistoricalEvents();
  }
  async setMode(mode: 'plan' | 'agent' | 'ask') {
    try {
      await this.request('session/set_mode', { sessionId: this.id, modeId: mode }, 60_000);
    } catch (e: any) {
      this.o.events.emit('log', {
        level: 'warn',
        message: `Unable to set executor mode ${mode}: ${e.message}`,
      });
    }
    this.o.events.emit('executor.mode', { mode });
  }
  async prompt(text: string) {
    this.agentText = '';
    let r = await this.request('session/prompt', {
      sessionId: this.id,
      prompt: [{ type: 'text', text }],
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
        prompt: [{ type: 'text', text: note }],
      });
      combined += '\n' + this.agentText;
    }
    return { result: r, text: combined };
  }
  async cancel() {
    if (this.child && this.id)
      try {
        this.raw({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: this.id } });
      } catch {}
  }
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
      this.child?.stdin?.end();
    } catch {}
    try {
      this.child?.kill('SIGTERM');
    } catch {}
    this.pending.clear();
  }
  private async handleLine(line: string) {
    this.accumulator.stepSequence();
    fs.appendFileSync(this.o.eventsFile, `SERVER ${line}\n`);
    let m: any;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    if (m.id != null && (Object.hasOwn(m, 'result') || Object.hasOwn(m, 'error'))) {
      const p = this.pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(m.id);
      if (m.error) {
        p.reject(new Error(JSON.stringify(m.error)));
      } else {
        p.resolve(m.result);
      }
      return;
    }

    await this.normalizer.handleMessage(m);

    if (m.id != null) this.respond(m.id, { outcome: { outcome: 'cancelled' } });
  }
  private appendFocus(text: string) {
    if (!text) return;
    rotateFile(this.o.focusFile, CONFIG.focusLogMaxBytes);
    fs.appendFileSync(this.o.focusFile, text);
    this.o.events.emit('executor.focus.delta', { text, focus_file: this.o.focusFile });
  }
  private async handlePlan(m: any) {
    const p = m.params || {};
    const plan = String(p.plan || '').trim();
    this.o.events.emit('executor.plan.request', { name: p.name || '', overview: p.overview || '' });
    if (!plan) {
      this.respond(m.id, {
        outcome: { outcome: 'rejected', reason: 'Plan is empty. Submit a complete plan.' },
      });
      return;
    }
    try {
      const d = await this.o.callbacks.onPlan(plan, p);
      if (d.accepted) {
        this.respond(m.id, { outcome: { outcome: 'accepted' } });
        this.o.events.emit('reviewer.plan', {
          verdict: d.status || 'APPROVE',
          summary: d.verdict?.summary || 'Plan accepted.',
          feedback: d.carryover || '',
        });
      } else {
        this.respond(m.id, {
          outcome: {
            outcome: 'rejected',
            reason: `Revise the entire current plan and incorporate ALL consolidated feedback below in one revision:\n\n${d.feedback || ''}`,
          },
        });
        this.o.events.emit('reviewer.plan', {
          verdict: 'REPLAN',
          summary: d.verdict?.summary || '',
          feedback: d.feedback || '',
        });
      }
    } catch (e: any) {
      this.respond(m.id, {
        outcome: {
          outcome: 'rejected',
          reason: `Reviewer unavailable or plan review failed. Keep the current complete plan and resubmit once. Error: ${e.message}`,
        },
      });
    }
  }
  private async handleQuestion(m: any) {
    const p = m.params || {};
    this.o.events.emit('executor.question', {
      title: p.title || '',
      prompt: (p.questions || []).map((q: any) => q.prompt).join(' | '),
      questions: p.questions || [],
    });
    try {
      const a = await this.o.callbacks.onQuestion(p);
      this.respond(m.id, { outcome: { outcome: 'answered', answers: a.answers } });
      this.o.events.emit('reviewer.question', {
        answer: a.answers.map((x) => x.selectedOptionIds.join(',')).join(' | '),
        rationale: a.rationale,
      });
    } catch (e: any) {
      this.respond(m.id, { outcome: { outcome: 'cancelled' } });
      this.o.events.emit('log', {
        level: 'warn',
        message: `Question could not be resolved automatically: ${e.message}`,
      });
    }
  }
  private permissionRequest(p: any): PermissionRequest {
    const tc = p.toolCall || p.tool_call || {};
    const raw = tc.rawInput || tc.raw_input || p.rawInput || {};
    const command = raw.command || raw.cmd || p.command || '';
    const paths: string[] = [];
    for (const k of ['path', 'file', 'target', 'destination'])
      if (raw[k]) paths.push(String(raw[k]));
    return {
      command: String(command || ''),
      description: tc.title || p.description || '',
      paths,
      raw: p,
    };
  }
  private pickOption(p: any, allow: boolean) {
    const opts = p.options || [];
    const words = allow
      ? ['allow_once', 'allow_always', 'allow', 'approve']
      : ['reject_once', 'deny', 'reject'];
    for (const o of opts) {
      const kind = String(o.kind || o.name || o.optionId || '').toLowerCase();
      if (words.some((w) => kind.includes(w))) return o.optionId || o.id;
    }
    return null;
  }
  private async handlePermission(m: any) {
    const p = m.params || {};
    const req = this.permissionRequest(p);
    this.o.events.emit('executor.permission', {
      summary: req.command || req.description || 'permission request',
    });
    let decision: { allow: boolean; reason: string };
    try {
      decision = await this.o.callbacks.onPermission(req, p);
    } catch (e: any) {
      decision = {
        allow: false,
        reason: `Permission reviewer failed: ${e.message}. Denying this operation only; continue with another approach.`,
      };
    }
    this.o.events.emit('reviewer.permission', {
      verdict: decision.allow ? 'ALLOW' : 'DENY',
      summary: decision.reason,
    });
    let option = this.pickOption(p, decision.allow);
    if (!option && decision.allow && req.command) {
      const denyOpt = this.pickOption(p, false);
      if (denyOpt) {
        const r = await runShellCommand(req.command, {
          cwd: this.o.workspace,
          timeoutMs: 20 * 60_000,
          onStdoutLine: (l: string) =>
            this.o.events.emit('log', { level: 'info', message: `Command: ${l}` }),
          onStderrLine: (l: string) =>
            this.o.events.emit('log', { level: 'warn', message: `Command: ${l}` }),
        });
        this.externalResults.push({
          command: req.command,
          code: r.code,
          output: (r.stdout + r.stderr).slice(-20000),
        });
        const seq = this.accumulator.stepSequence();
        if (
          /git\s+(apply|checkout|restore|clean)|rm\s+|mv\s+|cp\s+|touch\s+|sed\s+/i.test(
            req.command,
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
          quality_epoch_id: this.qualityEpochId || undefined,
        });
        this.respond(m.id, { outcome: { outcome: 'selected', optionId: denyOpt } });
        return;
      }
    }
    if (option) this.respond(m.id, { outcome: { outcome: 'selected', optionId: option } });
    else this.respond(m.id, { outcome: { outcome: 'cancelled' } });
  }
}

export function parseAcpEvents(
  eventsFilePath: string,
  opts?: { runId?: string; stageName?: string; attempt?: number; workspace?: string },
): CommandObservation[] {
  if (!fs.existsSync(eventsFilePath)) return [];
  const content = fs.readFileSync(eventsFilePath, 'utf8');
  const lines = content.split(/\r?\n/);

  const accumulator = new AcpToolAccumulator();
  const journal = new ObservationJournal();

  for (const line of lines) {
    if (!line.startsWith('SERVER ')) continue;
    let m: any;
    try {
      m = JSON.parse(line.slice(7));
    } catch {
      continue;
    }

    if (m.method === 'session/update') {
      const u = m.params?.update;
      if (
        !u ||
        !(
          u.sessionUpdate === 'tool_call' ||
          u.sessionUpdate === 'tool_call_update' ||
          u.toolCallId ||
          u.toolCall
        )
      ) {
        continue;
      }

      const sid = m.params?.sessionId || u.sessionId || 'default';
      const result = accumulator.processUpdate(
        { ...u, sessionId: sid },
        {
          defaultSessionId: sid,
          runId: opts?.runId,
          stageName: opts?.stageName,
          attempt: opts?.attempt,
          workspace: opts?.workspace,
          isReplay: true,
        },
      );

      if (result.observation) {
        journal.record(result.observation, true);
      }
    }
  }

  return journal.getObservations();
}
