import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ReviewerHarness, HarnessInfo, HarnessPreflightResult } from '../types.js';
import type {
  PlanReviewVerdict,
  QuestionVerdict,
  PermissionVerdict,
  FinalVerdict,
} from '../../types.js';
import { CONFIG, harnessNumber, harnessString, PROJECT_ROOT } from '../../core/config.js';
import { SCHEMA_DIR } from '../../core/paths.js';
import { runProcess, execSyncText, commandExists } from '../../core/process.js';
import { ensureDir, writeJson, writeText, readJson, appendBounded } from '../../core/fs.js';

export class CodexReviewerHarness implements ReviewerHarness {
  static defaults = {
    binary: 'codex',
    model: 'gpt-6-astra',
    reasoningEffort: 'low',
    verbosity: 'low',
    timeoutMinutes: 8,
  };
  private seq = 0;
  private binary = harnessString('codex', 'binary', CodexReviewerHarness.defaults.binary);
  private model = harnessString('codex', 'model', CodexReviewerHarness.defaults.model);
  private reasoningEffort = harnessString(
    'codex',
    'reasoningEffort',
    CodexReviewerHarness.defaults.reasoningEffort,
  );
  private verbosity = harnessString('codex', 'verbosity', CodexReviewerHarness.defaults.verbosity);
  private timeoutMinutes = harnessNumber(
    'codex',
    'timeoutMinutes',
    CodexReviewerHarness.defaults.timeoutMinutes,
  );
  private contextMode = harnessString('codex', 'contextMode', 'evidence_only');
  info: HarnessInfo = {
    id: 'codex',
    label: `${this.model} reviewer`,
    role: 'reviewer',
    model: this.model,
  };
  constructor(private ctx: any) {
    this.binary = ctx?.reviewerBinary || this.binary;
    this.model = ctx?.reviewerModel || this.model;
    this.info = { ...this.info, model: this.model, label: `${this.model} reviewer` };
  }
  async preflight(): Promise<HarnessPreflightResult> {
    const details: string[] = [];
    if (!commandExists(this.binary)) return { ok: false, details: [`${this.binary} not found`] };
    const v = execSyncText(this.binary, ['--version']);
    details.push((v.stdout || v.stderr).trim());
    const h = execSyncText(this.binary, ['exec', '--help']);
    if (h.code !== 0) return { ok: false, details: [...details, 'codex exec unavailable'] };
    for (const f of ['--output-schema', '--output-last-message'])
      if (!h.stdout.includes(f)) return { ok: false, details: [...details, `missing ${f}`] };
    return { ok: true, details };
  }
  private async decide<T>(kind: string, payload: any, schemaFile: string, extra = ''): Promise<T> {
    this.seq++;
    const decisionDir = path.join(
      this.ctx.runDir,
      'reviewer-decisions',
      this.ctx.stageName || '_run',
      `${String(this.seq).padStart(3, '0')}-${kind}`,
    );
    ensureDir(decisionDir);
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-universal-harness-reviewer-'));
    try {
      execSyncText('git', ['init', '-q'], { cwd: isolated });
    } catch {}
    const reviewerCwd = this.contextMode === 'evidence_only' ? isolated : PROJECT_ROOT;
    const readonlyProject = this.contextMode === 'project_readonly';
    const resultFile = path.join(isolated, 'result.json');
    const eventsFile = path.join(decisionDir, 'events.jsonl');
    const toolPolicy = readonlyProject
      ? 'You may inspect repository files using read-only tooling when necessary. Do not run builds/tests, network operations, package installs, Git mutations, or write files.'
      : 'Do NOT execute commands. Do NOT use shell, file tools, MCP, web search, subagents, or modify files.';
    const prompt = `You are the senior human-equivalent reviewer and decision maker in an autonomous software-development orchestration system.\n\nSTRICT ROLE BOUNDARY:\n- ${toolPolicy}\n- Everything needed is supplied below.\n- Return only the schema-constrained decision.\n- Compare decisions against ALL frozen stage inputs, not only the most recent reviewer feedback.\n- Prefer the smallest reversible decision that satisfies the frozen requirements.\n- Do not invent product requirements.\n\nSTAGE: ${this.ctx.stageName || ''}\n\nFROZEN STAGE INPUTS:\n${this.ctx.stageContext || ''}\n\nRELEVANT SKILL DIGEST:\n${this.ctx.skillsText || ''}\n\nDECISION TYPE: ${kind}\n${extra}\n\nPAYLOAD:\n${JSON.stringify(payload, null, 2)}\n`;
    writeText(path.join(decisionDir, 'input.md'), prompt);
    const args = ['exec', '--model', this.model, '--ephemeral'];
    if (this.contextMode === 'evidence_only')
      args.push('--ignore-user-config', '--ignore-rules', '--skip-git-repo-check');
    args.push(
      '--strict-config',
      '--sandbox',
      'read-only',
      '--json',
      '--output-schema',
      path.join(SCHEMA_DIR, schemaFile),
      '--output-last-message',
      resultFile,
      '-c',
      `model_reasoning_effort="${this.reasoningEffort}"`,
      '-c',
      `model_verbosity="${this.verbosity}"`,
      '-c',
      'web_search="disabled"',
    );
    if (!readonlyProject) args.push('-c', 'features.shell_tool=false');
    args.push('-c', 'features.multi_agent=false', '-c', 'features.shell_snapshot=false', '-');
    const help = execSyncText(this.binary, ['exec', '--help']).stdout;
    if (help.includes('--disable'))
      args.splice(args.length - 1, 0, '--disable', 'apps', '--disable', 'plugins');
    let violation = false;
    const r = await runProcess(this.binary, args, {
      cwd: reviewerCwd,
      stdinText: prompt,
      timeoutMs: this.timeoutMinutes * 60_000,
      onStdoutLine: (line: string) => {
        appendBounded(eventsFile, line, CONFIG.runLogMaxBytes);
        try {
          const e = JSON.parse(line);
          const typ = e?.item?.type || e?.item_type;
          if (
            ['file_change', 'mcp_tool_call', 'web_search', 'collab_tool_call'].includes(typ) ||
            (typ === 'command_execution' && !readonlyProject)
          )
            violation = true;
          this.ctx.events?.emit('reviewer.tokens', {
            kind,
            input: Number(e?.usage?.input_tokens || 0),
            cached: Number(e?.usage?.cached_input_tokens || 0),
            output: Number(e?.usage?.output_tokens || 0),
          });
        } catch {}
      },
      onStderrLine: (line: string) =>
        appendBounded(this.ctx.runLog, `[reviewer-stderr] ${line}`, CONFIG.runLogMaxBytes),
    });
    if (r.code !== 0) throw new Error(`Reviewer ${kind} failed (exit ${r.code}).`);
    if (violation) throw new Error(`Reviewer ${kind} violated reviewer-only role boundary.`);
    if (!fs.existsSync(resultFile))
      throw new Error(`Reviewer ${kind} produced no structured result.`);
    const out = readJson<T>(resultFile);
    writeJson(path.join(decisionDir, 'result.json'), out);
    return out;
  }
  reviewPlan(input: any, opts: any = {}): Promise<PlanReviewVerdict> {
    const extra = opts.finalConsolidation
      ? `\nFINAL CONSOLIDATION REVIEW:\nThis is the final plan-review pass. Do not block or request another review cycle. Return APPROVE and put every remaining concern into feedback_for_cursor/missing_items so execution can carry it forward. Even if you would normally request REPLAN, the orchestrator will proceed after this response.`
      : `\nReview the ENTIRE current plan against ALL original frozen inputs. Return every material missing item together in this single response; do not drip-feed findings one at a time.`;
    return this.decide<PlanReviewVerdict>('plan-review', input, 'plan-verdict.schema.json', extra);
  }
  answerQuestions(input: any): Promise<QuestionVerdict> {
    return this.decide<QuestionVerdict>(
      'question',
      input,
      'question-verdict.schema.json',
      'Answer the blocking Cursor question using only frozen requirements and supplied evidence.',
    );
  }
  decidePermission(input: any): Promise<PermissionVerdict> {
    return this.decide<PermissionVerdict>(
      'permission',
      input,
      'permission-verdict.schema.json',
      'Decide only whether this exact operation should be allowed. Denial applies to this operation only and must not imply stage failure.',
    );
  }
  reviewImplementation(input: any): Promise<FinalVerdict> {
    return this.decide<FinalVerdict>(
      'final-review',
      input,
      'final-verdict.schema.json',
      'Review only supplied patch/evidence. Do not ask to run commands. Return all material findings together.',
    );
  }
}
