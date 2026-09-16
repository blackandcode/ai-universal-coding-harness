/**
 * @fileoverview Command classification and dangerous command detection.
 *
 * Provides cross-platform categorization of CLI commands, identifies hard-denied operations
 * (Git history mutations, branch deletions, privilege escalations, package publishing),
 * safe reversible read/quality commands, and verifies workspace path boundary containment.
 */

import path from 'node:path';

const HARD_DENY: [RegExp, string][] = [
  [
    /\bgit\s+(?:push|commit|merge|rebase|reset\s+--hard|clean\s+-[^\s]*f|switch|checkout|stash)\b/i,
    'Git lifecycle is owned by the orchestrator.'
  ],
  [/\bgit\s+branch\s+-[dD]\b/i, 'Branch deletion is not allowed.'],
  [/\bsudo\b/i, 'Privilege escalation is not allowed.'],
  [
    /\b(?:mkfs|fdisk|parted|shutdown|reboot|poweroff)\b/i,
    'System-destructive operation is not allowed.'
  ],
  [/\bterraform\s+destroy\b/i, 'Infrastructure destroy is not allowed.'],
  [/\bkubectl\s+delete\b/i, 'Cluster deletion is not allowed.'],
  [/\b(?:npm|pnpm|yarn)\s+publish\b/i, 'Package publishing is not allowed.'],
  [/\brm\s+-[^\s]*r[^\s]*f\s+(?:\/|~|\.\.)/i, 'Broad destructive delete is not allowed.']
];

const SAFE_PREFIXES = [
  'git status',
  'git diff',
  'git log',
  'git show',
  'git blame',
  'git grep',
  'git ls-files',
  'git ls-tree',
  'git rev-parse',
  'git describe',
  'git shortlog',
  'git branch',
  'rg',
  'grep',
  'find',
  'cat',
  'head',
  'tail',
  'wc',
  'ls',
  'dir',
  'type',
  'pwd',
  'stat',
  'file',
  'realpath',
  'basename',
  'dirname',
  'sha256sum',
  'npm run check',
  'npm test',
  'npm run test',
  'npm run lint',
  'npm run build',
  'npx eslint',
  'npx prettier',
  'npx tsc',
  'pnpm test',
  'yarn test',
  'composer validate',
  'composer test',
  'phpunit',
  'vendor/bin/phpunit',
  'phpstan',
  'vendor/bin/phpstan',
  'phpcs',
  'vendor/bin/phpcs',
  'node --check',
  'bash -n'
];

/**
 * Normalizes command strings by trimming whitespace and normalizing internal whitespace.
 *
 * @param s - Raw command string
 * @returns Normalized command string
 */
export function normalizeCommand(s = ''): string {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Checks whether a command starts with a specified command or prefix.
 *
 * @param command - Full command to check
 * @param prefix - Prefix to check against
 * @returns True if command matches prefix exactly or prefix followed by space
 */
export function commandStartsWith(command: string, prefix: string): boolean {
  const c = normalizeCommand(command).toLowerCase();
  const p = normalizeCommand(prefix).toLowerCase();
  return c === p || c.startsWith(p + ' ');
}

/**
 * Checks if a command text matches non-negotiable hard dangerous patterns.
 *
 * @remarks
 * Security Invariant: Hard-denied commands represent irreversible or dangerous operations:
 * - Privilege escalation (`sudo`).
 * - Git history mutations or lifecycle commands (`git push`, `commit`, `merge`, `rebase`, `reset --hard`, `stash`).
 * - System destruction (`mkfs`, `fdisk`, `reboot`, `shutdown`, `rm -rf /`).
 * - Infrastructure and package releases (`terraform destroy`, `kubectl delete`, `npm publish`).
 *
 * These operations are unconditionally blocked in all permission modes and are never escalated to the reviewer.
 *
 * @param text - Raw shell command string or operation description.
 * @returns Non-empty reason string if the command is hard-denied, or empty string if not hard-denied.
 */
export function hardDangerous(text: string): string {
  const s = normalizeCommand(text);
  for (const [re, reason] of HARD_DENY) {
    if (re.test(s)) return reason;
  }
  return '';
}

/**
 * Checks if a command is recognized as safe and routinely reversible for development.
 *
 * @param command - Command string
 * @returns True if recognized as a safe prefix
 */
export function knownSafeCommand(command: string): boolean {
  return SAFE_PREFIXES.some((p) => commandStartsWith(command, p));
}

/**
 * Classifies a command into a domain category for signature hashing and policy routing.
 *
 * @param command - Command string
 * @returns Category identifier
 */
export function commandCategory(command: string): string {
  const c = normalizeCommand(command);
  if (!c) return 'non-command';
  const exe = c.split(' ')[0].toLowerCase();
  if (exe === 'git') return 'git';
  if (['npm', 'npx', 'pnpm', 'yarn', 'composer'].includes(exe)) return 'package-tool';
  if (
    ['php', 'phpunit', 'phpstan', 'phpcs', 'node', 'tsc', 'eslint', 'vitest', 'jest'].includes(
      exe
    ) ||
    c.includes('vendor/bin/')
  )
    return 'quality';
  if (['curl', 'wget', 'gh'].includes(exe)) return 'network';
  if (['rm', 'mv', 'cp', 'mkdir', 'touch'].includes(exe)) return 'filesystem';
  return exe;
}

/**
 * Verifies that a target candidate path is strictly inside the root directory,
 * normalizing path separators across Windows and POSIX boundaries.
 *
 * @remarks
 * Security Invariant: Enforces filesystem workspace containment, preventing directory traversal
 * attacks or path manipulation (`../`, absolute path escapes) from escaping the workspace.
 *
 * @param root - Absolute root directory path representing the workspace boundary.
 * @param candidate - Absolute or relative candidate path to validate.
 * @returns True if candidate resides strictly within the root directory boundary.
 */
export function pathInside(root: string, candidate: string): boolean {
  const absRoot = path.resolve(root);
  const absCandidate = path.resolve(root, candidate);
  const rel = path.relative(absRoot, absCandidate);
  return !rel.startsWith('..') && !path.isAbsolute(rel) && rel !== '..';
}
