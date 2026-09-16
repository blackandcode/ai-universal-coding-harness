/**
 * @fileoverview ReviewPayloadBuilder constructs structured final review payloads with diff analysis and bounding.
 *
 * Computes character count and token estimations, attaches diff_stat and changed_files summaries,
 * bounds total diff size within configured thresholds, and prioritizes requested_paths from prior
 * NEEDS_CONTEXT review rounds to prevent diff-truncation blindness.
 */

import { CONFIG } from '../../core/config.js';
import type { FinalReviewInput } from '../../harness/types.js';
import type { ExecutionEvidence } from '../../types.js';

/** Minimal git surface required to assemble a final review payload. */
export interface GitReviewProvider {
  statusShort(): string;
  diffStat(): string;
  changedFiles(): string[];
  reviewDiff(paths?: string[]): string;
}

/**
 * Metrics describing character counts and truncation of the unified review diff.
 */
export interface ReviewDiffMetrics {
  /** Character count of the attached diff. */
  char_count: number;
  /** Estimated token count approximating 4 characters per token. */
  estimated_tokens: number;
  /** True if diff content was truncated to fit within maxDiffChars. */
  truncated: boolean;
  /** Original un-truncated diff character count. */
  original_chars: number;
  /** Paths prioritized ahead of remaining repository diff lines. */
  prioritized_paths?: string[];
}

/**
 * Options supplied to {@link ReviewPayloadBuilder.build} when assembling final review inputs.
 */
export interface BuildReviewPayloadOptions {
  /** Repository provider supplying git status, diff_stat, and diff text. */
  git: GitReviewProvider;
  /** Approved stage implementation plan. */
  approvedPlan?: string | Record<string, unknown> | null;
  /** Carry-over findings and instructions from plan review rounds. */
  planReviewerCarryover?: string | null;
  /** Corroborated execution evidence and quality command outputs. */
  evidence?: ExecutionEvidence | Partial<ExecutionEvidence> | null;
  /** Maximum allowable diff character count (defaults to configured limit). */
  maxDiffChars?: number;
  /** File paths explicitly requested by reviewer in a prior NEEDS_CONTEXT verdict. */
  requestedPaths?: string[];
}

/**
 * Authoritative payload structure delivered to a reviewer harness during final stage evaluation.
 */
export interface FinalReviewPayload extends FinalReviewInput {
  /** Approved stage implementation plan. */
  approved_plan?: string | Record<string, unknown> | null;
  /** Carryover instructions from plan reviews. */
  plan_reviewer_carryover?: string | null;
  /** Corroborated quality evidence claims. */
  evidence?: ExecutionEvidence | Partial<ExecutionEvidence> | null;
  /** Short git status output showing modified and untracked files. */
  git_status: string;
  /** Git diffstat summary. */
  diff_stat: string;
  /** Array of file paths modified during this stage. */
  changed_files: string[];
  /** Unified diff text bounded within configured limits. */
  diff: string;
  /** Detailed metrics on diff size and truncation status. */
  diff_metrics: ReviewDiffMetrics;
  /** Diff text specifically for paths requested in prior review rounds. */
  requested_context_diff?: string;
  [key: string]: unknown;
}

/**
 * Assembles bounded final-review payloads with diff metrics and NEEDS_CONTEXT path prioritization.
 *
 * @remarks
 * Invariant: Prevents reviewer truncation blindness on large structural diffs by prioritizing
 * paths requested in prior rounds and appending clear truncation notices if limits are exceeded.
 */
export class ReviewPayloadBuilder {
  /**
   * Constructs an authoritative {@link FinalReviewPayload} embedding diff statistics and metrics.
   *
   * @param options - Source git provider, plans, evidence, and truncation limits.
   * @returns Bounded review payload with prioritized diff content and metrics.
   */
  static build(options: BuildReviewPayloadOptions): FinalReviewPayload {
    const maxChars = options.maxDiffChars ?? CONFIG.maxDiffChars ?? 800_000;
    const git = options.git;

    const gitStatus = git.statusShort();
    const diffStat = git.diffStat();
    const changedFiles = git.changedFiles();

    let diff = '';
    let requestedContextDiff: string | undefined;
    let metrics: ReviewDiffMetrics;

    const requestedPaths = options.requestedPaths?.filter((p) => typeof p === 'string' && p.trim());

    if (requestedPaths && requestedPaths.length > 0) {
      requestedContextDiff = git.reviewDiff(requestedPaths);
      const fullDiff = git.reviewDiff();

      if (fullDiff.length <= maxChars) {
        diff = fullDiff;
        metrics = {
          char_count: fullDiff.length,
          estimated_tokens: Math.ceil(fullDiff.length / 4),
          truncated: false,
          original_chars: fullDiff.length,
          prioritized_paths: requestedPaths
        };
      } else {
        // Full diff exceeds threshold; prioritize requestedPaths
        const prefix =
          `# PRIORITIZED CONTEXT FOR REQUESTED PATHS (${requestedPaths.join(', ')}):\n` +
          `${requestedContextDiff}\n\n` +
          `# GENERAL REPOSITORY DIFF (BOUNDED):\n`;

        if (prefix.length >= maxChars) {
          diff =
            requestedContextDiff.slice(0, maxChars) +
            `\n...[diff truncated: prioritized context (${requestedContextDiff.length} chars) exceeds limit ${maxChars}]`;
        } else {
          const remainingBudget = Math.max(0, maxChars - prefix.length);
          const truncatedNotice = `\n...[diff truncated: total ${fullDiff.length} chars exceeds limit ${maxChars}. If you need context on specific truncated files, return verdict NEEDS_CONTEXT with requested_paths]`;
          const rest = fullDiff.slice(0, Math.max(0, remainingBudget - truncatedNotice.length));
          diff = prefix + rest + truncatedNotice;
        }

        metrics = {
          char_count: diff.length,
          estimated_tokens: Math.ceil(diff.length / 4),
          truncated: true,
          original_chars: fullDiff.length,
          prioritized_paths: requestedPaths
        };
      }
    } else {
      const fullDiff = git.reviewDiff();
      if (fullDiff.length <= maxChars) {
        diff = fullDiff;
        metrics = {
          char_count: fullDiff.length,
          estimated_tokens: Math.ceil(fullDiff.length / 4),
          truncated: false,
          original_chars: fullDiff.length
        };
      } else {
        const truncatedNotice = `\n...[diff truncated: total ${fullDiff.length} chars exceeds limit ${maxChars}. If you need context on specific truncated files, return verdict NEEDS_CONTEXT with requested_paths]`;
        diff = fullDiff.slice(0, Math.max(0, maxChars - truncatedNotice.length)) + truncatedNotice;
        metrics = {
          char_count: diff.length,
          estimated_tokens: Math.ceil(diff.length / 4),
          truncated: true,
          original_chars: fullDiff.length
        };
      }
    }

    return {
      approved_plan: options.approvedPlan,
      plan_reviewer_carryover: options.planReviewerCarryover,
      evidence: options.evidence,
      git_status: gitStatus,
      diff_stat: diffStat,
      changed_files: changedFiles,
      diff,
      diff_metrics: metrics,
      ...(requestedContextDiff !== undefined
        ? { requested_context_diff: requestedContextDiff }
        : {})
    };
  }
}
