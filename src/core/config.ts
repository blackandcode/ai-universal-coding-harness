import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, printParseErrorCode } from 'jsonc-parser';
import type { PermissionMode } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
export const DIST_DIR = path.dirname(path.dirname(__filename));
export const TOOL_DIR = path.dirname(DIST_DIR);
export const PROJECT_ROOT = path.resolve(
  process.env.AI_HARNESS_PROJECT_ROOT || process.env.AI_STAGE_PROJECT_ROOT || process.cwd(),
);

export interface HarnessConfigMap {
  [key: string]: Record<string, unknown>;
}
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

function globalConfigDir() {
  if (process.env.AI_HARNESS_CONFIG_HOME) return path.resolve(process.env.AI_HARNESS_CONFIG_HOME);
  if (process.env.AI_STAGE_CONFIG_HOME) return path.resolve(process.env.AI_STAGE_CONFIG_HOME);
  const home = os.homedir();
  if (process.platform === 'win32')
    return path.join(
      process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
      'ai-universal-coding-harness',
    );
  if (process.platform === 'darwin')
    return path.join(home, 'Library', 'Application Support', 'ai-universal-coding-harness');
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(home, '.config'),
    'ai-universal-coding-harness',
  );
}
export function globalConfigPath() {
  return path.join(globalConfigDir(), 'config.jsonc');
}
export function projectTrackedConfigPath(root = PROJECT_ROOT) {
  return path.join(root, '.ai-universal-coding-harness.jsonc');
}
export function legacyProjectTrackedConfigPath(root = PROJECT_ROOT) {
  return path.join(root, '.ai-stage-orchestrator.jsonc');
}
export function projectLocalConfigPath(root = PROJECT_ROOT) {
  return path.join(root, '.ai-orchestrator', 'config.jsonc');
}
export function projectLocalPermissionsPath(root = PROJECT_ROOT) {
  return path.join(root, '.ai-orchestrator', 'permissions.jsonc');
}
export function defaultPermissionsPath() {
  return path.join(TOOL_DIR, 'permissions.default.jsonc');
}

function readJsonc(file: string): Record<string, any> {
  if (!fs.existsSync(file)) return {};
  const errors: any[] = [];
  const value = parse(fs.readFileSync(file, 'utf8'), errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length)
    throw new Error(
      `Invalid JSONC config ${file}: ${errors.map((e) => printParseErrorCode(e.error)).join(', ')}`,
    );
  return value && typeof value === 'object' ? value : {};
}
function deepMerge<T extends Record<string, any>>(base: T, ...layers: Record<string, any>[]): T {
  const out: any = { ...base };
  for (const layer of layers)
    for (const [k, v] of Object.entries(layer || {})) {
      if (
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        out[k] &&
        typeof out[k] === 'object' &&
        !Array.isArray(out[k])
      )
        out[k] = deepMerge(out[k], v as any);
      else if (v !== undefined) out[k] = v;
    }
  return out;
}
function envLayer() {
  const e = process.env,
    out: any = {};
  const set = (key: string, ...values: (string | undefined)[]) => {
    const val = values.find((v) => v !== undefined && v !== '');
    if (val !== undefined) out[key] = val;
  };
  set('executorHarness', e.AI_HARNESS_EXECUTOR_HARNESS, e.AI_STAGE_EXECUTOR_HARNESS);
  set('reviewerHarness', e.AI_HARNESS_REVIEWER_HARNESS, e.AI_STAGE_REVIEWER_HARNESS);
  set('permissionMode', e.AI_HARNESS_PERMISSION_MODE, e.AI_STAGE_PERMISSION_MODE);
  set('permissionsFile', e.AI_HARNESS_PERMISSIONS_FILE, e.AI_STAGE_PERMISSIONS_FILE);
  set('qualityCommand', e.AI_HARNESS_QUALITY_COMMAND, e.AI_STAGE_QUALITY_COMMAND);
  set('branchPrefix', e.AI_HARNESS_BRANCH_PREFIX, e.AI_STAGE_BRANCH_PREFIX);
  const plan = e.AI_HARNESS_MAX_PLAN_REVIEWS || e.AI_STAGE_MAX_PLAN_REVIEWS;
  if (plan) out.maxPlanReviews = Number(plan);
  const attempts = e.AI_HARNESS_MAX_EXECUTION_ATTEMPTS || e.AI_STAGE_MAX_EXECUTION_ATTEMPTS;
  if (attempts) out.maxExecutionAttempts = Number(attempts);
  return out;
}
function normalize(raw: any): OrchestratorConfig {
  const c = deepMerge(DEFAULT_CONFIG, raw);
  c.maxPlanReviews = Math.max(1, Math.min(10, Number(c.maxPlanReviews) || 3));
  c.maxExecutionAttempts = Math.max(1, Math.min(10, Number(c.maxExecutionAttempts) || 3));
  c.maxUniqueQuestionsPerStage = Math.max(1, Number(c.maxUniqueQuestionsPerStage) || 25);
  if (!['auto_safe', 'allow_all', 'allowlist', 'ask_reviewer'].includes(c.permissionMode))
    c.permissionMode = 'auto_safe';
  c.harnessModules = Array.isArray(c.harnessModules) ? c.harnessModules.map(String) : [];
  if (c.permissionsFile)
    c.permissionsFile = path.isAbsolute(c.permissionsFile)
      ? c.permissionsFile
      : path.resolve(PROJECT_ROOT, c.permissionsFile);
  else
    c.permissionsFile = fs.existsSync(projectLocalPermissionsPath())
      ? projectLocalPermissionsPath()
      : defaultPermissionsPath();
  return c;
}

