/**
 * @fileoverview Codex reviewer harness coordinating prompt building, subprocess execution, and verdict parsing.
 *
 * Implements the {@link ReviewerHarness} contract for OpenAI Codex CLI, strictly enforcing
 * reviewer role boundaries, ephemeral sandbox execution, schema-enforced output,
 * and token accounting without mutating repository state.
 *
 * @remarks
 * Architectural Invariants:
 * - Reviewers judge changes and evidence; they must NEVER modify repository files or execute code.
 * - Spawns Codex CLI in an isolated sandbox with `--sandbox read-only` and strict JSON schemas.
 */

import type { ReviewerHarness, HarnessInfo, HarnessPreflightResult } from '../types.js';
import type {
  PlanReviewVerdict,
  QuestionVerdict,
  PermissionVerdict,
  FinalVerdict
} from '../../types.js';
import { harnessNumber, harnessString } from '../../core/config.js';
import { execSyncText, commandExists } from '../../core/process.js';
import { CodexPromptBuilder } from './CodexPromptBuilder.js';
import { CodexProcessRunner } from './CodexProcessRunner.js';
import type { CodexDecisionKind } from './types.js';

/**
 * OpenAI Codex CLI adapter implementing the reviewer harness contract.
 */
export class CodexReviewerHarness implements ReviewerHarness {
  static defaults = {
    binary: 'codex',
    model: 'gpt-6-astra',
    reasoningEffort: 'low',
    verbosity: 'low',
    timeoutMinutes: 8
  };

  private seq = 0;
  private binary = harnessString('codex', 'binary', CodexReviewerHarness.defaults.binary);
  private model = harnessString('codex', 'model', CodexReviewerHarness.defaults.model);
  private reasoningEffort = harnessString(
    'codex',
    'reasoningEffort',
    CodexReviewerHarness.defaults.reasoningEffort
  );
  private verbosity = harnessString('codex', 'verbosity', CodexReviewerHarness.defaults.verbosity);
  private timeoutMinutes = harnessNumber(
    'codex',
    'timeoutMinutes',
    CodexReviewerHarness.defaults.timeoutMinutes
  );
  private contextMode = harnessString('codex', 'contextMode', 'evidence_only') as
    | 'evidence_only'
    | 'project_readonly';

  info: HarnessInfo = {
    id: 'codex',
    label: `${this.model} reviewer`,
    role: 'reviewer',
    model: this.model
  };

  /**
   * Applies harness context overrides for binary, model, and display labels.
   *
   * @param ctx - Run-scoped harness context containing workspace paths, stage context, and logger.
   */
  constructor(private ctx: any) {
    this.binary = ctx?.reviewerBinary || this.binary;
    this.model = ctx?.reviewerModel || this.model;
    this.info = { ...this.info, model: this.model, label: `${this.model} reviewer` };
  }

  /**
   * Asserts that Codex binary is installed, accessible, and supports required schema flags.
   *
   * @returns Preflight validation result detailing binary presence and CLI capability checks.
   */
  async preflight(): Promise<HarnessPreflightResult> {
    const details: string[] = [];
    if (!commandExists(this.binary)) return { ok: false, details: [`${this.binary} not found`] };
    const v = execSyncText(this.binary, ['--version']);
    details.push((v.stdout || v.stderr).trim());
    const h = execSyncText(this.binary, ['exec', '--help']);
    if (h.code !== 0) return { ok: false, details: [...details, 'codex exec unavailable'] };
    for (const f of ['--output-schema', '--output-last-message']) {
      if (!h.stdout.includes(f)) return { ok: false, details: [...details, `missing ${f}`] };
    }
    return { ok: true, details };
  }

