/**
 * @fileoverview Cursor reviewer harness coordinating prompt building, subprocess execution, and verdict parsing.
 *
 * Implements the ReviewerHarness contract for Cursor CLI (agent binary), strictly enforcing
 * reviewer role boundaries, ephemeral sandbox execution, schema-enforced output,
 * and structured verdict validation without mutating repository state.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ReviewerHarness, HarnessInfo, HarnessPreflightResult } from '../types.js';
import type {
  PlanReviewVerdict,
  QuestionVerdict,
  PermissionVerdict,
  FinalVerdict,
  HarnessContext
} from '../../types.js';
import { SCHEMA_DIR } from '../../core/paths.js';
import { harnessNumber, harnessString, CONFIG } from '../../core/config.js';
import { execSyncText, commandExists, runProcess } from '../../core/process.js';
import { ensureDir, writeJson, writeText, appendBounded } from '../../core/fs.js';
import { ProcessExecutionError } from '../../errors.js';
import { validateReviewerVerdict } from '../codex/CodexEventParser.js';

/**
 * Extracts a parsed JSON payload from raw reviewer stdout, supporting pure JSON,
 * markdown code fences, and nested wrapper objects.
 *
 * @param text - Raw stdout or response string
 * @returns Parsed JSON object
 */
export function extractJsonFromText<T>(text: string): T {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Reviewer returned empty output');
  }

  // 1. Direct JSON parse attempt
  try {
    const parsed = JSON.parse(trimmed) as T;
    // Handle wrapper objects like { text: "..." } or { result: "..." }
    if (parsed && typeof parsed === 'object') {
      const rec = parsed as Record<string, unknown>;
      if (!('verdict' in rec)) {
        if (typeof rec.text === 'string' && rec.text.trim()) {
          try {
            return extractJsonFromText<T>(rec.text);
          } catch {}
        }
        if (typeof rec.result === 'string' && rec.result.trim()) {
          try {
            return extractJsonFromText<T>(rec.result);
          } catch {}
        }
      }
    }
    return parsed;
  } catch {}

  // 2. Check for markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]) as T;
    } catch {}
  }

  // 3. Find outermost { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {}
  }

  throw new Error(`Reviewer output did not contain valid JSON: ${trimmed.slice(0, 300)}`);
}

export class CursorReviewerHarness implements ReviewerHarness {
  static runner: typeof runProcess = runProcess;

  static defaults = {
    binary: 'agent',
    model: 'gemini-3.8-flash',
    thinking: 'high',
    timeoutMinutes: 8,
    timeoutSeconds: 0
  };

  private seq = 0;
  private binary = harnessString('cursor', 'binary', CursorReviewerHarness.defaults.binary);
  private model = harnessString('cursor', 'model', CursorReviewerHarness.defaults.model);
  private thinking = harnessString('cursor', 'thinking', CursorReviewerHarness.defaults.thinking);
  private timeoutMinutes = harnessNumber(
    'cursor',
    'timeoutMinutes',
    CursorReviewerHarness.defaults.timeoutMinutes
  );
  private timeoutSeconds = 0;

  info: HarnessInfo = {
    id: 'cursor',
    label: `${this.model} reviewer`,
    role: 'reviewer',
    model: this.model
  };

  constructor(private ctx: HarnessContext = {}) {
    this.binary = ctx.reviewerBinary || this.binary;
    this.model = ctx.reviewerModel || this.model;
    if (typeof (ctx as Record<string, unknown>).thinking === 'string') {
      this.thinking = (ctx as Record<string, unknown>).thinking as string;
    }
    if (typeof (ctx as Record<string, unknown>).timeoutMinutes === 'number') {
      this.timeoutMinutes = (ctx as Record<string, unknown>).timeoutMinutes as number;
    }
    if (typeof (ctx as Record<string, unknown>).timeoutSeconds === 'number') {
      this.timeoutSeconds = (ctx as Record<string, unknown>).timeoutSeconds as number;
    }
    this.info = { ...this.info, model: this.model, label: `${this.model} reviewer` };
  }

  /**
   * Asserts that the Cursor agent binary is installed and executable.
   */
  async preflight(): Promise<HarnessPreflightResult> {
    const details: string[] = [];
    if (!commandExists(this.binary)) {
      return { ok: false, details: [`${this.binary} not found`] };
    }
    const v = execSyncText(this.binary, ['-v']);
    const versionStr = (v.stdout || v.stderr).trim();
    details.push(versionStr || 'Cursor agent available');
    return { ok: true, details };
  }

