/**
 * @fileoverview Default configuration and permission file templates for initialization.
 * Generates annotated JSONC templates for global config, project overrides, and permissions.
 */

/**
 * Generates the default global configuration JSONC template.
 */
export function configTemplate(): string {
  return `// AI Universal Coding Harness configuration\n// Precedence: CLI > AI_HARNESS_* env > .ai-orchestrator/config.jsonc > .ai-universal-coding-harness.jsonc > global > defaults.\n{\n  "executorHarness": "cursor",\n  "reviewerHarness": "codex",\n  "permissionMode": "auto_safe",\n  "qualityCommand": "npm run check",\n  "branchPrefix": "ai-harness",\n  "maxPlanReviews": 3,\n  "finalPlanReview": true,\n  "maxExecutionAttempts": 3,\n  "harnesses": {\n    "cursor": {\n      "binary": "agent",\n      "model": "gemini-3.8-flash",\n      "thinking": "high",\n      "turnTimeoutMinutes": 45,\n    },\n    "codex": {\n      "binary": "codex",\n      "model": "gpt-6-astra",\n      "reasoningEffort": "low",\n      "verbosity": "low",\n      "timeoutMinutes": 8,\n      "contextMode": "evidence_only",\n    },\n  },\n}\n`;
}

export function projectPlaceholderConfigTemplate(): string {
  return `// Local project overrides for AI Universal Coding Harness.\n// This file lives under .ai-orchestrator and is intentionally local/untracked.\n// Uncomment only what this repository needs. Package defaults apply for omitted values.\n{\n  // "executorHarness": "cursor",\n  // "reviewerHarness": "codex",\n  // "permissionMode": "auto_safe",\n  // "qualityCommand": "npm run check",\n  // "branchPrefix": "ai-harness",\n  // "maxPlanReviews": 3,\n  // "finalPlanReview": true,\n  // "maxExecutionAttempts": 3,\n  // "harnessModules": [],\n  // "harnesses": {\n  //   "cursor": { "model": "gemini-3.8-flash", "thinking": "high" },\n  //   "codex": { "model": "gpt-6-astra", "reasoningEffort": "low" }\n  // }\n}\n`;
}

export function projectPermissionsTemplate(): string {
  return `// Local permission overrides. Used automatically when this file exists.\n// Keep this list narrow. Unknown/risky commands are routed through the reviewer.\n{\n  "terminalAllowlist": [\n    // "npm run check",\n    // "npm test",\n    // "git status",\n    // "git diff"\n  ],\n  "terminalDenylist": [\n    // Add repository-specific commands that must always be denied.\n  ]\n}\n`;
}
