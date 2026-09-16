/**
 * @fileoverview Version synchronization module for AI Universal Coding Harness.
 * Calculates semver increments, synchronizes package manifests, TypeScript version constants,
 * documentation references, and promotes unreleased CHANGELOG entries to release notes.
 */

import { access, chmod, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const DEFAULT_EXCLUDES = [
  '.git/**',
  '.svn/**',
  '.hg/**',
  'node_modules/**',
  'vendor/**',
  'build/**',
  'dist/**',
  'coverage/**',
  'tests/coverage/**',
  '.ai-orchestrator/**',
  'ai-universal-coding-harness-rewrite-plan/**',
  '.agents/**',
  '.cursor/**',
  'playwright-report/**',
  'test-results/**',
  'tests/test-results/**',
  'bruno/reports/**',
  '.auth/**',
  '.phpunit.cache/**',
  '.wp-env/**',
  'tests/fixtures/**',
  'tests/scripts/**',
  '**/*.zip',
  '**/*.tar',
  '**/*.tar.gz',
  '**/*.tgz',
  '**/*.7z',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.webp',
  '**/*.ico',
  '**/*.woff',
  '**/*.woff2',
  '**/*.ttf',
  '**/*.eot',
  '**/*.pdf',
];

const STRUCTURED_FILES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'composer.json',
  'src/version.ts',
]);

const HISTORY_FILES = new Set(['CHANGELOG.md']);

const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

export function parseSemver(value) {
  const match = SEMVER_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid semantic version: ${value}`);
  }

  return {
    raw: value,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] ? match[5].split('.') : [],
  };
}

export function bumpSemver(version, bumpType) {
  const parsed = parseSemver(version);
  const type = String(bumpType || '').toLowerCase();
  switch (type) {
    case 'major':
      return `${parsed.major + 1}.0.0`;
    case 'minor':
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case 'patch':
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    default:
      throw new Error(`Invalid bump type: "${bumpType}". Expected "patch", "minor", or "major".`);
  }
}

function compareIdentifier(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Number(left) - Number(right);
  }
  if (leftNumeric) {
    return -1;
  }
  if (rightNumeric) {
    return 1;
  }
  return left.localeCompare(right);
}

export function compareSemver(leftValue, rightValue) {
  const left = parseSemver(leftValue);
  const right = parseSemver(rightValue);

  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) {
      return left[key] - right[key];
    }
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) {
    return 0;
  }
  if (left.prerelease.length === 0) {
    return 1;
  }
  if (right.prerelease.length === 0) {
    return -1;
  }

  const maxLength = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];

    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }

    const comparison = compareIdentifier(leftPart, rightPart);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function verifyPhpVersionOrdering(currentVersion, targetVersion) {
  const php = spawnSync(
    'php',
    [
      '-r',
      'exit(version_compare($argv[1], $argv[2], ">") ? 0 : 1);',
      targetVersion,
      currentVersion,
    ],
    { encoding: 'utf8' },
  );

  if (php.error?.code === 'ENOENT') {
    return { checked: false, reason: 'PHP CLI is not available on PATH.' };
  }
  if (php.error) {
    throw new Error(`Unable to run PHP version_compare(): ${php.error.message}`);
  }
  if (php.status !== 0) {
    throw new Error(
      `PHP version_compare() does not consider ${targetVersion} greater than ${currentVersion}.`,
    );
  }

  return { checked: true };
}

function normalizePath(root, absolutePath) {
  return relative(root, absolutePath).split('\\').join('/');
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  const source = await readFile(path, 'utf8');
  try {
    return { source, value: JSON.parse(source) };
  } catch (error) {
    throw new Error(`Cannot parse JSON file ${path}: ${error.message}`);
  }
}

function stringifyJson(value, originalSource) {
  const indentationMatch = originalSource.match(/\n([ \t]+)"/);
  const indentation = indentationMatch ? indentationMatch[1] : '  ';
  const newline = originalSource.includes('\r\n') ? '\r\n' : '\n';
  return `${JSON.stringify(value, null, indentation).replaceAll('\n', newline)}${newline}`;
}

export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createVersionRegex(version) {
  return new RegExp(`(?<![\\d.])${escapeRegex(version)}(?![\\d.])`, 'g');
}

function isLikelyBinary(buffer) {
  const sampleLength = Math.min(buffer.length, 8192);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }
  return false;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function updateChangelog(source, { currentVersion, targetVersion, date, message }) {
  if (source.includes(`## [${targetVersion}]`)) {
    throw new Error(`CHANGELOG.md already contains version ${targetVersion}.`);
  }

  const fallbackBody = [
    '### Changed',
    '',
    `- ${
      message ||
      `Synchronized package version from \`${currentVersion}\` to \`${targetVersion}\` using \`npm run update-version\`.`
    }`,
  ].join('\n');

  const releaseHeading = `## [${targetVersion}] - ${date}`;
  const unreleasedHeading = '## [Unreleased]';

  if (!source.trim()) {
    return [
      '# Changelog',
      '',
      'All notable changes to this project are documented in this file.',
      '',
      unreleasedHeading,
      '',
      releaseHeading,
      '',
      fallbackBody,
      '',
    ].join('\n');
  }

  const unreleasedIndex = source.indexOf(unreleasedHeading);
  if (unreleasedIndex === -1) {
    const firstHeadingEnd = source.indexOf('\n');
    const insertionIndex = firstHeadingEnd === -1 ? source.length : firstHeadingEnd + 1;
    return `${source.slice(
      0,
      insertionIndex,
    )}\n${unreleasedHeading}\n\n${releaseHeading}\n\n${fallbackBody}\n${source.slice(
      insertionIndex,
    )}`;
  }

  const bodyStart = unreleasedIndex + unreleasedHeading.length;
  const remainder = source.slice(bodyStart);
  const nextReleaseMatch = remainder.match(/\n## \[(?!Unreleased\])[^\n]+/);
  const bodyEnd = nextReleaseMatch ? bodyStart + nextReleaseMatch.index : source.length;
  const unreleasedBody = source.slice(bodyStart, bodyEnd);

  let releaseBody;
  const trimmedUnreleased = unreleasedBody.trim();
  if (trimmedUnreleased) {
    if (message) {
      releaseBody = `${message.trim()}\n\n${trimmedUnreleased}`;
    } else {
      releaseBody = trimmedUnreleased;
    }
  } else {
    releaseBody = fallbackBody;
  }

  return [
    source.slice(0, bodyStart),
    '\n\n',
    releaseHeading,
    '\n\n',
    releaseBody,
    '\n',
    source.slice(bodyEnd).replace(/^\n+/, '\n'),
  ].join('');
}

