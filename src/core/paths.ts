import path from 'node:path';
import {PROJECT_ROOT,TOOL_DIR} from './config.js';

export const ROOT=PROJECT_ROOT;
export const STATE_ROOT=path.join(ROOT,'.ai-orchestrator');
export const RUNS_ROOT=path.join(STATE_ROOT,'runs');
export const STAGE_INPUT_ROOT=path.join(STATE_ROOT,'stage-input');
export const STAGE_RUNTIME_ROOT=path.join(STATE_ROOT,'stage-runtime');
export const LOCAL_CONFIG_FILE=path.join(STATE_ROOT,'config.jsonc');
export const LOCAL_PERMISSIONS_FILE=path.join(STATE_ROOT,'permissions.jsonc');
export const LATEST_FILE=path.join(STATE_ROOT,'latest-run');
export const LOCK_FILE=path.join(STATE_ROOT,'orchestrator.lock');
export const SCHEMA_DIR=path.join(TOOL_DIR,'schemas');
