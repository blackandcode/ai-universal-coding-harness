/**
 * @fileoverview Unit tests for StageSource in src/stages/StageSource.ts.
 *
 * Validates stage directory resolution, zip archive unpacking, unsafe zip path/symlink detection,
 * stage manifest extraction, multi-feature stage filtering, ambiguity resolution, and markdown
 * structural validation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { StageSource, selectorNum } from './StageSource.js';
import { StageSourceError } from '../errors.js';

function fixture(valid = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-harness-stage-test-'));
  const stage = path.join(root, 'stage-06-example-feature');
  fs.mkdirSync(stage, { recursive: true });
  fs.writeFileSync(
    path.join(stage, 'functional-spec.md'),
    '# Functional Specification\n\n## Acceptance Criteria\n- Works.\n',
  );
  fs.writeFileSync(
    path.join(stage, 'technical-spec.md'),
    '# Technical Specification\n\nImplementation details.\n',
  );
  fs.writeFileSync(
    path.join(stage, 'prompt.md'),
    valid
      ? '# Implementation Prompt\n\nImplement the specification.\n'
      : 'no markdown heading here',
  );
  return { root, stage };
}

test('validates a structured stage package', () => {
  const f = fixture();
  const src = new StageSource(f.root);
  try {
    const dir = src.resolve('06');
    assert.equal(dir, f.stage);
    assert.equal(src.validateDir(dir).valid, true);

    const manifest = src.manifest(dir, '06');
    assert.equal(manifest.name, 'stage-06-example-feature');
    assert.ok(manifest.sha256['functional-spec.md']);
    assert.ok(manifest.sha256['technical-spec.md']);
    assert.ok(manifest.sha256['prompt.md']);
  } finally {
    src.close();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('rejects stage files without required markdown structure', () => {
  const f = fixture(false);
  const src = new StageSource(f.root);
  try {
    assert.throws(() => src.resolve('06'), /prompt\.md must contain at least one Markdown heading/);
  } finally {
    src.close();
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('selectorNum normalizes numeric and stage-named selectors', () => {
  assert.equal(selectorNum('6'), '06');
  assert.equal(selectorNum('06'), '06');
  assert.equal(selectorNum('stage-06-my-feature'), '06');
  assert.throws(() => selectorNum('invalid'), StageSourceError);
});

test('StageSource unpacks and validates zip archives', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-zip-test-'));
  try {
    const zipPath = path.join(tmpDir, 'stages.zip');
    const zip = new AdmZip();
    zip.addFile(
      'feature-a/stage-01-setup/functional-spec.md',
      Buffer.from('# Functional\n\nSpec content.\n'),
    );
    zip.addFile(
      'feature-a/stage-01-setup/technical-spec.md',
      Buffer.from('# Technical\n\nTech content.\n'),
    );
    zip.addFile(
      'feature-a/stage-01-setup/prompt.md',
      Buffer.from('# Prompt\n\nPrompt instructions.\n'),
    );
    zip.writeZip(zipPath);

    const src = new StageSource(zipPath);
    try {
      const stages = src.list();
      assert.equal(stages.length, 1);
      assert.ok(stages[0].includes('stage-01-setup'));

      const resolved = src.resolve('01');
      assert.ok(resolved.endsWith('stage-01-setup'));
      assert.equal(src.validateDir(resolved).valid, true);
    } finally {
      src.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('StageSource rejects unsafe entries in zip archives', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-zip-unsafe-'));
  try {
    const zipPath = path.join(tmpDir, 'unsafe.zip');
    const zip = new AdmZip();
    zip.addFile('outside.txt', Buffer.from('malicious content'));
    zip.getEntries()[0].entryName = '../outside.txt';
    zip.writeZip(zipPath);

    assert.throws(() => new StageSource(zipPath), /Unsafe ZIP entry rejected/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('StageSource: handles missing stage and ambiguous selectors', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-ambig-'));
  try {
    const stageA = path.join(tmpDir, 'feature-a', 'stage-01-core');
    const stageB = path.join(tmpDir, 'feature-b', 'stage-01-core');
    fs.mkdirSync(stageA, { recursive: true });
    fs.mkdirSync(stageB, { recursive: true });
    for (const d of [stageA, stageB]) {
      fs.writeFileSync(path.join(d, 'functional-spec.md'), '# Functional\nSpec\n');
      fs.writeFileSync(path.join(d, 'technical-spec.md'), '# Technical\nSpec\n');
      fs.writeFileSync(path.join(d, 'prompt.md'), '# Prompt\nPrompt\n');
    }

    const src = new StageSource(tmpDir);
    try {
      // Missing selector
      assert.throws(() => src.find('99'), /No stage matched '99'/);

      // Ambiguous selector
      assert.throws(() => src.find('01'), /ambiguous/);

      // Disambiguated by feature
      const resolved = src.find('01', 'feature-a');
      assert.equal(resolved, stageA);

      // validateAll
      const reports = src.validateAll();
      assert.equal(reports.length, 2);
      assert.ok(reports.every((r) => r.valid));
    } finally {
      src.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('StageSource: validateDir flags invalid stage structures and corrupted files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-val-'));
  try {
    const src = new StageSource(tmpDir);

    // 1. Nonexistent directory
    const r1 = src.validateDir(path.join(tmpDir, 'does-not-exist'));
    assert.equal(r1.valid, false);
    assert.ok(r1.issues.some((i) => i.message.includes('does not exist')));

    // 2. Bad folder name (not stage-NN-kebab)
    const badNameDir = path.join(tmpDir, 'bad_stage_name');
    fs.mkdirSync(badNameDir);
    const r2 = src.validateDir(badNameDir);
    assert.equal(r2.valid, false);
    assert.ok(r2.issues.some((i) => i.message.includes('stage-NN-kebab-case-name')));

    // 3. Missing files, empty file, missing heading, binary data
    const stageDir = path.join(tmpDir, 'stage-01-issues');
    fs.mkdirSync(stageDir);
    fs.writeFileSync(path.join(stageDir, 'functional-spec.md'), ''); // empty
    fs.writeFileSync(path.join(stageDir, 'technical-spec.md'), 'plain text with no heading');
    fs.writeFileSync(path.join(stageDir, 'prompt.md'), '# Heading\nwith binary \u0000 nul');

    const r3 = src.validateDir(stageDir);
    assert.equal(r3.valid, false);
    assert.ok(r3.issues.some((i) => i.message.includes('must not be empty')));
    assert.ok(r3.issues.some((i) => i.message.includes('at least one Markdown heading')));
    assert.ok(r3.issues.some((i) => i.message.includes('contains binary/NUL data')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
