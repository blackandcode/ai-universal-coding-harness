#!/usr/bin/env node

/**
 * @fileoverview Scans src/ for exported symbols lacking TSDoc documentation comments.
 *
 * Heuristically identifies exported functions, classes, interfaces, type aliases, and constants
 * to assist in tracking progress during TSDoc documentation audits.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../../src');

function findTsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip re-exports like `export { x } from ...` or `export * from ...` or `export default ...`
    if (/^\s*export\s+(?:\{|\*|default\b)/.test(line)) {
      continue;
    }

    // Match exported declarations
    const exportMatch = line.match(
      /^\s*export\s+(?:async\s+)?(?:function\s+([A-Za-z0-9_$]+)|class\s+([A-Za-z0-9_$]+)|interface\s+([A-Za-z0-9_$]+)|type\s+([A-Za-z0-9_$]+)|(?:const|let)\s+([A-Za-z0-9_$]+))/
    );

    if (!exportMatch) continue;

    const symbolName = exportMatch.slice(1).find(Boolean);
    if (!symbolName) continue;

    // Check if the lines immediately preceding have a closing docblock `*/`
    let hasDoc = false;
    let prevIdx = i - 1;

    // Skip decorators or empty lines if any
    while (
      prevIdx >= 0 &&
      lines[prevIdx].trim().startsWith('@') &&
      !lines[prevIdx].trim().startsWith('*/')
    ) {
      prevIdx--;
    }

    if (prevIdx >= 0 && lines[prevIdx].trim().endsWith('*/')) {
      // Find start of comment block
      for (let j = prevIdx; j >= 0; j--) {
        if (lines[j].includes('/**')) {
          hasDoc = true;
          break;
        }
        if (!lines[j].trim().startsWith('*') && !lines[j].trim().endsWith('*/')) {
          break;
        }
      }
    }

    if (!hasDoc) {
      issues.push({
        line: i + 1,
        symbol: symbolName,
        code: line.trim()
      });
    }
  }

  return issues;
}

const files = findTsFiles(SRC_DIR);
let totalUndocumented = 0;
const report = [];

for (const file of files) {
  const issues = checkFile(file);
  if (issues.length > 0) {
    totalUndocumented += issues.length;
    const rel = path.relative(path.resolve(SRC_DIR, '..'), file);
    report.push({ file: rel, issues });
  }
}

const asJson = process.argv.includes('--json');

if (asJson) {
  console.log(JSON.stringify({ totalUndocumented, report }, null, 2));
} else {
  console.log(
    `TSDoc Export Audit: Found ${totalUndocumented} undocumented export(s) across ${report.length} file(s).\n`
  );
  for (const { file, issues } of report) {
    console.log(`  ${file}:`);
    for (const issue of issues) {
      console.log(`    Line ${issue.line}: ${issue.symbol} -> ${issue.code}`);
    }
    console.log();
  }
}

if (process.argv.includes('--check') && totalUndocumented > 0) {
  process.exit(1);
}
