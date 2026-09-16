/**
 * @fileoverview ReviewerRouter coordinates multi-tier reviewer dispatch and automatic fallback failover.
 *
 * Implements the ReviewerHarness contract, dynamically selecting primary, fallback,
 * largeDiff, and permission reviewer models based on request type and diff metrics.
 * Intercepts provider and infrastructure failures, classifies errors, emits telemetry,
 * and seamlessly fails over to backup reviewers with provenance metadata annotations.
 */

import type {
  ReviewerHarness,
  HarnessInfo,
  HarnessPreflightResult,
  ReviewerRole,
  ReviewerRouterConfig,
  ReviewerFallbackMetadata,
  ReviewerFallbackTrigger,
  PlanReviewInput,
  QuestionReviewInput,
  PermissionReviewInput,
  FinalReviewInput
} from '../../harness/types.js';
import type {
  PlanReviewVerdict,
  QuestionVerdict,
  PermissionVerdict,
  FinalVerdict,
  HarnessContext
} from '../../types.js';
import { HarnessRegistry } from '../../harness/registry.js';
import { ReviewerErrorClassifier } from '../../harness/ReviewerErrorClassifier.js';
import type { EventBus } from '../../ui/EventBus.js';

/**
 * Options configuring {@link ReviewerRouter} role tiers, adapter registry, and context.
 */
export interface ReviewerRouterOptions {
  /** Authoritative reviewer router configuration defining primary, fallback, largeDiff, and permission models. */
  config: ReviewerRouterConfig;
  /** Harness registry used to resolve adapter instances (defaults to new instance). */
  registry?: HarnessRegistry;
  /** Ambient harness context including workspace paths, stage specifications, and logs. */
  context?: HarnessContext;
  /** Optional event bus for emitting telemetry and fallback notification events. */
  events?: EventBus;
}

/**
 * Multi-tier reviewer harness router providing dynamic model routing and automatic fallback failover.
 *
 * @remarks
 * Invariants:
 * - Implements {@link ReviewerHarness} so the orchestrator interacts with a single unified reviewer contract.
 * - Routes permission reviews to fast, lightweight models.
 * - Routes unified diffs exceeding size thresholds to large-context models.
 * - Catches provider failures (rate limits, usage exhaustion, crashes, timeouts) and transparently
 *   retries using configured fallback models, persisting audit metadata.
 */
export class ReviewerRouter implements ReviewerHarness {
  readonly config: ReviewerRouterConfig;
  private readonly registry: HarnessRegistry;
  private readonly baseContext: HarnessContext;
  private readonly events?: EventBus;
  private readonly harnessCache = new Map<ReviewerRole, ReviewerHarness>();

  info: HarnessInfo;

  /**
   * @param options - Router tiers, registry, harness context, and optional telemetry bus.
   */
  constructor(options: ReviewerRouterOptions) {
    this.config = options.config;
    this.registry = options.registry || new HarnessRegistry();
    this.baseContext = options.context || {};
    this.events = options.events;

    this.info = {
      id: 'reviewer-router',
      label: `ReviewerRouter (${this.config.primary.model} -> ${this.config.fallback.model})`,
      role: 'reviewer',
      model: this.config.primary.model
    };
  }

  /**
   * Resolves or creates a cached ReviewerHarness instance configured for the specified role.
   *
   * @param role - Target reviewer role ('primary' | 'fallback' | 'large_diff' | 'permission')
   * @returns Configured ReviewerHarness adapter
   */
  resolveHarness(role: ReviewerRole): ReviewerHarness {
    const cached = this.harnessCache.get(role);
    if (cached) return cached;

    const roleConfig =
      role === 'primary'
        ? this.config.primary
        : role === 'fallback'
          ? this.config.fallback
          : role === 'large_diff'
            ? this.config.largeDiff
            : this.config.permission;

    const mergedContext: HarnessContext = {
      ...this.baseContext,
      reviewerModel: roleConfig.model,
      reviewerBinary: roleConfig.binary,
      thinking: roleConfig.thinking,
      reasoningEffort: roleConfig.reasoningEffort,
      timeoutMinutes: roleConfig.timeoutMinutes,
      timeoutSeconds: roleConfig.timeoutSeconds
    };

    const harness = this.registry.reviewer(roleConfig.harness, mergedContext);
    this.harnessCache.set(role, harness);
    return harness;
  }

