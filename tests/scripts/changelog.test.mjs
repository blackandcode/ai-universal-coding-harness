/**
 * @fileoverview Automated tests for unreleased changelog recording script and module.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  addUnreleasedEntry,
  formatBullet,
  normalizeChangeType,
  recordUnreleasedChange,
} from '../../scripts/changelog/record-unreleased-change.mjs';

test('normalizeChangeType normalizes canonical and custom types', () => {
  assert.equal(normalizeChangeType('added'), 'Added');
  assert.equal(normalizeChangeType('CHANGED'), 'Changed');
  assert.equal(normalizeChangeType('Fixed'), 'Fixed');
  assert.equal(normalizeChangeType('security'), 'Security');
  assert.equal(normalizeChangeType('deprecated'), 'Deprecated');
  assert.equal(normalizeChangeType('removed'), 'Removed');
  assert.equal(normalizeChangeType(''), 'Changed');
  assert.equal(normalizeChangeType(undefined), 'Changed');
  assert.equal(normalizeChangeType('custom'), 'Custom');
});

test('formatBullet formats messages into clean markdown bullets', () => {
  assert.equal(formatBullet('Simple message'), '- Simple message');
  assert.equal(formatBullet('- Already a bullet'), '- Already a bullet');
  assert.equal(formatBullet('* Asterisk bullet'), '- Asterisk bullet');
  assert.equal(formatBullet('  Indented message  '), '- Indented message');
});

test('recordUnreleasedChange throws when message is empty', () => {
  assert.throws(() => recordUnreleasedChange('', { message: '' }), /Message is required/);
  assert.throws(() => recordUnreleasedChange('', { message: '   ' }), /Message is required/);
});

test('recordUnreleasedChange creates full changelog structure when source is empty', () => {
  const result = recordUnreleasedChange('', {
    type: 'Added',
    message: 'Initial project setup',
  });

  assert.match(result, /^# Changelog/);
  assert.match(result, /## \[Unreleased\]/);
  assert.match(result, /### Added/);
  assert.match(result, /- Initial project setup/);
});

test('recordUnreleasedChange appends bullet to existing category section', () => {
  const initial = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- First added item',
    '',
    '## [1.0.0] - 2026-09-01',
    '',
    '- Baseline release',
  ].join('\n');

  const updated = recordUnreleasedChange(initial, {
    type: 'Added',
    message: 'Second added item',
  });

  assert.match(updated, /- First added item\n- Second added item/);
  assert.match(updated, /## \[1\.0\.0\] - 2026-09-01/);
});

test('recordUnreleasedChange inserts new category section when not present in unreleased', () => {
  const initial = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- First added item',
    '',
    '## [1.0.0] - 2026-09-01',
  ].join('\n');

  const updated = recordUnreleasedChange(initial, {
    type: 'Fixed',
    message: 'Resolved race condition in lock release',
  });

  assert.match(updated, /### Added/);
  assert.match(updated, /### Fixed/);
  assert.match(updated, /- Resolved race condition in lock release/);
  assert.match(updated, /## \[1\.0\.0\] - 2026-09-01/);
});

test('recordUnreleasedChange inserts unreleased section before first release when missing', () => {
  const initial = [
    '# Changelog',
    '',
    'All notable changes to this project are documented here.',
    '',
    '## [2.0.0] - 2026-09-16',
    '',
    '### Added',
    '',
    '- v2 launch',
  ].join('\n');

  const updated = recordUnreleasedChange(initial, {
    type: 'Changed',
    message: 'Modernized script',
  });

  const unreleasedIndex = updated.indexOf('## [Unreleased]');
  const v2Index = updated.indexOf('## [2.0.0] - 2026-09-16');

  assert.ok(unreleasedIndex > 0, 'Unreleased header must exist');
  assert.ok(unreleasedIndex < v2Index, 'Unreleased must precede release section');
  assert.match(updated, /- Modernized script/);
});

test('addUnreleasedEntry writes to changelog file on disk', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-'));
  try {
    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    fs.writeFileSync(
      changelogPath,
      '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n',
      'utf8',
    );

    const result = await addUnreleasedEntry({
      root: tmpDir,
      type: 'Security',
      message: 'Hardened path traversal validation',
    });

    assert.equal(result.type, 'Security');
    assert.equal(result.message, 'Hardened path traversal validation');

    const fileContent = fs.readFileSync(changelogPath, 'utf8');
    assert.match(fileContent, /### Security/);
    assert.match(fileContent, /- Hardened path traversal validation/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('record-unreleased-change CLI runs via subprocess and updates CHANGELOG.md', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-cli-test-'));
  try {
    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    fs.writeFileSync(changelogPath, '# Changelog\n\n## [Unreleased]\n', 'utf8');

    const scriptPath = path.resolve('scripts/changelog/record-unreleased-change.mjs');
    const child = spawnSync(
      process.execPath,
      [scriptPath, '-t', 'Added', 'CLI recorded feature', '--root', tmpDir],
      { encoding: 'utf8' },
    );

    assert.equal(child.status, 0, `CLI failed with stderr: ${child.stderr}`);
    assert.match(child.stdout, /Successfully recorded unreleased \[Added\] change/);

    const content = fs.readFileSync(changelogPath, 'utf8');
    assert.match(content, /### Added/);
    assert.match(content, /- CLI recorded feature/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
