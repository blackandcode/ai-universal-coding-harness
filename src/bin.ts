#!/usr/bin/env node
/**
 * @fileoverview Executable CLI launcher for ai-harness / ai-universal-coding-harness.
 * Resolves repository target directory and launches the main CLI dispatcher.
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function optionValue(argv: string[], names: string[]) {
  for (let i = 0; i < argv.length; i++) {
    if (names.includes(argv[i]) && argv[i + 1]) return argv[i + 1];
    for (const name of names)
      if (argv[i].startsWith(`${name}=`)) return argv[i].slice(name.length + 1);
  }
  return '';
}

function gitRoot(cwd: string) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  return r.status === 0 ? String(r.stdout).trim() : '';
}

const argv = process.argv.slice(2);
const requested = optionValue(argv, ['--project', '--cwd']);
const start = path.resolve(requested || process.cwd());
const root = gitRoot(start) || start;
process.env.AI_HARNESS_PROJECT_ROOT = root;
process.chdir(root);
await import('./cli.js');
