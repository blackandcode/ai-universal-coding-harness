/**
 * @fileoverview Domain configuration types for AI Universal Coding Harness.
 *
 * Defines the authoritative camelCase {@link OrchestratorConfig} contract,
 * per-harness options maps, and multi-tier configuration source manifests.
 *
 * @remarks
 * Configuration resolution follows strict precedence:
 * CLI flags > Environment variables (`AI_HARNESS_*`) > Project-local (`.ai-orchestrator/config.jsonc`)
 * > Project-tracked (`.ai-harness/config.jsonc`) > Global user config (`~/.config/ai-harness/config.jsonc`)
 * > Built-in defaults (`DEFAULT_CONFIG`).
 */

import type { PermissionMode } from '../types.js';
import type { ReviewerRouterConfig } from '../harness/types.js';

/**
 * Mapping of harness IDs (e.g. `'cursor'`, `'codex'`) to arbitrary harness-specific configuration records.
 */
export interface HarnessConfigMap {
  [key: string]: Record<string, unknown> | undefined;
}

/**
 * Authoritative strongly-typed configuration schema governing orchestration runs.
 */
export interface OrchestratorConfig {
  /** Identifier of the default executor harness adapter (e.g. `'cursor'`). */
  executorHarness: string;
  /** Identifier of the default reviewer harness adapter (e.g. `'codex'`). */
  reviewerHarness: string;
  /** Multi-tier reviewer routing configuration for primary, fallback, large-diff, and permission models. */
  reviewer?: ReviewerRouterConfig;
  /** Maximum number of plan review rounds permitted before forcing carryover consolidation. */
  maxPlanReviews: number;
  /** Whether to perform a final plan consolidation review if regular reviews are exhausted. */
  finalPlanReview: boolean;
  /** Maximum implementation/review attempts permitted per stage before marking the stage failed. */
  maxExecutionAttempts: number;
  /** Budget limit on unique blocking questions an executor may ask per stage. */
  maxUniqueQuestionsPerStage: number;
  /** Autonomous permission classification policy (`'auto_safe'`, `'allow_all'`, `'allowlist'`, `'ask_reviewer'`). */
  permissionMode: PermissionMode;
  /** Relative or absolute path to the JSONC permissions definition file. */
  permissionsFile: string;
  /** Default command executed by the executor to verify implementation quality and test suites. */
  qualityCommand: string;
  /** Git branch prefix used when naming dedicated AI run branches (e.g. `'ai'`). */
  branchPrefix: string;
  /** Character threshold beyond which Git diffs are truncated or routed to a large-diff reviewer. */
  maxDiffChars: number;
  /** Character limit applied when packing context files into review prompts. */
  maxContextFileChars: number;
  /** Millisecond debounce window for coalescing high-frequency UI events. */
  uiEventCoalesceMs: number;
  /** Maximum rows displayed in terminal dashboard panels. */
  uiDashboardMaxRows: number;
  /** Maximum byte size of `run.log` before rotation is triggered. */
  runLogMaxBytes: number;
  /** Maximum byte size of `focus.log` before rotation is triggered. */
  focusLogMaxBytes: number;
  /** Per-harness arbitrary configuration records indexed by harness identifier. */
  harnesses: HarnessConfigMap;
  /** List of external package names or file paths to dynamically load as harness plugins. */
  harnessModules: string[];
}

/**
 * Absolute filesystem locations of configuration files inspected across resolution tiers.
 */
export interface ConfigSources {
  /** User-global configuration path in user config home. */
  global: string;
  /** Legacy project config path checked for backward compatibility. */
  legacyProject: string;
  /** Version-controlled project configuration path. */
  project: string;
  /** Local untracked project configuration path. */
  projectLocal: string;
}

/**
 * Diagnostic summary of configuration resolution paths and computed effective settings.
 */
export interface ConfigSummary {
  /** Detected project root directory. */
  projectRoot: string;
  /** Resolved configuration file paths across all tiers. */
  paths: ConfigSources;
  /** Fully merged effective configuration object. */
  effective: OrchestratorConfig;
}
