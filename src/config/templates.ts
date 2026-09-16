/**
 * @fileoverview Default configuration and permission file templates for initialization.
 * Generates annotated JSONC templates for global config, project overrides, and permissions.
 */

/**
 * Generates the default global configuration JSONC template.
 */
export function configTemplate(): string {
  return `// AI Universal Coding Harness configuration
// Precedence: CLI > AI_HARNESS_* env > .ai-orchestrator/config.jsonc > .ai-universal-coding-harness.jsonc > global > defaults.
{
  "executorHarness": "cursor",
  "reviewerHarness": "codex",
  "permissionMode": "auto_safe",
  "qualityCommand": "npm run check",
  "branchPrefix": "ai-harness",
  "maxPlanReviews": 3,
  "finalPlanReview": true,
  "maxExecutionAttempts": 3,
  "maxUniqueQuestionsPerStage": 25,
  "maxDiffChars": 800000,
  "maxContextFileChars": 40000,
  "uiEventCoalesceMs": 80,
  "uiDashboardMaxRows": 26,
  "runLogMaxBytes": 20971520,
  "focusLogMaxBytes": 10485760,
  "harnessModules": [],
  "reviewer": {
    "primary": {
      "harness": "codex",
      "model": "gpt-6-astra",
      "reasoningEffort": "medium",
      "verbosity": "low",
      "timeoutMinutes": 8,
      "contextMode": "evidence_only"
    },
    "fallback": {
      "enabled": true,
      "harness": "cursor",
      "model": "gemini-3.8-flash",
      "thinking": "high",
      "timeoutMinutes": 8,
      "triggers": [
        "usage_limit",
        "rate_limit",
        "quota_exhausted",
        "no_result",
        "process_crash",
        "timeout",
        "turn_failed"
      ]
    },
    "largeDiff": {
      "thresholdChars": 300000,
      "harness": "cursor",
      "model": "gemini-3.8-flash",
      "thinking": "high",
      "timeoutMinutes": 10
    },
    "permission": {
      "harness": "cursor",
      "model": "composer-2.5-fast",
      "thinking": "low",
      "reasoningEffort": "low",
      "timeoutSeconds": 30
    }
  },
  "harnesses": {
    "cursor": {
      "binary": "agent",
      "model": "gemini-3.8-flash",
      "thinking": "high",
      "turnTimeoutMinutes": 45
    },
    "codex": {
      "binary": "codex",
      "model": "gpt-6-astra"
      // Global fallback defaults when omitted by reviewer roles:
      // "reasoningEffort": "low",
      // "verbosity": "low",
      // "timeoutMinutes": 8,
      // "contextMode": "evidence_only"
    }
  }
}
`;
}

/**
 * Generates the local `.ai-orchestrator/config.jsonc` placeholder with commented overrides.
 */
export function projectPlaceholderConfigTemplate(): string {
  return `// Local project overrides for AI Universal Coding Harness.
// This file lives under .ai-orchestrator and is intentionally local/untracked.
// Uncomment only what this repository needs. Package defaults apply for omitted values.
{
  "harnessModules": [],
  // "executorHarness": "cursor",
  // "reviewerHarness": "codex",
  // "permissionMode": "auto_safe",
  // "permissionsFile": ".ai-orchestrator/permissions.jsonc",
  // "qualityCommand": "npm run check",
  // "branchPrefix": "ai-harness",
  // "maxPlanReviews": 3,
  // "finalPlanReview": true,
  // "maxExecutionAttempts": 3,
  // "maxUniqueQuestionsPerStage": 25,
  // "maxDiffChars": 800000,
  // "maxContextFileChars": 40000,
  // "uiEventCoalesceMs": 80,
  // "uiDashboardMaxRows": 26,
  // "runLogMaxBytes": 20971520,
  // "focusLogMaxBytes": 10485760,
  // "harnessModules": [],
  // "reviewer": {
  //   "primary": {
  //     "harness": "codex",
  //     "model": "gpt-6-astra",
  //     "reasoningEffort": "medium",
  //     "verbosity": "low",
  //     "timeoutMinutes": 8,
  //     "contextMode": "evidence_only"
  //   },
  //   "fallback": {
  //     "enabled": true,
  //     "harness": "cursor",
  //     "model": "gemini-3.8-flash",
  //     "thinking": "high",
  //     "timeoutMinutes": 8,
  //     "triggers": [
  //       "usage_limit",
  //       "rate_limit",
  //       "quota_exhausted",
  //       "no_result",
  //       "process_crash",
  //       "timeout",
  //       "turn_failed"
  //     ]
  //   },
  //   "largeDiff": {
  //     "thresholdChars": 300000,
  //     "harness": "cursor",
  //     "model": "gemini-3.8-flash",
  //     "thinking": "high",
  //     "timeoutMinutes": 10
  //   },
  //   "permission": {
  //     "harness": "cursor",
  //     "model": "composer-2.5-fast",
  //     "thinking": "low",
  //     "reasoningEffort": "low",
  //     "timeoutSeconds": 30
  //   }
  // },
  // "harnesses": {
  //   "cursor": {
  //     "binary": "agent",
  //     "model": "gemini-3.8-flash",
  //     "thinking": "high",
  //     "turnTimeoutMinutes": 45
  //   },
  //   "codex": {
  //     "binary": "codex",
  //     "model": "gpt-6-astra",
  //     "reasoningEffort": "low",
  //     "verbosity": "low",
  //     "timeoutMinutes": 8,
  //     "contextMode": "evidence_only"
  //   }
  // }
}
`;
}

/**
 * Generates the default project permissions JSONC template for terminal allow/deny lists.
 */
export function projectPermissionsTemplate(): string {
  return `// Local permission overrides. Used automatically when this file exists.
// Keep this list narrow. Unknown/risky commands are routed through the reviewer.
{
  "terminalAllowlist": [
    // "npm run check",
    // "npm test",
    // "git status",
    // "git diff"
  ],
  "terminalDenylist": [
    // Add repository-specific commands that must always be denied.
  ]
}
`;
}