  /**
   * Internal coordinator delegating prompt construction and runner execution.
   *
   * @typeParam T - Expected verdict type.
   * @param kind - Reviewer decision kind (plan, question, permission, final).
   * @param payload - Structured input forwarded to the prompt builder.
   * @param schemaFile - JSON Schema filename under `schemas/`.
   * @param extra - Additional reviewer instructions appended to the prompt.
   * @returns Parsed and validated verdict object.
   */
  private async decide<T>(
    kind: CodexDecisionKind,
    payload: unknown,
    schemaFile: string,
    extra = ''
  ): Promise<T> {
    this.seq++;

    const prompt = CodexPromptBuilder.buildPrompt({
      kind,
      stageName: this.ctx.stageName || '',
      stageContext: this.ctx.stageContext || '',
      skillsText: this.ctx.skillsText || '',
      payload,
      extraPromptText: extra,
      readonlyProject: this.contextMode === 'project_readonly'
    });

    const execution = await CodexProcessRunner.run<T>({
      binary: this.binary,
      model: this.model,
      reasoningEffort: this.reasoningEffort,
      verbosity: this.verbosity,
      timeoutMinutes: this.timeoutMinutes,
      contextMode: this.contextMode,
      runDir: this.ctx.runDir,
      stageName: this.ctx.stageName || '_run',
      decisionKind: kind,
      decisionSeq: this.seq,
      prompt,
      schemaFileName: schemaFile,
      events: this.ctx.events,
      runLog: this.ctx.runLog
    });

    return execution.result;
  }

  /**
   * Reviews executor plan against frozen stage specifications and architecture invariants.
   *
   * @remarks
   * Invariant: Plan reviews evaluate plans against immutable frozen specifications.
   * When regular review rounds are exhausted (`opts.finalConsolidation`), the reviewer
   * approves with carryover findings rather than indefinitely blocking stage progress.
   *
   * @param input - Plan review payload from the orchestrator.
   * @param opts - When `finalConsolidation` is set, instructs the reviewer not to request another replan cycle.
   * @returns Evaluated {@link PlanReviewVerdict}.
   */
  reviewPlan(input: any, opts: any = {}): Promise<PlanReviewVerdict> {
    const extra = opts.finalConsolidation
      ? `FINAL CONSOLIDATION REVIEW:\nThis is the final plan-review pass. Do not block or request another review cycle. Return APPROVE and put every remaining concern into feedback_for_cursor/missing_items so execution can carry it forward. Even if you would normally request REPLAN, the orchestrator will proceed after this response.`
      : `Review the ENTIRE current plan against ALL original frozen inputs. Return every material missing item together in this single response; do not drip-feed findings one at a time.`;
    return this.decide<PlanReviewVerdict>('plan-review', input, 'plan-verdict.schema.json', extra);
  }

  /**
   * Answers blocking questions posed by the executor agent.
   *
   * @remarks
   * Evaluates questions against frozen stage requirements to guide implementation decisions.
   *
   * @param input - Question payload including options and executor context.
   * @returns Evaluated {@link QuestionVerdict}.
   */
  answerQuestions(input: any): Promise<QuestionVerdict> {
    return this.decide<QuestionVerdict>(
      'question',
      input,
      'question-verdict.schema.json',
      'Answer the blocking Cursor question using only frozen requirements and supplied evidence.'
    );
  }

  /**
   * Classifies and decides whether a requested permission action is safe.
   *
   * @remarks
   * Invariant: A reviewer denial applies strictly to the individual requested operation
   * and must never terminate or fail the overall stage.
   *
   * @param input - Permission request describing the proposed operation.
   * @returns Evaluated {@link PermissionVerdict}.
   */
  decidePermission(input: any): Promise<PermissionVerdict> {
    return this.decide<PermissionVerdict>(
      'permission',
      input,
      'permission-verdict.schema.json',
      'Decide only whether this exact operation should be allowed. Denial applies to this operation only and must not imply stage failure.'
    );
  }

  /**
   * Reviews final implementation diff and evidence claims against frozen requirements.
   *
   * @remarks
   * Evaluates the unified git diff and corroborated evidence against frozen specifications.
   * The reviewer does not execute commands or modify files during evaluation.
   *
   * @param input - Final review payload including diff, evidence, and plan carryover.
   * @returns Evaluated {@link FinalVerdict}.
   */
  reviewImplementation(input: any): Promise<FinalVerdict> {
    return this.decide<FinalVerdict>(
      'final-review',
      input,
      'final-verdict.schema.json',
      'Review only supplied patch/evidence. Do not ask to run commands. Return all material findings together.'
    );
  }
}
