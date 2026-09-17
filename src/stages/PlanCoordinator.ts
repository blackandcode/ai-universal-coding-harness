/**
 * @fileoverview Plan review coordinator for stage execution.
 * Orchestrates plan review iterations with reviewer harnesses, deduplicates plan hashes, enforces budgets, and manages carryover findings.
 */

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../core/config.js';
import { ensureDir, sha256Text, writeJson, writeText } from '../core/fs.js';
import type { ReviewerHarness, PlanDecision } from '../harness/types.js';
import { RunStateStore } from '../state/RunStateStore.js';
import type { PlanReviewVerdict, SelectedStage } from '../types.js';
import { iso } from '../core/time.js';

/**
 * Bounded plan-review coordinator: deduplicates plan hashes, enforces reviewer budgets, and records carry-over findings.
 *
 * @remarks
 * Architectural Invariants:
 * - Plan review limits are financial/cost controls, not blockers.
 * - When regular review iterations reach `maxPlanReviews`, final consolidation proceeds with carryover findings.
 * - Identical plans are deduplicated by SHA256 digest to prevent wasteful model calls.
 * - Reusable plan validation asserts that frozen specification hashes and plan hashes match persisted state.
 */
export class PlanCoordinator {
  private regularReviews = 0;
  private finalReviewDone = false;
  private byHash = new Map<string, PlanReviewVerdict>();
  private duplicateCounts = new Map<string, number>();
  private lastFeedback = '';
  private acceptedPlan = '';
  private acceptedStatus = '';
  private carryover = '';

  /**
   * @param opts - Run and stage context, reviewer adapter, and persistent state store for artifacts.
   */
  constructor(
    private opts: {
      runId: string;
      stage: SelectedStage;
      stageContext: string;
      reviewer: ReviewerHarness;
      store: RunStateStore;
    }
  ) {
    ensureDir(this.plansDir());
  }

  /** Per-stage artifact directory for the active run. */
  private stageDir(): string {
    return this.opts.store.stageDir(this.opts.runId, this.opts.stage.name);
  }

  /** Subdirectory storing plan candidates and reviewer JSON/Markdown reviews. */
  private plansDir(): string {
    return path.join(this.stageDir(), 'plans');
  }

  /** Latest accepted plan text (empty until a plan is approved). */
  get plan(): string {
    return this.acceptedPlan;
  }

  /** Status code of the accepted plan (e.g. APPROVED, APPROVED_AFTER_FINAL_CONSOLIDATION). */
  get status(): string {
    return this.acceptedStatus;
  }

  /** Mandatory reviewer findings forwarded into implementation prompts. */
  get reviewerCarryover(): string {
    return this.carryover;
  }

