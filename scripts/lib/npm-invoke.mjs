/**
 * @fileoverview Utility module for spawning npm CLI processes portably across platforms.
 * Resolves npm CLI path to prevent cmd.exe/shell escaping issues on Windows.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Discovers the absolute path to npm-cli.js from the current Node environment.
 *
 * @returns Path to npm-cli.js, or null if not found.
 */
export function findNpmCli() {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
    return process.env.npm_execpath;
  }
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Spawns an npm CLI invocation using Node.js directly or shell fallback.
 *
 * @param args - CLI arguments passed to npm.
 * @param options - Options passed to spawnSync.
 * @returns Result object from spawnSync.
 */
export function spawnNpm(args, options = {}) {
  const npmCli = findNpmCli();
  const env = { ...(options.env || process.env) };
  delete env.npm_config_devdir;
  const mergedOptions = {
    ...options,
    env
  };
  let result;
  if (npmCli) {
    result = spawnSync(process.execPath, [npmCli, ...args], {
      windowsHide: true,
      ...mergedOptions
    });
  } else {
    const isWindows = process.platform === 'win32';
    result = spawnSync(isWindows ? 'npm.cmd' : 'npm', args, {
      shell: isWindows,
      windowsHide: true,
      ...mergedOptions
    });
  }
  return result;
}