function addChange(changes, absolutePath, before, after, metadata = {}) {
  if (before === after) {
    return;
  }
  changes.set(absolutePath, {
    before,
    after,
    occurrences: metadata.occurrences ?? 0,
    kind: metadata.kind ?? 'text',
  });
}

async function prepareStructuredChanges(root, currentVersion, targetVersion, changes) {
  const packagePath = join(root, 'package.json');
  if (!(await fileExists(packagePath))) {
    throw new Error(`package.json is required at ${packagePath}.`);
  }

  const packageJson = await readJson(packagePath);
  if (typeof packageJson.value.version !== 'string') {
    throw new Error('package.json must contain a string version field.');
  }
  if (packageJson.value.version !== currentVersion) {
    throw new Error(
      `package.json version changed during execution: expected ${currentVersion}, found ${packageJson.value.version}.`,
    );
  }
  packageJson.value.version = targetVersion;
  addChange(
    changes,
    packagePath,
    packageJson.source,
    stringifyJson(packageJson.value, packageJson.source),
    {
      kind: 'package-json',
      occurrences: 1,
    },
  );

  for (const filename of ['package-lock.json', 'npm-shrinkwrap.json']) {
    const path = join(root, filename);
    if (!(await fileExists(path))) {
      continue;
    }

    const lock = await readJson(path);
    let updated = false;
    if (lock.value.version === currentVersion) {
      lock.value.version = targetVersion;
      updated = true;
    }
    if (lock.value.packages?.['']?.version === currentVersion) {
      lock.value.packages[''].version = targetVersion;
      updated = true;
    }
    if (updated) {
      addChange(changes, path, lock.source, stringifyJson(lock.value, lock.source), {
        kind: 'npm-lock-root',
        occurrences: 1,
      });
    }
  }

  const versionTsPath = join(root, 'src', 'version.ts');
  if (await fileExists(versionTsPath)) {
    const versionTsSource = await readFile(versionTsPath, 'utf8');
    const versionTsRegex = new RegExp(`(VERSION\\s*=\\s*['"])${escapeRegex(currentVersion)}(['"])`);
    if (versionTsRegex.test(versionTsSource)) {
      const updatedVersionTs = versionTsSource.replace(versionTsRegex, `$1${targetVersion}$2`);
      addChange(changes, versionTsPath, versionTsSource, updatedVersionTs, {
        kind: 'version-ts',
        occurrences: 1,
      });
    }
  }

  const composerPath = join(root, 'composer.json');
  if (await fileExists(composerPath)) {
    const composer = await readJson(composerPath);
    if (composer.value.version !== undefined && composer.value.version !== currentVersion) {
      throw new Error(
        `composer.json version ${composer.value.version} does not match package.json version ${currentVersion}.`,
      );
    }
    if (composer.value.version === currentVersion) {
      composer.value.version = targetVersion;
      addChange(
        changes,
        composerPath,
        composer.source,
        stringifyJson(composer.value, composer.source),
        {
          kind: 'composer-json',
          occurrences: 1,
        },
      );
    }
  }
}

