import path from 'node:path';

const HARD_DENY: [RegExp, string][] = [
  [
    /\bgit\s+(?:push|commit|merge|rebase|reset\s+--hard|clean\s+-[^\s]*f|switch|checkout|stash)\b/i,
    'Git lifecycle is owned by the orchestrator.',
  ],
  [/\bgit\s+branch\s+-[dD]\b/i, 'Branch deletion is not allowed.'],
  [/\bsudo\b/i, 'Privilege escalation is not allowed.'],
  [
    /\b(?:mkfs|fdisk|parted|shutdown|reboot|poweroff)\b/i,
    'System-destructive operation is not allowed.',
  ],
  [/\bterraform\s+destroy\b/i, 'Infrastructure destroy is not allowed.'],
  [/\bkubectl\s+delete\b/i, 'Cluster deletion is not allowed.'],
  [/\b(?:npm|pnpm|yarn)\s+publish\b/i, 'Package publishing is not allowed.'],
  [/\brm\s+-[^\s]*r[^\s]*f\s+(?:\/|~|\.\.)/i, 'Broad destructive delete is not allowed.'],
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
  'bash -n',
];

export function normalizeCommand(s = '') {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ');
}
export function commandStartsWith(command: string, prefix: string) {
  const c = normalizeCommand(command).toLowerCase(),
    p = normalizeCommand(prefix).toLowerCase();
  return c === p || c.startsWith(p + ' ');
}
export function hardDangerous(text: string) {
  const s = normalizeCommand(text);
  for (const [re, reason] of HARD_DENY) if (re.test(s)) return reason;
  return '';
}
export function knownSafeCommand(command: string) {
  return SAFE_PREFIXES.some((p) => commandStartsWith(command, p));
}
export function commandCategory(command: string) {
  const c = normalizeCommand(command);
  if (!c) return 'non-command';
  const exe = c.split(' ')[0].toLowerCase();
  if (exe === 'git') return 'git';
  if (['npm', 'npx', 'pnpm', 'yarn', 'composer'].includes(exe)) return 'package-tool';
  if (
    ['php', 'phpunit', 'phpstan', 'phpcs', 'node', 'tsc', 'eslint', 'vitest', 'jest'].includes(
      exe,
    ) ||
    c.includes('vendor/bin/')
  )
    return 'quality';
  if (['curl', 'wget', 'gh'].includes(exe)) return 'network';
  if (['rm', 'mv', 'cp', 'mkdir', 'touch'].includes(exe)) return 'filesystem';
  return exe;
}
export function pathInside(root: string, candidate: string) {
  const abs = path.resolve(root, candidate);
  const rel = path.relative(root, abs);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}
