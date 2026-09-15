import fs from 'node:fs';
import path from 'node:path';

if (fs.existsSync('dist/bin.js')) {
  try {
    fs.chmodSync('dist/bin.js', 0o755);
  } catch {}
}

const distDir = path.resolve('dist');
if (fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, '.npmignore'), '**/*.test.*\n');
}
