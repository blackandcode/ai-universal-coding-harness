/**
 * @fileoverview Domain configuration types for AI Universal Coding Harness.
 * Defines authoritative camelCase OrchestratorConfig, harness configs, and config source manifests.
 */

import type { PermissionMode } from '../types.js';

/**
 * Mapping of harness IDs to their harness-specific configuration records.
 */
export interface HarnessConfigMap {
  [key: string]: Record<string, unknown> | undefined;
}

/**
 * Authoritative strongly-typed configuration schema for the orchestrator.
 */
export interface OrchestratorConfig {
  executorHarness: string;
  reviewerHarness: string;
  maxPlanReviews: number;
  finalPlanReview: boolean;
  maxExecutionAttempts: number;
  maxUniqueQuestionsPerStage: number;
  permissionMode: PermissionMode;
  permissionsFile: string;
  qualityCommand: string;
  branchPrefix: string;
  maxDiffChars: number;
  maxContextFileChars: number;
  uiEventCoalesceMs: number;
  uiDashboardMaxRows: number;
  runLogMaxBytes: number;
  focusLogMaxBytes: number;
  harnesses: HarnessConfigMap;
  harnessModules: string[];
}

/**
 * Locations of configuration files loaded across global, project, and local scopes.
 */
export interface ConfigSources {
  global: string;
  legacyProject: string;
  project: string;
  projectLocal: string;
}

/**
 * Complete summary of configuration resolution for diagnostic inspection.
 */
export interface ConfigSummary {
  projectRoot: string;
  paths: ConfigSources;
  effective: OrchestratorConfig;
}