export const CONFIG_SOURCES = {
  global: globalConfigPath(),
  legacyProject: legacyProjectTrackedConfigPath(),
  project: projectTrackedConfigPath(),
  projectLocal: projectLocalConfigPath(),
};
const EFFECTIVE_CONFIG: OrchestratorConfig = normalize(
  deepMerge(
    DEFAULT_CONFIG,
    readJsonc(CONFIG_SOURCES.global),
    readJsonc(CONFIG_SOURCES.legacyProject),
    readJsonc(CONFIG_SOURCES.project),
    readJsonc(CONFIG_SOURCES.projectLocal),
    envLayer(),
  ),
);
export const CONFIG: any = {
  ...EFFECTIVE_CONFIG,
  EXECUTOR_HARNESS: EFFECTIVE_CONFIG.executorHarness,
  REVIEWER_HARNESS: EFFECTIVE_CONFIG.reviewerHarness,
  MAX_PLAN_REVIEWS: EFFECTIVE_CONFIG.maxPlanReviews,
  FINAL_PLAN_REVIEW: EFFECTIVE_CONFIG.finalPlanReview,
  MAX_EXECUTION_ATTEMPTS: EFFECTIVE_CONFIG.maxExecutionAttempts,
  MAX_UNIQUE_QUESTIONS_PER_STAGE: EFFECTIVE_CONFIG.maxUniqueQuestionsPerStage,
  PERMISSION_MODE: EFFECTIVE_CONFIG.permissionMode,
  QUALITY_CMD: EFFECTIVE_CONFIG.qualityCommand,
  BRANCH_PREFIX: EFFECTIVE_CONFIG.branchPrefix,
  MAX_DIFF_CHARS: EFFECTIVE_CONFIG.maxDiffChars,
  MAX_CONTEXT_FILE_CHARS: EFFECTIVE_CONFIG.maxContextFileChars,
  UI_EVENT_COALESCE_MS: EFFECTIVE_CONFIG.uiEventCoalesceMs,
  UI_DASHBOARD_MAX_ROWS: EFFECTIVE_CONFIG.uiDashboardMaxRows,
  RUN_LOG_MAX_BYTES: EFFECTIVE_CONFIG.runLogMaxBytes,
  FOCUS_LOG_MAX_BYTES: EFFECTIVE_CONFIG.focusLogMaxBytes,
};

export function harnessConfig(id: string) {
  return { ...(EFFECTIVE_CONFIG.harnesses?.[id] || {}) };
}
export function harnessString(id: string, key: string, fallback: string) {
  const v = harnessConfig(id)[key];
  return v == null ? fallback : String(v);
}
export function harnessNumber(id: string, key: string, fallback: number) {
  const n = Number(harnessConfig(id)[key]);
  return Number.isFinite(n) ? n : fallback;
}

export function configTemplate() {
  return `// AI Universal Coding Harness configuration\n// Precedence: CLI > AI_HARNESS_* env > .ai-orchestrator/config.jsonc > .ai-universal-coding-harness.jsonc > global > defaults.\n{\n  \"executorHarness\": \"cursor\",\n  \"reviewerHarness\": \"codex\",\n  \"permissionMode\": \"auto_safe\",\n  \"qualityCommand\": \"npm run check\",\n  \"branchPrefix\": \"ai-harness\",\n  \"maxPlanReviews\": 3,\n  \"finalPlanReview\": true,\n  \"maxExecutionAttempts\": 3,\n  \"harnesses\": {\n    \"cursor\": {\n      \"binary\": \"agent\",\n      \"model\": \"gemini-3.8-flash\",\n      \"thinking\": \"high\",\n      \"turnTimeoutMinutes\": 45\n    },\n    \"codex\": {\n      \"binary\": \"codex\",\n      \"model\": \"gpt-6-astra\",\n      \"reasoningEffort\": \"low\",\n      \"verbosity\": \"low\",\n      \"timeoutMinutes\": 8,\n      \"contextMode\": \"evidence_only\"\n    }\n  }\n}\n`;
}
export function projectPlaceholderConfigTemplate() {
  return `// Local project overrides for AI Universal Coding Harness.\n// This file lives under .ai-orchestrator and is intentionally local/untracked.\n// Uncomment only what this repository needs. Package defaults apply for omitted values.\n{\n  // \"executorHarness\": \"cursor\",\n  // \"reviewerHarness\": \"codex\",\n  // \"permissionMode\": \"auto_safe\",\n  // \"qualityCommand\": \"npm run check\",\n  // \"branchPrefix\": \"ai-harness\",\n  // \"maxPlanReviews\": 3,\n  // \"finalPlanReview\": true,\n  // \"maxExecutionAttempts\": 3,\n  // \"harnessModules\": [],\n  // \"harnesses\": {\n  //   \"cursor\": { \"model\": \"gemini-3.8-flash\", \"thinking\": \"high\" },\n  //   \"codex\": { \"model\": \"gpt-6-astra\", \"reasoningEffort\": \"low\" }\n  // }\n}\n`;
}
export function projectPermissionsTemplate() {
  return `// Local permission overrides. Used automatically when this file exists.\n// Keep this list narrow. Unknown/risky commands are routed through the reviewer.\n{\n  \"terminalAllowlist\": [\n    // \"npm run check\",\n    // \"npm test\",\n    // \"git status\",\n    // \"git diff\"\n  ],\n  \"terminalDenylist\": [\n    // Add repository-specific commands that must always be denied.\n  ]\n}\n`;
}
export function writeConfig(file: string, overwrite = false, content = configTemplate()) {
  if (fs.existsSync(file) && !overwrite) throw new Error(`Config already exists: ${file}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}
export function configSummary() {
  return { projectRoot: PROJECT_ROOT, paths: CONFIG_SOURCES, effective: EFFECTIVE_CONFIG };
}