async function prepareTextChanges(root, currentVersion, targetVersion, changes) {
  const scanned = [];
  const seen = new Set();

  for await (const entry of glob(['**/*', '.*', '**/.*'], {
    cwd: root,
    exclude: DEFAULT_EXCLUDES,
    followSymlinks: false,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) {
      continue;
    }

    const absolutePath = resolve(entry.parentPath ?? dirname(join(root, entry.name)), entry.name);
    const projectPath = normalizePath(root, absolutePath);
    if (seen.has(projectPath)) {
      continue;
    }
    seen.add(projectPath);

    if (
      STRUCTURED_FILES.has(projectPath) ||
      HISTORY_FILES.has(projectPath) ||
      projectPath === '.env' ||
      projectPath.endsWith('/.env')
    ) {
      continue;
    }

    const fileStat = await stat(absolutePath);
    if (fileStat.size > MAX_TEXT_FILE_BYTES) {
      continue;
    }

    const buffer = await readFile(absolutePath);
    if (isLikelyBinary(buffer)) {
      continue;
    }

    const source = buffer.toString('utf8');
    const versionRegex = createVersionRegex(currentVersion);
    const matches = source.match(versionRegex);
    const occurrences = matches ? matches.length : 0;
    scanned.push(projectPath);

    if (occurrences === 0) {
      continue;
    }

    const after = source.replace(versionRegex, targetVersion);
    addChange(changes, absolutePath, source, after, {
      kind: 'text',
      occurrences,
    });
  }

  return { scanned };
}

async function prepareHistoryChanges(
  root,
  currentVersion,
  targetVersion,
  date,
  changelogMessage,
  changes,
) {
  const changelogPath = join(root, 'CHANGELOG.md');
  const changelogBefore = (await fileExists(changelogPath))
    ? await readFile(changelogPath, 'utf8')
    : '';
  const changelogAfter = updateChangelog(changelogBefore, {
    currentVersion,
    targetVersion,
    date,
    message: changelogMessage,
  });
  addChange(changes, changelogPath, changelogBefore, changelogAfter, {
    kind: 'changelog',
  });
}

async function commitChanges(changes) {
  const committed = [];
  try {
    for (const [path, change] of changes) {
      const existed = await fileExists(path);
      const mode = existed ? (await stat(path)).mode : 0o644;
      const temporaryPath = `${path}.version-update-${process.pid}.tmp`;

      await writeFile(temporaryPath, change.after, {
        encoding: 'utf8',
        mode,
      });
      await chmod(temporaryPath, mode);
      await rename(temporaryPath, path);
      committed.push({ path, existed, before: change.before, mode });
    }
  } catch (error) {
    for (const item of committed.reverse()) {
      if (item.existed) {
        await writeFile(item.path, item.before, {
          encoding: 'utf8',
          mode: item.mode,
        });
        await chmod(item.path, item.mode);
      } else {
        await rm(item.path, { force: true });
      }
    }
    throw new Error(`Version update failed and committed files were rolled back: ${error.message}`);
  }
}

async function verifyResult(root, targetVersion) {
  const packagePath = join(root, 'package.json');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  if (packageJson.version !== targetVersion) {
    throw new Error(
      `Verification failed: package.json contains ${packageJson.version}, expected ${targetVersion}.`,
    );
  }

  const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
  if (!changelog.includes(`## [${targetVersion}]`)) {
    throw new Error(`Verification failed: CHANGELOG.md has no ${targetVersion} release entry.`);
  }

  const versionTsPath = join(root, 'src', 'version.ts');
  if (await fileExists(versionTsPath)) {
    const versionTs = await readFile(versionTsPath, 'utf8');
    if (
      !versionTs.includes(`VERSION = '${targetVersion}'`) &&
      !versionTs.includes(`VERSION = "${targetVersion}"`)
    ) {
      throw new Error(
        `Verification failed: src/version.ts does not contain VERSION = '${targetVersion}'.`,
      );
    }
  }

  const readmePath = join(root, 'readme.txt');
  if (await fileExists(readmePath)) {
    const readme = await readFile(readmePath, 'utf8');
    const stableTagRegex = new RegExp(`Stable tag:\\s*${escapeRegex(targetVersion)}`, 'i');
    if (!stableTagRegex.test(readme)) {
      throw new Error(
        `Verification failed: readme.txt Stable tag does not match ${targetVersion}.`,
      );
    }
  }
}

function parseSimpleEnv(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

export async function synchronizeVersion({
  root = process.cwd(),
  targetVersion: explicitTargetVersion,
  bump,
  changelog,
  decision,
  envFile = '.env',
  date,
  dryRun = false,
  allowDowngrade = false,
  checkPhp = false,
}) {
  const packagePath = join(root, 'package.json');
  if (!(await fileExists(packagePath))) {
    throw new Error(`No package.json found at ${packagePath}.`);
  }

  const { value: packageJson } = await readJson(packagePath);
  const currentVersion = packageJson.version;
  if (!currentVersion) {
    throw new Error('package.json must contain a "version" string.');
  }

  const envPath = join(root, envFile);
  const envContent = (await fileExists(envPath)) ? await readFile(envPath, 'utf8') : '';
  const env = parseSimpleEnv(envContent);

  let targetVersion = explicitTargetVersion;
  if (!targetVersion && bump) {
    targetVersion = bumpSemver(currentVersion, bump);
  }
  if (!targetVersion) {
    targetVersion = env.TARGET_VERSION || env.VERSION;
  }
  if (!targetVersion) {
    throw new Error(
      'Target version is required. Provide a version (e.g. "2.1.0"), a bump type ("--bump patch|minor|major"), or set TARGET_VERSION in .env.',
    );
  }

  const effectiveDate = date || env.TARGET_VERSION_DATE || todayIso();
  const changelogMessage =
    changelog || decision || env.TARGET_VERSION_CHANGELOG || env.VERSION_CHANGELOG;

  const comparison = compareSemver(targetVersion, currentVersion);
  if (comparison === 0) {
    return {
      alreadyImplemented: true,
      currentVersion,
      targetVersion,
      date: effectiveDate,
      scannedFiles: 0,
      phpVersionOrdering: {
        checked: false,
        reason: 'Versions are identical.',
      },
    };
  }

  if (comparison < 0 && !allowDowngrade) {
    throw new Error(
      `Target version ${targetVersion} is lower than current version ${currentVersion}. Use --allow-downgrade to proceed.`,
    );
  }

  let phpVersionOrdering = {
    checked: false,
    reason: 'Not required for Node.js package.',
  };
  if (checkPhp) {
    phpVersionOrdering = verifyPhpVersionOrdering(currentVersion, targetVersion);
  }

  const changes = new Map();
  await prepareStructuredChanges(root, currentVersion, targetVersion, changes);
  const { scanned } = await prepareTextChanges(root, currentVersion, targetVersion, changes);
  await prepareHistoryChanges(
    root,
    currentVersion,
    targetVersion,
    effectiveDate,
    changelogMessage,
    changes,
  );

  if (!dryRun) {
    await commitChanges(changes);
    await verifyResult(root, targetVersion);
  }

  return {
    alreadyImplemented: false,
    dryRun,
    currentVersion,
    targetVersion,
    date: effectiveDate,
    scannedFiles: scanned.length,
    modifiedFiles: changes.size,
    phpVersionOrdering,
    changes: Array.from(changes.entries()).map(([path, data]) => ({
      path: normalizePath(root, path),
      kind: data.kind,
      occurrences: data.occurrences,
    })),
  };
}
