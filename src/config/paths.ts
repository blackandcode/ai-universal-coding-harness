/**
 * @fileoverview Path resolution for configuration files and directories.
 * Handles cross-platform global config paths, project-tracked paths, and local override paths.
 */

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConfigSources } from './types.js';

const __filename = fileURLToPath(import.meta.url);
export const DIST_DIR = path.resolve(path.dirname(path.dirname(__filename)));
export const TOOL_DIR = path.dirname(DIST_DIR);
export const PROJECT_ROOT = path.resolve(
  process.env.AI_HARNESS_PROJECT_ROOT || process.env.AI_STAGE_PROJECT_ROOT || process.cwd(),
);

export function globalConfigDir(): string {
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

export function globalConfigPath(): string {
  return path.join(globalConfigDir(), 'config.jsonc');
}

export function projectTrackedConfigPath(root = PROJECT_ROOT): string {
  return path.join(root, '.ai-universal-coding-harness.jsonc');
}

export function legacyProjectTrackedConfigPath(root = PROJECT_ROOT): string {
  return path.join(root, '.ai-stage-orchestrator.jsonc');
}

export function projectLocalConfigPath(root = PROJECT_ROOT): string {
  return path.join(root, '.ai-orchestrator', 'config.jsonc');
}

export function projectLocalPermissionsPath(root = PROJECT_ROOT): string {
  return path.join(root, '.ai-orchestrator', 'permissions.jsonc');
}

export function defaultPermissionsPath(): string {
  return path.join(TOOL_DIR, 'permissions.default.jsonc');
}

export function getConfigSources(root = PROJECT_ROOT): ConfigSources {
  return {
    global: globalConfigPath(),
    legacyProject: legacyProjectTrackedConfigPath(root),
    project: projectTrackedConfigPath(root),
    projectLocal: projectLocalConfigPath(root),
  };
}

export const CONFIG_SOURCES = getConfigSources();
