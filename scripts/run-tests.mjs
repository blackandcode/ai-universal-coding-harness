import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
    } else if (entry.name.endsWith('.test.js')) {
      out.push(fullPath);
    }
  }
  return out;
}

const distDir = path.resolve('dist');
const testFiles = walk(distDir).sort((a, b) => a.localeCompare(b, 'en'));

if (testFiles.length === 0) {
  console.error('No compiled test files found in dist. Run npm run build first.');
  process.exit(2);
}

const args = [];
if (process.argv.includes('--coverage')) {
  args.push('--experimental-test-coverage');
}
args.push('--test', ...testFiles);

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  windowsHide: true,
});

process.exit(result.status ?? 1);
