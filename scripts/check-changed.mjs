/**
 * @fileoverview Fast incremental quality check for day-to-day development iterations.
 *
 * Checks only modified, staged, and untracked files across the repository:
 * 1. Formats touched files with Oxfmt (--check).
 * 2. Lints touched JS/TS files with Oxlint.
 * 3. Typechecks with TypeScript.
 * 4. Resolves and executes targeted unit tests corresponding to touched source or test files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function getGitFiles() {
  const files = new Set();

  // Staged and unstaged changes against HEAD
  const diffResult = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (diffResult.status === 0 && diffResult.stdout) {
    for (const line of diffResult.stdout.trim().split('\n')) {
      const f = line.trim();
      if (f) files.add(f);
    }
  }

  // Untracked files
  const statusResult = spawnSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (statusResult.status === 0 && statusResult.stdout) {
    for (const line of statusResult.stdout.trim().split('\n')) {
      if (line.startsWith('?? ')) {
        const f = line.slice(3).trim();
        if (f) files.add(f);
      }
    }
  }

  return Array.from(files).filter((f) => fs.existsSync(f) && fs.statSync(f).isFile());
}

function resolveTargetedTests(touchedFiles) {
  const testFiles = new Set();

  for (const file of touchedFiles) {
    const normalized = file.replace(/\\/g, '/');

    // If a test file itself was touched
    if (
      normalized.startsWith('tests/') &&
      (normalized.endsWith('.test.ts') ||
        normalized.endsWith('.test.tsx') ||
        normalized.endsWith('.test.mjs'))
    ) {
      testFiles.add(normalized);
      continue;
    }

    // If a source file was touched (e.g. src/quality/EvidenceVerifier.ts)
    if (
      normalized.startsWith('src/') &&
      (normalized.endsWith('.ts') || normalized.endsWith('.tsx'))
    ) {
      const relToSrc = normalized.slice(4); // e.g. quality/EvidenceVerifier.ts
      const baseName = relToSrc.replace(/\.(ts|tsx)$/, '');

      const candidates = [`tests/${baseName}.test.ts`, `tests/${baseName}.test.tsx`];

      // Also check directory for sibling tests (e.g. quality/evidence-integrity.test.ts)
      const testDir = path.join('tests', path.dirname(relToSrc));
      if (fs.existsSync(testDir)) {
        try {
          const dirEntries = fs.readdirSync(testDir);
          for (const entry of dirEntries) {
            if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) {
              const fullCandidate = path.join(testDir, entry).replace(/\\/g, '/');
              // If baseName is in candidate name, e.g. evidence in EvidenceVerifier and evidence-integrity
              const lowerBase = path.basename(baseName).toLowerCase();
              if (entry.toLowerCase().includes(lowerBase)) {
                candidates.push(fullCandidate);
              }
            }
          }
        } catch {}
      }

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          testFiles.add(candidate);
        }
      }
    }
  }

  return Array.from(testFiles);
}

const touchedFiles = getGitFiles();

if (touchedFiles.length === 0) {
  console.log('No modified or untracked files detected. Nothing to check.');
  process.exit(0);
}

console.log(`[check:changed] Detected ${touchedFiles.length} touched file(s):`);
for (const f of touchedFiles) {
  console.log(`  - ${f}`);
}

const oxfmtExts = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.jsonc', '.md']);
const oxlintExts = new Set(['.ts', '.tsx', '.js', '.mjs']);

const formatCandidates = touchedFiles.filter((f) => oxfmtExts.has(path.extname(f)));
const lintCandidates = touchedFiles.filter((f) => oxlintExts.has(path.extname(f)));
const targetedTests = resolveTargetedTests(touchedFiles);

// 1. Format check
if (formatCandidates.length > 0) {
  console.log(
    `\n[check:changed] 1/4 Checking formatting with Oxfmt (${formatCandidates.length} files)...`
  );
  const oxfmtBin = path.resolve('node_modules/.bin/oxfmt');
  const fmtRes = spawnSync(oxfmtBin, ['--check', ...formatCandidates], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true
  });
  if (fmtRes.status !== 0) {
    console.error('[check:changed] Formatting check failed! Run `npm run format` to fix.');
    process.exit(fmtRes.status ?? 1);
  }
} else {
  console.log('\n[check:changed] 1/4 Skipping formatting (no formattable files touched).');
}

// 2. Lint check
if (lintCandidates.length > 0) {
  console.log(`\n[check:changed] 2/4 Linting with Oxlint (${lintCandidates.length} files)...`);
  const oxlintBin = path.resolve('node_modules/.bin/oxlint');
  const lintRes = spawnSync(oxlintBin, [...lintCandidates], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true
  });
  if (lintRes.status !== 0) {
    console.error('[check:changed] Lint check failed!');
    process.exit(lintRes.status ?? 1);
  }
} else {
  console.log('\n[check:changed] 2/4 Skipping linting (no JS/TS files touched).');
}

// 3. Typecheck
console.log('\n[check:changed] 3/4 Typechecking with TypeScript...');
const tscBin = path.resolve('node_modules/typescript/bin/tsc');
const typeRes1 = spawnSync(process.execPath, [tscBin, '-p', 'tsconfig.json', '--noEmit'], {
  stdio: 'inherit',
  windowsHide: true
});
if (typeRes1.status !== 0) {
  console.error('[check:changed] Production TypeScript compilation failed!');
  process.exit(typeRes1.status ?? 1);
}

const typeRes2 = spawnSync(process.execPath, [tscBin, '-p', 'tsconfig.test.json', '--noEmit'], {
  stdio: 'inherit',
  windowsHide: true
});
if (typeRes2.status !== 0) {
  console.error('[check:changed] Test TypeScript compilation failed!');
  process.exit(typeRes2.status ?? 1);
}

// 4. Targeted tests
if (targetedTests.length > 0) {
  console.log(
    `\n[check:changed] 4/4 Compiling and running targeted test suites (${targetedTests.length} files)...`
  );
  for (const t of targetedTests) {
    console.log(`  - ${t}`);
  }

  // Build test bundle to .test-dist
  const buildTestRes = spawnSync(process.execPath, [tscBin, '-p', 'tsconfig.test.json'], {
    stdio: 'inherit',
    windowsHide: true
  });
  if (buildTestRes.status !== 0) {
    console.error('[check:changed] Test compilation to .test-dist failed!');
    process.exit(buildTestRes.status ?? 1);
  }

  // Execute targeted tests via scripts/run-tests.mjs
  const testRes = spawnSync(process.execPath, ['scripts/run-tests.mjs', ...targetedTests], {
    stdio: 'inherit',
    windowsHide: true
  });
  if (testRes.status !== 0) {
    console.error('[check:changed] Targeted tests failed!');
    process.exit(testRes.status ?? 1);
  }
} else {
  console.log('\n[check:changed] 4/4 Skipping tests (no testable source or test files touched).');
}

console.log('\n[check:changed] All incremental quality checks passed successfully!');
