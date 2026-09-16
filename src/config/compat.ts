/**
 * @fileoverview Backward-compatibility adapter for legacy uppercase configuration keys.
 * Extends camelCase {@link OrchestratorConfig} with uppercase getter aliases for legacy call sites.
 */

import type { OrchestratorConfig } from './types.js';
import { EFFECTIVE_CONFIG } from './loader.js';

/** Uppercase property names mirroring historical orchestrator configuration fields. */
export interface LegacyConfigAliases {
  readonly EXECUTOR_HARNESS: string;
  readonly REVIEWER_HARNESS: string;
  readonly MAX_PLAN_REVIEWS: number;
  readonly FINAL_PLAN_REVIEW: boolean;
  readonly MAX_EXECUTION_ATTEMPTS: number;
  readonly MAX_UNIQUE_QUESTIONS_PER_STAGE: number;
  readonly PERMISSION_MODE: OrchestratorConfig['permissionMode'];
  readonly QUALITY_CMD: string;
  readonly BRANCH_PREFIX: string;
  readonly MAX_DIFF_CHARS: number;
  readonly MAX_CONTEXT_FILE_CHARS: number;
  readonly UI_EVENT_COALESCE_MS: number;
  readonly UI_DASHBOARD_MAX_ROWS: number;
  readonly RUN_LOG_MAX_BYTES: number;
  readonly FOCUS_LOG_MAX_BYTES: number;
}

/** Effective configuration with both camelCase fields and legacy uppercase getters. */
export type CompatibleConfig = OrchestratorConfig & LegacyConfigAliases;

/**
 * Builds a configuration object that exposes legacy uppercase aliases via getters.
 *
 * @param cfg - Source orchestrator configuration (defaults to {@link EFFECTIVE_CONFIG}).
 */
export function createCompatibleConfig(
  cfg: OrchestratorConfig = EFFECTIVE_CONFIG
): CompatibleConfig {
  return {
    ...cfg,
    get EXECUTOR_HARNESS() {
      return cfg.executorHarness;
    },
    get REVIEWER_HARNESS() {
      return cfg.reviewerHarness;
    },
    get MAX_PLAN_REVIEWS() {
      return cfg.maxPlanReviews;
    },
    get FINAL_PLAN_REVIEW() {
      return cfg.finalPlanReview;
    },
    get MAX_EXECUTION_ATTEMPTS() {
      return cfg.maxExecutionAttempts;
    },
    get MAX_UNIQUE_QUESTIONS_PER_STAGE() {
      return cfg.maxUniqueQuestionsPerStage;
    },
    get PERMISSION_MODE() {
      return cfg.permissionMode;
    },
    get QUALITY_CMD() {
      return cfg.qualityCommand;
    },
    get BRANCH_PREFIX() {
      return cfg.branchPrefix;
    },
    get MAX_DIFF_CHARS() {
      return cfg.maxDiffChars;
    },
    get MAX_CONTEXT_FILE_CHARS() {
      return cfg.maxContextFileChars;
    },
    get UI_EVENT_COALESCE_MS() {
      return cfg.uiEventCoalesceMs;
    },
    get UI_DASHBOARD_MAX_ROWS() {
      return cfg.uiDashboardMaxRows;
    },
    get RUN_LOG_MAX_BYTES() {
      return cfg.runLogMaxBytes;
    },
    get FOCUS_LOG_MAX_BYTES() {
      return cfg.focusLogMaxBytes;
    }
  };
}

/** Process-wide configuration with legacy uppercase alias getters for existing imports. */
export const CONFIG: CompatibleConfig = createCompatibleConfig(EFFECTIVE_CONFIG);
