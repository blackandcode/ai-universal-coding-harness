import fs from 'node:fs';
import { spawnNpm } from './lib/npm-invoke.mjs';

if (!fs.existsSync('package-lock.json')) {
  console.error('package-lock.json must be committed for deterministic CI installation.');
  process.exit(2);
}

const args = ['ci', '--ignore-scripts', '--no-audit', '--no-fund'];
const result = spawnNpm(args, {
  stdio: 'inherit',
});

if (result.error) {
  console.error('Failed to spawn npm:', result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
