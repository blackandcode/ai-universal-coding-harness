/**
 * @fileoverview Configures Git hooks directory for the repository.
 * Sets core.hooksPath to .githooks and ensures executable permissions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const hooksDir = path.resolve('.githooks');
const prePushHook = path.join(hooksDir, 'pre-push');

if (fs.existsSync(prePushHook) && process.platform !== 'win32') {
  try {
    fs.chmodSync(prePushHook, 0o755);
  } catch {}
}

const gitCheck = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
  encoding: 'utf8',
  windowsHide: true
});

if (gitCheck.status === 0 && gitCheck.stdout.trim() === 'true') {
  const setResult = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (setResult.status === 0) {
    console.log('[setup-git-hooks] Configured git core.hooksPath to .githooks');
  }
}
