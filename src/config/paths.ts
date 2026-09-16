/**
 * @fileoverview Path resolution for configuration files and directories.
 * Handles cross-platform global config paths, project-tracked paths, and local override paths.
 */

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConfigSources } from './types.js';

const __filename = fileURLToPath(import.meta.url);

/** Absolute path to the compiled `dist/` directory for this package. */
export const DIST_DIR = path.resolve(path.dirname(path.dirname(__filename)));

/** Package root directory (parent of `dist/`). */
export const TOOL_DIR = path.dirname(DIST_DIR);

/**
 * Active target repository root.
 * Overridable via `AI_HARNESS_PROJECT_ROOT` or legacy `AI_STAGE_PROJECT_ROOT`.
 */
export const PROJECT_ROOT = path.resolve(
  process.env.AI_HARNESS_PROJECT_ROOT || process.env.AI_STAGE_PROJECT_ROOT || process.cwd()
);

/**
 * Resolves the cross-platform global configuration directory for this tool.
 *
 * Honors `AI_HARNESS_CONFIG_HOME` / `AI_STAGE_CONFIG_HOME`, then OS-specific defaults.
 */
export function globalConfigDir(): string {
  if (process.env.AI_HARNESS_CONFIG_HOME) return path.resolve(process.env.AI_HARNESS_CONFIG_HOME);
  if (process.env.AI_STAGE_CONFIG_HOME) return path.resolve(process.env.AI_STAGE_CONFIG_HOME);
  const home = os.homedir();
  if (process.platform === 'win32')
    return path.join(
      process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
      'ai-universal-coding-harness'
    );
  if (process.platform === 'darwin')
    return path.join(home, 'Library', 'Application Support', 'ai-universal-coding-harness');
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(home, '.config'),
    'ai-universal-coding-harness'
  );
}

/** Absolute path to the user-global `config.jsonc` file. */
export function globalConfigPath(): string {
  return path.join(globalConfigDir(), 'config.jsonc');
}

/**
 * Path to the project-tracked config file at the repository root.
 *
 * @param root - Target repository root.
 */
export function projectTrackedConfigPath(root = PROJECT_ROOT): string {
  return path.join(root, '.ai-universal-coding-harness.jsonc');
}

/**
 * Path to the legacy project-tracked config filename (pre-rename).
 *
 * @param root - Target repository root.
 */
export function legacyProjectTrackedConfigPath(root = PROJECT_ROOT): string {
  return path.join(root, '.ai-stage-orchestrator.jsonc');
}

/**
 * Path to the local-only override under `.ai-orchestrator/config.jsonc`.
 *
 * @param root - Target repository root.
 */
export function projectLocalConfigPath(root = PROJECT_ROOT): string {
  return path.join(root, '.ai-orchestrator', 'config.jsonc');
}

/**
 * Path to project-local permission overrides under `.ai-orchestrator/`.
 *
 * @param root - Target repository root.
 */
export function projectLocalPermissionsPath(root = PROJECT_ROOT): string {
  return path.join(root, '.ai-orchestrator', 'permissions.jsonc');
}

/** Path to the bundled default permissions template shipped with the package. */
export function defaultPermissionsPath(): string {
  return path.join(TOOL_DIR, 'permissions.default.jsonc');
}

/**
 * Collects all standard configuration file paths for a project root.
 *
 * @param root - Target repository root.
 */
export function getConfigSources(root = PROJECT_ROOT): ConfigSources {
  return {
    global: globalConfigPath(),
    legacyProject: legacyProjectTrackedConfigPath(root),
    project: projectTrackedConfigPath(root),
    projectLocal: projectLocalConfigPath(root)
  };
}

/** Config source paths for the current {@link PROJECT_ROOT}. */
export const CONFIG_SOURCES = getConfigSources();
