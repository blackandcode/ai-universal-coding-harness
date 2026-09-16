/**
 * @fileoverview Configuration validation and normalization.
 * Validates untrusted configuration structures, enforces numeric bounds, and resolves permission files.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { OrchestratorConfig } from './types.js';
import type { ReviewerFallbackTrigger, ReviewerRouterConfig } from '../harness/types.js';
import { defaultPermissionsPath, projectLocalPermissionsPath, PROJECT_ROOT } from './paths.js';
import { ConfigError } from '../errors.js';

const VALID_PERMISSION_MODES: ReadonlySet<string> = new Set([
  'auto_safe',
  'allow_all',
  'allowlist',
  'ask_reviewer'
]);

const VALID_FALLBACK_TRIGGERS: ReadonlySet<ReviewerFallbackTrigger> = new Set([
  'usage_limit',
  'rate_limit',
  'quota_exhausted',
  'no_result',
  'process_crash',
  'timeout',
  'turn_failed'
]);

const DEFAULT_FALLBACK_TRIGGERS: ReviewerFallbackTrigger[] = [
  'usage_limit',
  'rate_limit',
  'quota_exhausted',
  'no_result',
  'process_crash',
  'timeout',
  'turn_failed'
];

/**
 * Validates merged untrusted configuration, clamps numeric bounds, and normalizes nested reviewer settings.
 *
 * @remarks
 * External configuration enters as `unknown`. This function:
 * - Clamps `maxPlanReviews` to [1, 10] and `maxExecutionAttempts` to [1, 10].
 * - Enforces supported `permissionMode` enums, falling back to `'auto_safe'`.
 * - Resolves relative `permissionsFile` paths against `projectRoot`.
 * - Populates default multi-tier reviewer settings for primary, fallback, largeDiff, and permission roles.
 *
 * @param raw - Untrusted merged configuration object from layered sources.
 * @param base - Default baseline configuration used for fallbacks and reviewer defaults.
 * @param projectRoot - Target repository root for resolving relative permission file paths.
 * @returns Normalized and validated domain {@link OrchestratorConfig}.
 * @throws {@link ConfigError}
 * Thrown when the top-level configuration layer is not a valid object.
 */
