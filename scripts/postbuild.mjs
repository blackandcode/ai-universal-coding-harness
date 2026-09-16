/**
 * @fileoverview Post-build script ensuring proper permissions and packaging rules.
 * Applies executable permissions (0o755) to dist/bin.js and generates .npmignore in dist.
 */

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
