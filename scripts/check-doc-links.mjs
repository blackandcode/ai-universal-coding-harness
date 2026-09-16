/**
 * @fileoverview Documentation relative link validator.
 *
 * Scans maintained Markdown files for repository-relative links and verifies that
 * all target files exist on disk.
 *
 * Invariants:
 * - Ignores external protocols (http://, https://, mailto:).
 * - Ignores pure in-page anchor targets (#...).
 * - Strips anchor fragments from relative paths before disk verification.
 * - Ignores links within code blocks (fenced with ```).
 * - Resolves targets relative to the directory of the referencing Markdown file.
 * - Fails CI / verify when any repository-relative link target is missing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Default list of maintained documentation entry points and patterns.
 */
export const DEFAULT_MAINTAINED_DOCS = Object.freeze([
  'README.md',
  'DECISIONS.md',
  'IMPLEMENTATION-STATUS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'AGENTS.md',
  'CHANGELOG.md',
  'docs'
]);

/**
 * Recursively discovers all Markdown (.md) files in a directory or single file.
 *
 * @param {string} target - File or directory path
 * @param {string[]} [out] - Accumulator array
 * @returns {string[]}
 */
export function discoverMarkdownFiles(target, out = []) {
  if (!fs.existsSync(target)) return out;

  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (target.endsWith('.md')) {
      out.push(path.resolve(target));
    }
    return out;
  }

  if (stat.isDirectory()) {
    const base = path.basename(target);
    if (base === 'node_modules' || base === '.git' || base === 'dist' || base === '.test-dist') {
      return out;
    }

    for (const ent of fs.readdirSync(target, { withFileTypes: true })) {
      const full = path.join(target, ent.name);
      if (ent.isDirectory()) {
        discoverMarkdownFiles(full, out);
      } else if (ent.name.endsWith('.md')) {
        out.push(path.resolve(full));
      }
    }
  }

  return out;
}

/**
 * Strips fenced code blocks (```...```) from Markdown text to prevent false positives.
 * Preserves line count so reported line numbers remain accurate.
 *
 * @param {string} content
 * @returns {string}
 */
export function stripCodeBlocks(content) {
  return content.replace(/```[\s\S]*?```/g, (match) => {
    const newlineCount = (match.match(/\n/g) || []).length;
    return '\n'.repeat(newlineCount);
  });
}

/**
 * Checks a Markdown string for broken repository-relative links.
 *
 * @param {string} filePath - Path of the file being checked
 * @param {string} content - Raw Markdown content
 * @returns {Array<{ file: string, line: number, target: string, resolved: string }>}
 */
export function extractBrokenLinks(filePath, content) {
  const sanitized = stripCodeBlocks(content);
  const lines = sanitized.split(/\r?\n/);
  const broken = [];
  const linkRegex = /!?\[(?:[^\]]*)\]\(([^)]+)\)/g;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    let match;
    linkRegex.lastIndex = 0;

    while ((match = linkRegex.exec(line)) !== null) {
      const rawTarget = match[1].trim();

      // Ignore external protocols, mailto, and pure anchor references
      if (
        rawTarget.startsWith('http://') ||
        rawTarget.startsWith('https://') ||
        rawTarget.startsWith('mailto:') ||
        rawTarget.startsWith('#') ||
        rawTarget === ''
      ) {
        continue;
      }

      // Ignore common documentation placeholders and non-file templates
      if (
        rawTarget === 'path' ||
        rawTarget === 'URL' ||
        rawTarget === 'url' ||
        rawTarget.startsWith('<') ||
        rawTarget.endsWith('>') ||
        rawTarget.includes('${')
      ) {
        continue;
      }

      // Strip query parameters and anchors
      const cleanTarget = rawTarget.split('#')[0].split('?')[0].trim();
      if (!cleanTarget) {
        continue;
      }

      const fileDir = path.dirname(filePath);
      const resolved = path.resolve(fileDir, cleanTarget);

      if (!fs.existsSync(resolved)) {
        broken.push({
          file: filePath,
          line: lineIndex + 1,
          target: rawTarget,
          resolved
        });
      }
    }
  }

  return broken;
}

/**
 * Validates relative links across specified documentation targets.
 *
 * @param {object} [options]
 * @param {string[]} [options.targets] - Files or directories to check
 * @param {boolean} [options.silent] - Suppress console output
 * @returns {{ ok: boolean, broken: Array<{ file: string, line: number, target: string, resolved: string }> }}
 */
export function checkDocLinks(options = {}) {
  const targets = options.targets || DEFAULT_MAINTAINED_DOCS;
  const silent = Boolean(options.silent);

  const allFiles = [];
  for (const t of targets) {
    discoverMarkdownFiles(t, allFiles);
  }

  const uniqueFiles = [...new Set(allFiles)].sort((a, b) => a.localeCompare(b, 'en'));
  const broken = [];

  for (const file of uniqueFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const fileBroken = extractBrokenLinks(file, content);
      broken.push(...fileBroken);
    } catch (err) {
      if (!silent) console.error(`[check-doc-links] Failed to read ${file}: ${err.message}`);
    }
  }

  const ok = broken.length === 0;

  if (!silent) {
    if (ok) {
      console.log(
        `[check-doc-links] All relative Markdown links valid across ${uniqueFiles.length} file(s).`
      );
    } else {
      console.error(`[check-doc-links] Found ${broken.length} broken documentation link(s):`);
      for (const item of broken) {
        const rel = path.relative(process.cwd(), item.file);
        console.error(
          `  - ${rel}:${item.line} -> "${item.target}" (target not found: ${item.resolved})`
        );
      }
    }
  }

  return { ok, broken };
}

// CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkDocLinks();
  process.exit(result.ok ? 0 : 1);
}
