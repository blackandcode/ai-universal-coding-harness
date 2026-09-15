/**
 * @fileoverview Default configuration values for AI Universal Coding Harness.
 * Provides sensible defaults for harnesses, budgets, thresholds, and quality commands.
 */

import type { OrchestratorConfig } from './types.js';

export const DEFAULT_CONFIG: OrchestratorConfig = {
  executorHarness: 'cursor',
  reviewerHarness: 'codex',
  maxPlanReviews: 3,
  finalPlanReview: true,
  maxExecutionAttempts: 3,
  maxUniqueQuestionsPerStage: 25,
  permissionMode: 'auto_safe',
  permissionsFile: '',
  qualityCommand: 'npm run check',
  branchPrefix: 'ai-harness',
  maxDiffChars: 800000,
  maxContextFileChars: 40000,
  uiEventCoalesceMs: 80,
  uiDashboardMaxRows: 26,
  runLogMaxBytes: 20 * 1024 * 1024,
  focusLogMaxBytes: 10 * 1024 * 1024,
  harnesses: {
    cursor: {
      binary: 'agent',
      model: 'gemini-3.8-flash',
      thinking: 'high',
      turnTimeoutMinutes: 45,
    },
    codex: {
      binary: 'codex',
      model: 'gpt-6-astra',
      reasoningEffort: 'low',
      verbosity: 'low',
      timeoutMinutes: 8,
      contextMode: 'evidence_only',
    },
  },
  harnessModules: [],
};
