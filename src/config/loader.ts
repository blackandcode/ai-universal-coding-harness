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

/**
 * Reads a JSONC file from disk, returning an empty object when the path is missing.
 *
 * @param file - Absolute path to a `.jsonc` configuration file.
 * @returns Parsed object layer; non-objects yield `{}`.
 * @throws {@link ConfigError}
 * Thrown when JSONC syntax is invalid.
 */
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

/**
 * Recursively merges configuration layers; nested plain objects merge, arrays and scalars replace.
 *
 * @param base - Starting configuration object.
 * @param layers - Additional layers applied in order; `undefined`/`null` layers are skipped.
 * @returns Merged configuration object.
 */
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

/**
 * Loads and merges all configuration layers from defaults through env overrides.
 *
 * Precedence (lowest to highest): defaults, global, legacy project, project tracked,
 * project local, `AI_HARNESS_*` / `AI_STAGE_*` env, then `customLayers`.
 *
 * @param projectRoot - Target repository root for project-scoped paths.
 * @param customLayers - Extra layers merged last (e.g. CLI overrides).
 * @returns Validated effective orchestrator configuration.
 */
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

/** Process-wide effective configuration loaded at module initialization. */
export const EFFECTIVE_CONFIG: OrchestratorConfig = loadEffectiveConfig();

/**
 * Returns a shallow copy of harness-specific settings for a registered harness id.
 *
 * @param id - Harness identifier (e.g. `cursor`, `codex`).
 * @param config - Configuration snapshot to read from.
 */
export function harnessConfig(
  id: string,
  config: OrchestratorConfig = EFFECTIVE_CONFIG
): Record<string, unknown> {
  return { ...config.harnesses?.[id] };
}

/**
 * Reads a string harness setting with a fallback when missing or nullish.
 *
 * @param id - Harness identifier.
 * @param key - Property key within `config.harnesses[id]`.
 * @param fallback - Value used when the setting is absent.
 * @param config - Configuration snapshot to read from.
 */
export function harnessString(
  id: string,
  key: string,
  fallback: string,
  config: OrchestratorConfig = EFFECTIVE_CONFIG
): string {
  const v = harnessConfig(id, config)[key];
  return v == null ? fallback : String(v);
}

/**
 * Reads a numeric harness setting with a fallback when missing or non-finite.
 *
 * @param id - Harness identifier.
 * @param key - Property key within `config.harnesses[id]`.
 * @param fallback - Value used when the setting is absent or invalid.
 * @param config - Configuration snapshot to read from.
 */
export function harnessNumber(
  id: string,
  key: string,
  fallback: number,
  config: OrchestratorConfig = EFFECTIVE_CONFIG
): number {
  const n = Number(harnessConfig(id, config)[key]);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Writes a configuration template file, creating parent directories as needed.
 *
 * @param file - Destination path for the new config file.
 * @param overwrite - When false, throws if the file already exists.
 * @param content - JSONC template body (defaults to global `configTemplate()`).
 * @returns The written file path.
 * @throws {@link ConfigError}
 * Thrown when the target file already exists and `overwrite` is false.
 */
export function writeConfig(file: string, overwrite = false, content = configTemplate()): string {
  if (fs.existsSync(file) && !overwrite) {
    throw new ConfigError(`Config already exists: ${file}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

/**
 * Builds a diagnostic summary of resolved config paths and the effective configuration.
 *
 * @param root - Project root used for path resolution in the summary.
 * @param config - Effective configuration to embed.
 */
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