  /**
   * Internal coordinator delegating prompt building, child process execution, and verdict validation.
   */
  private async decide<T>(
    kind: 'plan-review' | 'question' | 'permission' | 'final-review',
    payload: unknown,
    schemaFile: string,
    extra = ''
  ): Promise<T> {
    this.seq++;

    const runDir = this.ctx.runDir || os.tmpdir();
    const stageName = this.ctx.stageName || '_run';
    const decisionDir = path.join(
      runDir,
      'reviewer-decisions',
      stageName,
      `${String(this.seq).padStart(3, '0')}-${kind}`
    );
    ensureDir(decisionDir);

    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-universal-harness-cursor-rev-'));
    try {
      execSyncText('git', ['init', '-q'], { cwd: isolated });
    } catch {}

    const schemaPath = path.join(SCHEMA_DIR, schemaFile);
    let schemaJson = '';
    try {
      if (fs.existsSync(schemaPath)) {
        schemaJson = fs.readFileSync(schemaPath, 'utf8');
      }
    } catch {}

    const prompt =
      `You are the senior human-equivalent reviewer and decision maker in an autonomous software-development orchestration system.\n\n` +
      `STRICT ROLE BOUNDARY:\n- Do NOT execute commands. Do NOT use shell, file tools, MCP, web search, subagents, or modify files.\n` +
      `- Everything needed is supplied below.\n` +
      `- Return ONLY a valid JSON object matching the JSON Schema provided.\n` +
      `- Do not include explanations, prose, or conversational filler outside the JSON.\n` +
      `- Compare decisions against ALL frozen stage inputs, not only the most recent reviewer feedback.\n` +
      `- Prefer the smallest reversible decision that satisfies the frozen requirements.\n- Do not invent product requirements.\n\n` +
      `STAGE: ${stageName}\n\n` +
      `FROZEN STAGE INPUTS:\n${this.ctx.stageContext || ''}\n\n` +
      `RELEVANT SKILL DIGEST:\n${this.ctx.skillsText || ''}\n\n` +
      `DECISION TYPE: ${kind}\n` +
      `${extra ? `${extra}\n` : ''}` +
      (schemaJson ? `JSON SCHEMA:\n${schemaJson}\n\n` : '') +
      `PAYLOAD:\n${JSON.stringify(payload, null, 2)}\n`;

    writeText(path.join(decisionDir, 'input.md'), prompt);
    const eventsFile = path.join(decisionDir, 'events.jsonl');

    const args = [
      '-p',
      '--output-format',
      'json',
      '--mode',
      'plan',
      '--model',
      this.model,
      '--trust',
      '--workspace',
      isolated
    ];

    const timeoutMs =
      this.timeoutSeconds > 0 ? this.timeoutSeconds * 1000 : this.timeoutMinutes * 60_000;

    const recordedEventLines: string[] = [];

    try {
      const r = await CursorReviewerHarness.runner(this.binary, args, {
        cwd: isolated,
        stdinText: prompt,
        timeoutMs,
        onStdoutLine: (line: string) => {
          recordedEventLines.push(line);
          appendBounded(eventsFile, line, CONFIG.runLogMaxBytes);
        },
        onStderrLine: (line: string) => {
          if (this.ctx.runLog) {
            appendBounded(
              this.ctx.runLog,
              `[cursor-reviewer-stderr] ${line}`,
              CONFIG.runLogMaxBytes
            );
          }
        }
      });

      if (r.code !== 0) {
        const err = new ProcessExecutionError(`Cursor reviewer ${kind} failed (exit ${r.code}).`, {
          exitCode: r.code,
          signal: r.signal,
          stdout: r.stdout,
          stderr: r.stderr,
          timedOut: r.timedOut
        });
        Object.assign(err, {
          eventLines: recordedEventLines,
          resultFileExists: false
        });
        throw err;
      }

      const parsed = extractJsonFromText<T>(r.stdout);
      const validation = validateReviewerVerdict(kind, parsed);
      if (!validation.ok) {
        throw new Error(
          validation.error || `Cursor reviewer ${kind} returned invalid verdict payload`
        );
      }

      writeJson(path.join(decisionDir, 'result.json'), parsed);
      return parsed;
    } finally {
      try {
        fs.rmSync(isolated, { recursive: true, force: true });
      } catch {}
    }
  }

  /**
   * Reviews executor plan against frozen stage specifications and architecture invariants.
   */
  async reviewPlan(
    input: unknown,
    opts?: { finalConsolidation?: boolean }
  ): Promise<PlanReviewVerdict> {
    const extra = opts?.finalConsolidation
      ? 'PLAN BUDGET EXHAUSTION NOTICE: This is the final consolidation review round. Accept the plan with notes or approve with carryover findings.'
      : '';
    return this.decide<PlanReviewVerdict>('plan-review', input, 'plan-verdict.schema.json', extra);
  }

  /**
   * Answers multiple-choice architectural or product questions submitted by the executor.
   */
  async answerQuestions(input: unknown): Promise<QuestionVerdict> {
    return this.decide<QuestionVerdict>('question', input, 'question-verdict.schema.json');
  }

  /**
   * Evaluates command permissions referred by the permission engine.
   */
  async decidePermission(input: unknown): Promise<PermissionVerdict> {
    return this.decide<PermissionVerdict>('permission', input, 'permission-verdict.schema.json');
  }

  /**
   * Performs final code review against the unified diff, test output, and corroborated evidence.
   */
  async reviewImplementation(input: unknown): Promise<FinalVerdict> {
    return this.decide<FinalVerdict>('final-review', input, 'final-verdict.schema.json');
  }
}
