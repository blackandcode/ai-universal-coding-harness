/**
 * @fileoverview Filesystem path constants for orchestrator workspace layout and runtime artifacts.
 * Defines canonical paths for runs, stage inputs, stage runtime, config, lock, and schemas.
 */

import path from 'node:path';
import { PROJECT_ROOT, TOOL_DIR } from './config.js';

/** Target project root directory */
export const ROOT = PROJECT_ROOT;

/** Orchestrator workspace root (.ai-orchestrator) */
export const STATE_ROOT = path.join(ROOT, '.ai-orchestrator');

/** Root directory for persisted runs */
export const RUNS_ROOT = path.join(STATE_ROOT, 'runs');

/** Root directory for frozen stage input definitions */
export const STAGE_INPUT_ROOT = path.join(STATE_ROOT, 'stage-input');

/** Root directory for stage execution runtime evidence */
export const STAGE_RUNTIME_ROOT = path.join(STATE_ROOT, 'stage-runtime');

/** Path to untracked local project configuration override */
export const LOCAL_CONFIG_FILE = path.join(STATE_ROOT, 'config.jsonc');

/** Path to untracked local project permissions override */
export const LOCAL_PERMISSIONS_FILE = path.join(STATE_ROOT, 'permissions.jsonc');

/** Path to file tracking the ID of the most recent run */
export const LATEST_FILE = path.join(STATE_ROOT, 'latest-run');

/** Path to active run mutual-exclusion concurrency lock */
export const LOCK_FILE = path.join(STATE_ROOT, 'orchestrator.lock');

/** Path to JSON schema validation definitions directory */
export const SCHEMA_DIR = path.join(TOOL_DIR, 'schemas');