  /**
   * Preflights all active reviewer role adapters, returning composite diagnostics.
   */
  async preflight(): Promise<HarnessPreflightResult> {
    const details: string[] = [];

    // Check primary reviewer
    const primary = this.resolveHarness('primary');
    const primaryPreflight = await primary.preflight();
    details.push(`[primary:${primary.info.id}] ${primaryPreflight.details.join('; ')}`);

    // Check fallback reviewer if enabled
    let fallbackOk = false;
    if (this.config.fallback.enabled) {
      const fallback = this.resolveHarness('fallback');
      const fallbackPreflight = await fallback.preflight();
      details.push(`[fallback:${fallback.info.id}] ${fallbackPreflight.details.join('; ')}`);
      fallbackOk = fallbackPreflight.ok;
    }

    // Check large_diff reviewer
    const largeDiff = this.resolveHarness('large_diff');
    const largeDiffPreflight = await largeDiff.preflight();
    details.push(`[large_diff:${largeDiff.info.id}] ${largeDiffPreflight.details.join('; ')}`);

    // Check permission reviewer
    const perm = this.resolveHarness('permission');
    const permPreflight = await perm.preflight();
    details.push(`[permission:${perm.info.id}] ${permPreflight.details.join('; ')}`);

    // Primary adapter readiness determines baseline, or fallback readiness when failover is enabled
    const allOk = primaryPreflight.ok || (this.config.fallback.enabled && fallbackOk);

    return {
      ok: allOk,
      details
    };
  }

  /**
   * Executes a reviewer operation with automatic failover to the configured fallback adapter
   * when recognizable trigger conditions are detected.
   */
  private async executeWithFallback<T>(
    role: ReviewerRole,
    kind: string,
    executeFn: (harness: ReviewerHarness) => Promise<T>
  ): Promise<T> {
    const primaryHarness = this.resolveHarness(role);
    try {
      return await executeFn(primaryHarness);
    } catch (err: unknown) {
      if (!this.config.fallback.enabled || role === 'fallback') {
        throw err;
      }

      const classification = ReviewerErrorClassifier.classifyError(err, primaryHarness.info);
      if (
        classification.isTrigger &&
        classification.trigger &&
        this.config.fallback.triggers.includes(classification.trigger)
      ) {
        const fallbackHarness = this.resolveHarness('fallback');

        this.events?.emit('reviewer.fallback', {
          stage: this.baseContext.stageName,
          attempt: this.baseContext.attempt,
          decision_type: kind,
          failed_harness: primaryHarness.info.id,
          failed_model: primaryHarness.info.model,
          trigger: classification.trigger,
          fallback_harness: fallbackHarness.info.id,
          fallback_model: fallbackHarness.info.model,
          reason: classification.reason
        });

        const fallbackResult = await executeFn(fallbackHarness);
        this.annotateResult(
          fallbackResult,
          primaryHarness.info,
          fallbackHarness.info,
          classification.trigger,
          classification.reason
        );
        return fallbackResult;
      }

      throw err;
    }
  }

  /**
   * Attaches provenance metadata to a verdict generated by a fallback reviewer.
   */
  private annotateResult(
    result: unknown,
    failedInfo: HarnessInfo,
    fallbackInfo: HarnessInfo,
    trigger: ReviewerFallbackTrigger,
    originalError: string
  ): void {
    if (result && typeof result === 'object') {
      const meta: ReviewerFallbackMetadata = {
        executed_by: `${fallbackInfo.id}:${fallbackInfo.model}`,
        fallback_from: `${failedInfo.id}:${failedInfo.model}`,
        trigger,
        original_error: originalError,
        timestamp: new Date().toISOString()
      };
      (result as Record<string, unknown>)._orchestrator_meta = meta;
    }
  }

  /**
   * Evaluates an implementation plan using the primary reviewer (with fallback support).
   */
  async reviewPlan(
    input: PlanReviewInput,
    opts?: { finalConsolidation?: boolean }
  ): Promise<PlanReviewVerdict> {
    return this.executeWithFallback('primary', 'plan-review', (harness) =>
      harness.reviewPlan(input, opts)
    );
  }

  /**
   * Answers executor questions using the primary reviewer (with fallback support).
   */
  async answerQuestions(input: QuestionReviewInput): Promise<QuestionVerdict> {
    return this.executeWithFallback('primary', 'question', (harness) =>
      harness.answerQuestions(input)
    );
  }

  /**
   * Evaluates command permissions referred by the permission engine using the fast permission reviewer.
   */
  async decidePermission(input: PermissionReviewInput): Promise<PermissionVerdict> {
    return this.executeWithFallback('permission', 'permission', (harness) =>
      harness.decidePermission(input)
    );
  }

  /**
   * Performs final code review against git diff and evidence.
   * Dynamically selects large_diff reviewer if diff exceeds thresholdChars, otherwise primary reviewer.
   */
  async reviewImplementation(input: FinalReviewInput): Promise<FinalVerdict> {
    const diffLength = typeof input.diff === 'string' ? input.diff.length : 0;
    const isLargeDiff = diffLength > this.config.largeDiff.thresholdChars;
    const targetRole: ReviewerRole = isLargeDiff ? 'large_diff' : 'primary';

    return this.executeWithFallback(targetRole, 'final-review', (harness) =>
      harness.reviewImplementation(input)
    );
  }
}