  /** Flattens reviewer verdict fields into executor-facing feedback text. */
  private feedback(v: PlanReviewVerdict): string {
    return [
      v.feedback_for_executor || v.feedback_for_cursor || v.summary || '',
      ...(v.missing_items || []).map((x) => `- ${x}`)
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** Persists a numbered plan candidate before reviewer evaluation. */
  private saveCandidate(plan: string, round: number): void {
    writeText(path.join(this.plansDir(), `plan-${String(round).padStart(2, '0')}.md`), plan + '\n');
  }

  /** Writes reviewer verdict artifacts (JSON + Markdown) for a review round. */
  private saveReview(v: PlanReviewVerdict, round: number, final = false): void {
    writeJson(
      path.join(
        this.plansDir(),
        `${final ? 'final-' : 'review-'}${String(round).padStart(2, '0')}.json`
      ),
      v
    );
    writeText(
      path.join(
        this.plansDir(),
        `${final ? 'final-' : 'review-'}${String(round).padStart(2, '0')}.md`
      ),
      `# ${final ? 'Final consolidation' : 'Plan review'} ${round}\n\n- **Verdict:** ${v.verdict}\n- **Summary:** ${v.summary || ''}\n\n## Missing / improvement items\n\n${(v.missing_items || []).map((x) => `- ${x}`).join('\n') || '_None._'}\n\n## Feedback for executor\n\n${v.feedback_for_executor || v.feedback_for_cursor || '_None._'}\n`
    );
  }

  /** Records an accepted plan, updates stage state hashes, and appends human plan history. */
  private accept(plan: string, status: string, reason: string, review?: PlanReviewVerdict): void {
    this.acceptedPlan = plan;
    this.acceptedStatus = status;
    this.carryover = review ? this.feedback(review) : this.lastFeedback;
    const hash = sha256Text(plan);
    writeText(path.join(this.stageDir(), 'approved-plan.md'), plan + '\n');
    writeText(
      path.join(this.stageDir(), 'PLAN.md'),
      `# Approved Stage Plan\n\n- **Status:** ${status}\n- **Accepted:** ${iso()}\n- **SHA-256:** \`${hash}\`\n- **Reason:** ${reason}\n\n## Plan\n\n${plan}\n\n${this.carryover ? `## Mandatory execution carry-over\n\n${this.carryover}\n` : ''}`
    );
    this.opts.store.saveStage(this.opts.runId, this.opts.stage.name, {
      phase: 'plan',
      plan_status: status,
      plan_sha256: hash,
      spec_sha256: this.specDigest(),
      reviewer_carryover: this.carryover
    });
    this.opts.store.appendHuman(
      this.opts.runId,
      this.opts.stage.name,
      'PLAN_REVIEW_HISTORY.md',
      'Plan accepted',
      `**Status:** ${status}\n\n**Reason:** ${reason}\n\n${this.carryover ? `**Carry-over:**\n\n${this.carryover}` : ''}`
    );
  }

  /** Hash of frozen stage manifest checksums for resume validation. */
  private specDigest(): string {
    return sha256Text(JSON.stringify(this.opts.stage.manifest.sha256 || {}));
  }

  /**
   * Returns a previously approved plan when spec and plan hashes still match persisted state.
   * Skips planning when resume metadata is still valid.
   */
  reusable(): { plan: string; carryover: string; status: string } | null {
    const p = path.join(this.stageDir(), 'approved-plan.md');
    const s = this.opts.store.loadStage(this.opts.runId, this.opts.stage.name);
    if (!fs.existsSync(p) || !s.plan_sha256 || s.spec_sha256 !== this.specDigest()) return null;
    const plan = fs.readFileSync(p, 'utf8').trim();
    if (!plan || sha256Text(plan) !== s.plan_sha256) return null;
    this.acceptedPlan = plan;
    this.acceptedStatus = s.plan_status || 'REUSED';
    this.carryover = s.reviewer_carryover || '';
    return { plan, carryover: this.carryover, status: this.acceptedStatus };
  }

  /** Accepts a synthetic plan when the executor never submitted via ACP within the planning budget. */
  forceAccept(plan: string, reason = 'Autonomous fallback plan accepted.'): string {
    const clean =
      plan.trim() ||
      'Implement every requirement in functional-spec.md, technical-spec.md, and prompt.md; run all required tests and quality gates.';
    this.accept(clean, 'APPROVED_AUTONOMOUS_FALLBACK', reason, {
      verdict: 'APPROVE',
      summary: reason,
      missing_items: [],
      feedback_for_cursor: this.lastFeedback,
      feedback_for_executor: this.lastFeedback
    });
    return clean;
  }

  /**
   * Reviews a candidate plan with the reviewer harness, applying duplicate-hash and budget rules.
   * Plan review is advisory: execution proceeds after the configured review cycle completes.
   */
  async submit(plan: string): Promise<PlanDecision> {
    const clean = plan.trim();
    if (!clean) {
      return { outcome: 'needs_revision', accepted: false, feedback: 'Plan is empty.' };
    }
    const hash = sha256Text(clean);
    const round = this.regularReviews + 1;
    this.saveCandidate(clean, round);
    const cached = this.byHash.get(hash);
    if (cached) {
      const f = this.feedback(cached);
      if (cached.verdict === 'APPROVE') {
        this.accept(clean, 'APPROVED', 'Identical plan already approved.', cached);
        return {
          outcome: 'accepted',
          accepted: true,
          status: 'APPROVE',
          carryover: '',
          verdict: cached
        };
      }
      const duplicates = (this.duplicateCounts.get(hash) || 0) + 1;
      this.duplicateCounts.set(hash, duplicates);
      if (duplicates >= 2) {
        let finalV: PlanReviewVerdict = cached;
        if (CONFIG.finalPlanReview && !this.finalReviewDone) {
          this.finalReviewDone = true;
          try {
            finalV = await this.opts.reviewer.reviewPlan(
              {
                current_plan: clean,
                original_stage_inputs: this.opts.stageContext,
                prior_feedback: f,
                review_round: 'final-consolidation-after-duplicate'
              },
              { finalConsolidation: true }
            );
            this.saveReview(finalV, this.regularReviews + 1, true);
          } catch {}
        }
        const carry = this.feedback(finalV) || f;
        this.lastFeedback = carry;
        this.accept(
          clean,
          'APPROVED_WITH_REVIEW_NOTES',
          'The executor resubmitted an unchanged plan after consolidated feedback. To avoid repetitive reviewer spend, final consolidation completed and execution proceeds with remaining findings as mandatory guidance.',
          { ...finalV, verdict: 'APPROVE', feedback_for_cursor: carry }
        );
        return {
          outcome: 'accepted_with_notes',
          accepted: true,
          status: 'APPROVE_WITH_NOTES',
          carryover: carry,
          verdict: { ...finalV, verdict: 'APPROVE' }
        };
      }
      return {
        outcome: 'needs_revision',
        accepted: false,
        feedback: f,
        verdict: cached
      };
    }
    if (this.regularReviews < CONFIG.maxPlanReviews) {
      this.regularReviews++;
      const v = await this.opts.reviewer.reviewPlan({
        current_plan: clean,
        original_stage_inputs: this.opts.stageContext,
        review_round: this.regularReviews,
        max_regular_reviews: CONFIG.maxPlanReviews
      });
      this.byHash.set(hash, v);
      this.saveReview(v, this.regularReviews, false);
      const f = this.feedback(v);
      this.lastFeedback = f;
      this.opts.store.appendHuman(
        this.opts.runId,
        this.opts.stage.name,
        'PLAN_REVIEW_HISTORY.md',
        `Review ${this.regularReviews}`,
        `**Verdict:** ${v.verdict}\n\n${f || '_No findings._'}`
      );
      if (v.verdict === 'APPROVE') {
        this.accept(clean, 'APPROVED', v.summary || 'Reviewer approved full plan.', v);
        return { outcome: 'accepted', accepted: true, status: 'APPROVE', verdict: v };
      }
      return {
        outcome: 'needs_revision',
        accepted: false,
        feedback: f || 'Revise the complete plan using all reviewer findings.',
        verdict: v
      };
    }
    if (CONFIG.finalPlanReview && !this.finalReviewDone) {
      this.finalReviewDone = true;
      let v: PlanReviewVerdict;
      try {
        v = await this.opts.reviewer.reviewPlan(
          {
            current_plan: clean,
            original_stage_inputs: this.opts.stageContext,
            prior_feedback: this.lastFeedback,
            review_round: 'final-consolidation'
          },
          { finalConsolidation: true }
        );
      } catch (e: unknown) {
        const errMessage = e instanceof Error ? e.message : String(e);
        v = {
          verdict: 'APPROVE',
          summary: `Final consolidation reviewer unavailable: ${errMessage}. Proceeding autonomously.`,
          missing_items: [],
          feedback_for_cursor: this.lastFeedback
        };
      }
      this.saveReview(v, this.regularReviews + 1, true);
      const f = this.feedback(v) || this.lastFeedback;
      this.lastFeedback = f;
      this.accept(
        clean,
        'APPROVED_AFTER_FINAL_CONSOLIDATION',
        'Regular plan-review budget completed. Final consolidation is advisory and can never block execution.',
        { ...v, verdict: 'APPROVE', feedback_for_cursor: f }
      );
      return {
        outcome: 'accepted_with_notes',
        accepted: true,
        status: 'APPROVE_WITH_NOTES',
        carryover: f,
        verdict: { ...v, verdict: 'APPROVE' }
      };
    }
    this.accept(
      clean,
      'APPROVED_AFTER_REVIEW_BUDGET',
      'Plan review is advisory; execution must continue after the review cycle.',
      {
        verdict: 'APPROVE',
        summary: 'Review cycle completed.',
        missing_items: [],
        feedback_for_cursor: this.lastFeedback
      }
    );
    return {
      outcome: 'accepted_with_notes',
      accepted: true,
      status: 'APPROVE_WITH_NOTES',
      carryover: this.lastFeedback
    };
  }
}
