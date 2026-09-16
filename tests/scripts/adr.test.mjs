/**
 * @fileoverview Automated tests for Architecture Decision Record (ADR) scaffolding script.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createNewAdr,
  findNextAdrNumber,
  renderAdrTemplate,
  slugify,
  updateAdrIndex
} from '../../scripts/adr/new-adr.mjs';

test('slugify transforms arbitrary titles into clean URL-safe slugs', () => {
  assert.equal(slugify('Choose SQLite for state'), 'choose-sqlite-for-state');
  assert.equal(slugify('  ADR: Special & Characters / Test!  '), 'adr-special-characters-test');
  assert.equal(slugify('already-slugified-123'), 'already-slugified-123');
  assert.equal(slugify('---leading-trailing---'), 'leading-trailing');
});

test('renderAdrTemplate renders nygard, madr, and harness templates', () => {
  const nygard = renderAdrTemplate('nygard', 'Choose Storage', '2026-09-16');
  assert.match(nygard, /# Choose Storage/);
  assert.match(nygard, /## Context/);
  assert.match(nygard, /## Decision/);
  assert.match(nygard, /## Consequences/);

  const madr = renderAdrTemplate('madr', 'Choose Storage', '2026-09-16');
  assert.match(madr, /# Choose Storage/);
  assert.match(madr, /## Context and Problem Statement/);
  assert.match(madr, /## Considered Options/);
  assert.match(madr, /## Decision Outcome/);

  const harness = renderAdrTemplate('harness', 'Choose Storage', '2026-09-16');
  assert.match(harness, /# ADR: Choose Storage/);
  assert.match(harness, /## Alternatives considered/);
  assert.match(harness, /## Revisit triggers/);
});

test('updateAdrIndex builds index table and appends entries cleanly', () => {
  const initial = updateAdrIndex('', {
    number: '0001',
    title: 'First Decision',
    filename: '0001-first-decision.md',
    date: '2026-09-16'
  });

  assert.match(initial, /# Architecture Decision Records \(ADR\)/);
  assert.match(
    initial,
    /\| \[0001\]\(0001-first-decision\.md\) \| First Decision \| Proposed \| 2026-09-16 \|/
  );

  const updated = updateAdrIndex(initial, {
    number: '0002',
    title: 'Second Decision',
    filename: '0002-second-decision.md',
    date: '2026-09-17'
  });

  assert.match(updated, /\| \[0001\]\(0001-first-decision\.md\)/);
  assert.match(
    updated,
    /\| \[0002\]\(0002-second-decision\.md\) \| Second Decision \| Proposed \| 2026-09-17 \|/
  );

  // Does not duplicate already indexed record
  const deduped = updateAdrIndex(updated, {
    number: '0002',
    title: 'Second Decision',
    filename: '0002-second-decision.md',
    date: '2026-09-17'
  });
  const matches = deduped.match(/\[0002\]/g);
  assert.equal(matches?.length, 1);
});

test('findNextAdrNumber scans directory and returns padded sequence', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-seq-'));
  try {
    assert.equal(await findNextAdrNumber(tmpDir), '0001');

    fs.writeFileSync(path.join(tmpDir, '0001-first.md'), 'test');
    assert.equal(await findNextAdrNumber(tmpDir), '0002');

    fs.writeFileSync(path.join(tmpDir, '0005-gap.md'), 'test');
    assert.equal(await findNextAdrNumber(tmpDir), '0006');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createNewAdr scaffolds ADR file and updates README index', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-create-'));
  try {
    // Dry run
    const dryRun = await createNewAdr({
      root: tmpDir,
      title: 'Dry Run Decision',
      dryRun: true
    });
    assert.equal(dryRun.dryRun, true);
    assert.equal(fs.existsSync(dryRun.filePath), false);

    // First ADR
    const adr1 = await createNewAdr({
      root: tmpDir,
      title: 'Decide Process Runner',
      template: 'nygard'
    });
    assert.equal(adr1.number, '0001');
    assert.equal(fs.existsSync(adr1.filePath), true);

    const content1 = fs.readFileSync(adr1.filePath, 'utf8');
    assert.match(content1, /# Decide Process Runner/);

    const index1 = fs.readFileSync(path.join(tmpDir, 'docs', 'adr', 'README.md'), 'utf8');
    assert.match(index1, /\[0001\]\(0001-decide-process-runner\.md\)/);

    // Second ADR
    const adr2 = await createNewAdr({
      root: tmpDir,
      title: 'Protocol Schema Validation',
      template: 'madr'
    });
    assert.equal(adr2.number, '0002');
    assert.equal(fs.existsSync(adr2.filePath), true);

    const index2 = fs.readFileSync(path.join(tmpDir, 'docs', 'adr', 'README.md'), 'utf8');
    assert.match(index2, /\[0001\]\(0001-decide-process-runner\.md\)/);
    assert.match(index2, /\[0002\]\(0002-protocol-schema-validation\.md\)/);

    // Rejects empty title
    await assert.rejects(
      async () => createNewAdr({ root: tmpDir, title: '' }),
      /ADR title is required/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('new-adr CLI runs via subprocess and scaffolds ADR', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-cli-test-'));
  try {
    const scriptPath = path.resolve('scripts/adr/new-adr.mjs');
    const child = spawnSync(
      process.execPath,
      [scriptPath, '-t', 'CLI Scaffolding Test', '--root', tmpDir],
      { encoding: 'utf8' }
    );

    assert.equal(child.status, 0, `CLI failed with stderr: ${child.stderr}`);
    assert.match(child.stdout, /Successfully created ADR 0001/);

    const adrPath = path.join(tmpDir, 'docs', 'adr', '0001-cli-scaffolding-test.md');
    assert.equal(fs.existsSync(adrPath), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
