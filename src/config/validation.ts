/**
 * @fileoverview Configuration validation and normalization.
 * Validates untrusted configuration structures, enforces numeric bounds, and resolves permission files.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { OrchestratorConfig } from './types.js';
import { defaultPermissionsPath, projectLocalPermissionsPath, PROJECT_ROOT } from './paths.js';
import { ConfigError } from '../errors.js';

const VALID_PERMISSION_MODES: ReadonlySet<string> = new Set([
  'auto_safe',
  'allow_all',
  'allowlist',
  'ask_reviewer',
]);

export function validateAndNormalizeConfig(
  raw: unknown,
  base: OrchestratorConfig,
  projectRoot = PROJECT_ROOT,
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

  return c;
}
