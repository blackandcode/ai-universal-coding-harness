/**
 * @fileoverview Configuration loading, layering, parsing, and serialization.
 * Reads JSONC configuration layers, performs recursive deep merges, and computes the effective config.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse, printParseErrorCode } from 'jsonc-parser';
import type { OrchestratorConfig, ConfigSummary } from './types.js';
import { DEFAULT_CONFIG } from './defaults.js';
import {
  CONFIG_SOURCES,
  globalConfigPath,
  legacyProjectTrackedConfigPath,
  projectLocalConfigPath,
  projectTrackedConfigPath,
  PROJECT_ROOT
} from './paths.js';
import { envLayer } from './env.js';
import { validateAndNormalizeConfig } from './validation.js';
import { configTemplate } from './templates.js';
import { ConfigError } from '../errors.js';

export function readJsonc(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  const errors: { error: number; offset: number; length: number }[] = [];
  const value = parse(fs.readFileSync(file, 'utf8'), errors, {
    allowTrailingComma: true,
    disallowComments: false
  });
  if (errors.length) {
    throw new ConfigError(
      `Invalid JSONC config ${file}: ${errors.map((e) => printParseErrorCode(e.error)).join(', ')}`
    );
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  ...layers: (Record<string, unknown> | undefined | null)[]
): T {
  const out: Record<string, unknown> = { ...base };
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    for (const [k, v] of Object.entries(layer)) {
      if (
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        out[k] &&
        typeof out[k] === 'object' &&
        !Array.isArray(out[k])
      ) {
        out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
      } else if (v !== undefined) {
        out[k] = v;
      }
    }
  }
  return out as T;
}

export function loadEffectiveConfig(
  projectRoot = PROJECT_ROOT,
  customLayers: Record<string, unknown>[] = []
): OrchestratorConfig {
  const globalPath = globalConfigPath();
  const legacyProjectPath = legacyProjectTrackedConfigPath(projectRoot);
  const projectPath = projectTrackedConfigPath(projectRoot);
  const localPath = projectLocalConfigPath(projectRoot);

  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    readJsonc(globalPath),
    readJsonc(legacyProjectPath),
    readJsonc(projectPath),
    readJsonc(localPath),
    envLayer(),
    ...customLayers
  );

  return validateAndNormalizeConfig(merged, DEFAULT_CONFIG, projectRoot);
}

export const EFFECTIVE_CONFIG: OrchestratorConfig = loadEffectiveConfig();

export function harnessConfig(
  id: string,
  config: OrchestratorConfig = EFFECTIVE_CONFIG
): Record<string, unknown> {
  return { ...config.harnesses?.[id] };
}

export function harnessString(
  id: string,
  key: string,
  fallback: string,
  config: OrchestratorConfig = EFFECTIVE_CONFIG
): string {
  const v = harnessConfig(id, config)[key];
  return v == null ? fallback : String(v);
}

export function harnessNumber(
  id: string,
  key: string,
  fallback: number,
  config: OrchestratorConfig = EFFECTIVE_CONFIG
): number {
  const n = Number(harnessConfig(id, config)[key]);
  return Number.isFinite(n) ? n : fallback;
}

export function writeConfig(file: string, overwrite = false, content = configTemplate()): string {
  if (fs.existsSync(file) && !overwrite) {
    throw new ConfigError(`Config already exists: ${file}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

export function configSummary(
  root = PROJECT_ROOT,
  config: OrchestratorConfig = EFFECTIVE_CONFIG
): ConfigSummary {
  return {
    projectRoot: root,
    paths: CONFIG_SOURCES,
    effective: config
  };
}
