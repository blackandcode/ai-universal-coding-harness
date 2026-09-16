/**
 * @fileoverview Automated tests for version synchronization and release packaging.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  bumpSemver,
  compareSemver,
  createVersionRegex,
  escapeRegex,
  parseSemver,
  synchronizeVersion,
  updateChangelog
} from '../../scripts/versioning/version-sync.mjs';

test('parseSemver parses valid semantic versions and rejects invalid', () => {
  const parsed = parseSemver('2.1.3-beta.1+build.123');
  assert.equal(parsed.major, 2);
  assert.equal(parsed.minor, 1);
  assert.equal(parsed.patch, 3);
  assert.deepEqual(parsed.prerelease, ['beta', '1']);
  assert.deepEqual(parsed.build, ['build', '123']);

  assert.throws(() => parseSemver('invalid.version'), /Invalid semantic version/);
  assert.throws(() => parseSemver('1.0'), /Invalid semantic version/);
  assert.throws(() => parseSemver('v1.0.0'), /Invalid semantic version/);
});

test('bumpSemver increments major, minor, and patch correctly', () => {
  assert.equal(bumpSemver('1.2.3', 'patch'), '1.2.4');
  assert.equal(bumpSemver('1.2.3', 'minor'), '1.3.0');
  assert.equal(bumpSemver('1.2.3', 'major'), '2.0.0');
  assert.throws(() => bumpSemver('1.2.3', 'invalid'), /Invalid bump type/);
});

test('compareSemver accurately compares semantic version precedence', () => {
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
  assert.ok(compareSemver('2.0.0', '1.9.9') > 0);
  assert.ok(compareSemver('1.2.0', '1.1.9') > 0);
  assert.ok(compareSemver('1.2.3', '1.2.2') > 0);
  assert.ok(compareSemver('1.0.0-alpha', '1.0.0') < 0);
  assert.ok(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.2') < 0);
});

test('createVersionRegex and escapeRegex match exact version boundaries', () => {
  const regex = createVersionRegex('2.0.0');
  assert.ok(regex.test('Current version: 2.0.0 in text'));
  regex.lastIndex = 0;
  assert.ok(!regex.test('Version 12.0.09 is different'));
  assert.equal(escapeRegex('1.0.0+test[1]'), '1\\.0\\.0\\+test\\[1\\]');
});

test('updateChangelog promotes unreleased section and creates fresh unreleased block', () => {
  const initial = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- Autonomous recovery manager',
    '',
    '## [1.0.0] - 2026-09-01',
    '',
    '- Initial release'
  ].join('\n');

  const updated = updateChangelog(initial, {
    currentVersion: '1.0.0',
    targetVersion: '1.1.0',
    date: '2026-09-16'
  });

  assert.match(updated, /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-09-16/);
  assert.match(updated, /### Added\n\n- Autonomous recovery manager/);
  assert.match(updated, /## \[1\.0\.0\] - 2026-09-01/);

  // Throws if version already exists
  assert.throws(
    () =>
      updateChangelog(updated, {
        currentVersion: '1.1.0',
        targetVersion: '1.1.0',
        date: '2026-09-16'
      }),
    /already contains version 1\.1\.0/
  );
});

test('synchronizeVersion --dry-run does not modify files on disk', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-dryrun-'));
  try {
    const pkgPath = path.join(tmpDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'test-pkg', version: '1.0.0' }, null, 2));

    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    fs.writeFileSync(changelogPath, '# Changelog\n\n## [Unreleased]\n\n- Feature\n');

    const result = await synchronizeVersion({
      root: tmpDir,
      bump: 'patch',
      dryRun: true
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.currentVersion, '1.0.0');
    assert.equal(result.targetVersion, '1.0.1');

    // Asserts file on disk was NOT changed
    const pkgAfter = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.equal(pkgAfter.version, '1.0.0');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('synchronizeVersion atomically updates package.json, lockfile, src/version.ts, and changelog', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-full-'));
  try {
    const pkgPath = path.join(tmpDir, 'package.json');
    fs.writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: 'test-harness',
          version: '1.0.0',
          dependencies: { ink: '7.1.1' }
        },
        null,
        2
      )
    );

    const lockPath = path.join(tmpDir, 'package-lock.json');
    fs.writeFileSync(
      lockPath,
      JSON.stringify(
        {
          name: 'test-harness',
          version: '1.0.0',
          packages: {
            '': { name: 'test-harness', version: '1.0.0' },
            'node_modules/ink': { version: '7.1.1' }
          }
        },
        null,
        2
      )
    );

    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const versionTsPath = path.join(srcDir, 'version.ts');
    fs.writeFileSync(versionTsPath, "export const VERSION = '1.0.0';\n");

    const readmePath = path.join(tmpDir, 'README.md');
    fs.writeFileSync(readmePath, '# Test Harness\n\nCurrent version: 1.0.0\n');

    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    fs.writeFileSync(
      changelogPath,
      '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Verified version sync\n'
    );

    const result = await synchronizeVersion({
      root: tmpDir,
      bump: 'minor'
    });

    assert.equal(result.currentVersion, '1.0.0');
    assert.equal(result.targetVersion, '1.1.0');
    assert.equal(result.dryRun, false);

    // Verify package.json
    const updatedPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.equal(updatedPkg.version, '1.1.0');

    // Verify package-lock.json (root package updated, dependency preserved)
    const updatedLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.equal(updatedLock.version, '1.1.0');
    assert.equal(updatedLock.packages[''].version, '1.1.0');
    assert.equal(updatedLock.packages['node_modules/ink'].version, '7.1.1');

    // Verify src/version.ts
    const updatedVersionTs = fs.readFileSync(versionTsPath, 'utf8');
    assert.match(updatedVersionTs, /VERSION = '1\.1\.0'/);

    // Verify README.md
    const updatedReadme = fs.readFileSync(readmePath, 'utf8');
    assert.match(updatedReadme, /Current version: 1\.1\.0/);

    // Verify CHANGELOG.md
    const updatedChangelog = fs.readFileSync(changelogPath, 'utf8');
    assert.match(updatedChangelog, /## \[Unreleased\]\n\n## \[1\.1\.0\]/);
    assert.match(updatedChangelog, /- Verified version sync/);

    // Verify alreadyImplemented check
    const sameResult = await synchronizeVersion({
      root: tmpDir,
      targetVersion: '1.1.0'
    });
    assert.equal(sameResult.alreadyImplemented, true);

    // Verify downgrade rejection without flag
    await assert.rejects(
      async () =>
        synchronizeVersion({
          root: tmpDir,
          targetVersion: '1.0.0'
        }),
      /lower than current version/
    );

    // Verify downgrade allowed with flag
    const downgradeResult = await synchronizeVersion({
      root: tmpDir,
      targetVersion: '1.0.0',
      allowDowngrade: true
    });
    assert.equal(downgradeResult.targetVersion, '1.0.0');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('increase-version CLI runs via subprocess and performs dry-run', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-cli-test-'));
  try {
    const pkgPath = path.join(tmpDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'test-cli-pkg', version: '2.0.0' }, null, 2));

    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    fs.writeFileSync(changelogPath, '# Changelog\n\n## [Unreleased]\n');

    const scriptPath = path.resolve('scripts/versioning/increase-version.mjs');
    const child = spawnSync(
      process.execPath,
      [scriptPath, 'patch', '--dry-run', '--root', tmpDir],
      { encoding: 'utf8' }
    );

    assert.equal(child.status, 0, `CLI failed with stderr: ${child.stderr}`);
    assert.match(child.stdout, /Planned package version 2\.0\.0 -> 2\.0\.1/);
    assert.match(child.stdout, /Dry run completed successfully/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