export function validateAndNormalizeConfig(
  raw: unknown,
  base: OrchestratorConfig,
  projectRoot = PROJECT_ROOT
): OrchestratorConfig {
  if (raw !== null && typeof raw !== 'object') {
    throw new ConfigError('Configuration layer must be an object');
  }

  const c = { ...base, ...(raw as Record<string, unknown>) } as OrchestratorConfig;

  // Clamp numeric bounds
  c.maxPlanReviews = Math.max(1, Math.min(10, Number(c.maxPlanReviews) || 3));
  c.maxExecutionAttempts = Math.max(1, Math.min(10, Number(c.maxExecutionAttempts) || 3));
  c.maxUniqueQuestionsPerStage = Math.max(1, Number(c.maxUniqueQuestionsPerStage) || 25);

  // Permission mode
  if (!VALID_PERMISSION_MODES.has(c.permissionMode)) {
    c.permissionMode = 'auto_safe';
  }

  // Harness modules
  c.harnessModules = Array.isArray(c.harnessModules) ? c.harnessModules.map(String) : [];

  // Permissions file resolution
  if (c.permissionsFile) {
    c.permissionsFile = path.isAbsolute(c.permissionsFile)
      ? c.permissionsFile
      : path.resolve(projectRoot, c.permissionsFile);
  } else {
    const localPerms = projectLocalPermissionsPath(projectRoot);
    c.permissionsFile = fs.existsSync(localPerms) ? localPerms : defaultPermissionsPath();
  }

  // Reviewer router configuration
  const rawReviewer = (raw as Record<string, unknown> | null)?.reviewer as
    | Partial<ReviewerRouterConfig>
    | undefined;
  const baseReviewer = base.reviewer;

  const primaryHarness = String(
    rawReviewer?.primary?.harness ??
      (c.reviewerHarness !== base.reviewerHarness ? c.reviewerHarness : undefined) ??
      baseReviewer?.primary?.harness ??
      c.reviewerHarness ??
      'codex'
  );
  const primaryModel = String(
    rawReviewer?.primary?.model ?? baseReviewer?.primary?.model ?? 'gpt-6-astra'
  );

  const fallbackTriggers = Array.isArray(rawReviewer?.fallback?.triggers)
    ? rawReviewer.fallback.triggers.filter((t): t is ReviewerFallbackTrigger =>
        VALID_FALLBACK_TRIGGERS.has(t as ReviewerFallbackTrigger)
      )
    : (baseReviewer?.fallback?.triggers ?? DEFAULT_FALLBACK_TRIGGERS);

  c.reviewer = {
    primary: {
      harness: primaryHarness,
      model: primaryModel,
      reasoningEffort:
        rawReviewer?.primary?.reasoningEffort ?? baseReviewer?.primary?.reasoningEffort ?? 'medium',
      verbosity: rawReviewer?.primary?.verbosity ?? baseReviewer?.primary?.verbosity ?? 'low',
      timeoutMinutes: Math.max(
        1,
        Number(rawReviewer?.primary?.timeoutMinutes ?? baseReviewer?.primary?.timeoutMinutes ?? 8)
      ),
      contextMode:
        rawReviewer?.primary?.contextMode ?? baseReviewer?.primary?.contextMode ?? 'evidence_only'
    },
    fallback: {
      enabled:
        typeof rawReviewer?.fallback?.enabled === 'boolean'
          ? rawReviewer.fallback.enabled
          : (baseReviewer?.fallback?.enabled ?? true),
      harness: String(
        rawReviewer?.fallback?.harness ?? baseReviewer?.fallback?.harness ?? 'cursor'
      ),
      model: String(
        rawReviewer?.fallback?.model ?? baseReviewer?.fallback?.model ?? 'gemini-3.8-flash'
      ),
      thinking: rawReviewer?.fallback?.thinking ?? baseReviewer?.fallback?.thinking ?? 'high',
      triggers: fallbackTriggers.length > 0 ? fallbackTriggers : DEFAULT_FALLBACK_TRIGGERS,
      timeoutMinutes: Math.max(
        1,
        Number(rawReviewer?.fallback?.timeoutMinutes ?? baseReviewer?.fallback?.timeoutMinutes ?? 8)
      )
    },
    largeDiff: {
      thresholdChars: Math.max(
        1000,
        Number(
          rawReviewer?.largeDiff?.thresholdChars ??
            baseReviewer?.largeDiff?.thresholdChars ??
            300000
        )
      ),
      harness: String(
        rawReviewer?.largeDiff?.harness ?? baseReviewer?.largeDiff?.harness ?? 'cursor'
      ),
      model: String(
        rawReviewer?.largeDiff?.model ?? baseReviewer?.largeDiff?.model ?? 'gemini-3.8-flash'
      ),
      thinking: rawReviewer?.largeDiff?.thinking ?? baseReviewer?.largeDiff?.thinking ?? 'high',
      timeoutMinutes: Math.max(
        1,
        Number(
          rawReviewer?.largeDiff?.timeoutMinutes ?? baseReviewer?.largeDiff?.timeoutMinutes ?? 10
        )
      )
    },
    permission: {
      harness: String(
        rawReviewer?.permission?.harness ?? baseReviewer?.permission?.harness ?? 'cursor'
      ),
      model: String(
        rawReviewer?.permission?.model ?? baseReviewer?.permission?.model ?? 'composer-2.5-fast'
      ),
      thinking: rawReviewer?.permission?.thinking ?? baseReviewer?.permission?.thinking ?? 'low',
      reasoningEffort:
        rawReviewer?.permission?.reasoningEffort ??
        baseReviewer?.permission?.reasoningEffort ??
        'low',
      timeoutSeconds: Math.max(
        5,
        Number(
          rawReviewer?.permission?.timeoutSeconds ?? baseReviewer?.permission?.timeoutSeconds ?? 30
        )
      )
    }
  };

  return c;
}
