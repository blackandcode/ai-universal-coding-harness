#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts ?? {};
const candidates = ['format:check', 'lint', 'typecheck', 'test', 'build'];
let failed = false;
for (const name of candidates) {
  if (!scripts[name]) {
    console.error(`[skip] npm run ${name} (script not defined)`);
    continue;
  }
  console.error(`[run] npm run ${name}`);
  const r = spawnSync('npm', ['run', name], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { failed = true; break; }
}
process.exit(failed ? 1 : 0);
