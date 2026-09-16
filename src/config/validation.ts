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
  const rawPlanReviews = Number(c.maxPlanReviews);
  c.maxPlanReviews = Number.isFinite(rawPlanReviews)
    ? Math.max(1, Math.min(10, rawPlanReviews))
    : 3;

  const rawExecutionAttempts = Number(c.maxExecutionAttempts);
  c.maxExecutionAttempts = Number.isFinite(rawExecutionAttempts)
    ? Math.max(1, Math.min(10, rawExecutionAttempts))
    : 3;

  const rawQuestions = Number(c.maxUniqueQuestionsPerStage);
  c.maxUniqueQuestionsPerStage = Number.isFinite(rawQuestions) ? Math.max(1, rawQuestions) : 25;

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
      ...((rawReviewer?.primary?.binary ?? baseReviewer?.primary?.binary)
        ? { binary: String(rawReviewer?.primary?.binary ?? baseReviewer?.primary?.binary) }
        : {}),
      reasoningEffort:
        rawReviewer?.primary?.reasoningEffort ?? baseReviewer?.primary?.reasoningEffort ?? 'medium',
      verbosity: rawReviewer?.primary?.verbosity ?? baseReviewer?.primary?.verbosity ?? 'low',
      timeoutMinutes: Math.max(
        1,
        Number(rawReviewer?.primary?.timeoutMinutes ?? baseReviewer?.primary?.timeoutMinutes ?? 8)
      ),
      ...(rawReviewer?.primary?.timeoutSeconds !== undefined ||
      baseReviewer?.primary?.timeoutSeconds !== undefined
        ? {
            timeoutSeconds: Math.max(
              1,
              Number(rawReviewer?.primary?.timeoutSeconds ?? baseReviewer?.primary?.timeoutSeconds)
            )
          }
        : {}),
      ...((rawReviewer?.primary?.thinking ?? baseReviewer?.primary?.thinking)
        ? { thinking: rawReviewer?.primary?.thinking ?? baseReviewer?.primary?.thinking }
        : {}),
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
      ...((rawReviewer?.fallback?.binary ?? baseReviewer?.fallback?.binary)
        ? { binary: String(rawReviewer?.fallback?.binary ?? baseReviewer?.fallback?.binary) }
        : {}),
      thinking: rawReviewer?.fallback?.thinking ?? baseReviewer?.fallback?.thinking ?? 'high',
      ...((rawReviewer?.fallback?.reasoningEffort ?? baseReviewer?.fallback?.reasoningEffort)
        ? {
            reasoningEffort:
              rawReviewer?.fallback?.reasoningEffort ?? baseReviewer?.fallback?.reasoningEffort
          }
        : {}),
      ...((rawReviewer?.fallback?.verbosity ?? baseReviewer?.fallback?.verbosity)
        ? { verbosity: rawReviewer?.fallback?.verbosity ?? baseReviewer?.fallback?.verbosity }
        : {}),
      triggers: fallbackTriggers.length > 0 ? fallbackTriggers : DEFAULT_FALLBACK_TRIGGERS,
      timeoutMinutes: Math.max(
        1,
        Number(rawReviewer?.fallback?.timeoutMinutes ?? baseReviewer?.fallback?.timeoutMinutes ?? 8)
      ),
      ...(rawReviewer?.fallback?.timeoutSeconds !== undefined ||
      baseReviewer?.fallback?.timeoutSeconds !== undefined
        ? {
            timeoutSeconds: Math.max(
              1,
              Number(
                rawReviewer?.fallback?.timeoutSeconds ?? baseReviewer?.fallback?.timeoutSeconds
              )
            )
          }
        : {}),
      ...((rawReviewer?.fallback?.contextMode ?? baseReviewer?.fallback?.contextMode)
        ? { contextMode: rawReviewer?.fallback?.contextMode ?? baseReviewer?.fallback?.contextMode }
        : {})
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
      ...((rawReviewer?.largeDiff?.binary ?? baseReviewer?.largeDiff?.binary)
        ? { binary: String(rawReviewer?.largeDiff?.binary ?? baseReviewer?.largeDiff?.binary) }
        : {}),
      thinking: rawReviewer?.largeDiff?.thinking ?? baseReviewer?.largeDiff?.thinking ?? 'high',
      ...((rawReviewer?.largeDiff?.reasoningEffort ?? baseReviewer?.largeDiff?.reasoningEffort)
        ? {
            reasoningEffort:
              rawReviewer?.largeDiff?.reasoningEffort ?? baseReviewer?.largeDiff?.reasoningEffort
          }
        : {}),
      ...((rawReviewer?.largeDiff?.verbosity ?? baseReviewer?.largeDiff?.verbosity)
        ? { verbosity: rawReviewer?.largeDiff?.verbosity ?? baseReviewer?.largeDiff?.verbosity }
        : {}),
      timeoutMinutes: Math.max(
        1,
        Number(
          rawReviewer?.largeDiff?.timeoutMinutes ?? baseReviewer?.largeDiff?.timeoutMinutes ?? 10
        )
      ),
      ...(rawReviewer?.largeDiff?.timeoutSeconds !== undefined ||
      baseReviewer?.largeDiff?.timeoutSeconds !== undefined
        ? {
            timeoutSeconds: Math.max(
              1,
              Number(
                rawReviewer?.largeDiff?.timeoutSeconds ?? baseReviewer?.largeDiff?.timeoutSeconds
              )
            )
          }
        : {}),
      ...((rawReviewer?.largeDiff?.contextMode ?? baseReviewer?.largeDiff?.contextMode)
        ? {
            contextMode: rawReviewer?.largeDiff?.contextMode ?? baseReviewer?.largeDiff?.contextMode
          }
        : {})
    },
    permission: {
      harness: String(
        rawReviewer?.permission?.harness ?? baseReviewer?.permission?.harness ?? 'cursor'
      ),
      model: String(
        rawReviewer?.permission?.model ?? baseReviewer?.permission?.model ?? 'composer-2.5-fast'
      ),
      ...((rawReviewer?.permission?.binary ?? baseReviewer?.permission?.binary)
        ? { binary: String(rawReviewer?.permission?.binary ?? baseReviewer?.permission?.binary) }
        : {}),
      thinking: rawReviewer?.permission?.thinking ?? baseReviewer?.permission?.thinking ?? 'low',
      reasoningEffort:
        rawReviewer?.permission?.reasoningEffort ??
        baseReviewer?.permission?.reasoningEffort ??
        'low',
      ...((rawReviewer?.permission?.verbosity ?? baseReviewer?.permission?.verbosity)
        ? { verbosity: rawReviewer?.permission?.verbosity ?? baseReviewer?.permission?.verbosity }
        : {}),
      ...(rawReviewer?.permission?.timeoutMinutes !== undefined ||
      baseReviewer?.permission?.timeoutMinutes !== undefined
        ? {
            timeoutMinutes: Math.max(
              1,
              Number(
                rawReviewer?.permission?.timeoutMinutes ?? baseReviewer?.permission?.timeoutMinutes
              )
            )
          }
        : {}),
      timeoutSeconds: Math.max(
        5,
        Number(
          rawReviewer?.permission?.timeoutSeconds ?? baseReviewer?.permission?.timeoutSeconds ?? 30
        )
      ),
      ...((rawReviewer?.permission?.contextMode ?? baseReviewer?.permission?.contextMode)
        ? {
            contextMode:
              rawReviewer?.permission?.contextMode ?? baseReviewer?.permission?.contextMode
          }
        : {})
    }
  };

  return c;
}
