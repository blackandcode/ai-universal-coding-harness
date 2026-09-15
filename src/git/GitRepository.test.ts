import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execSync} from 'node:child_process';
import {GitRepository} from './GitRepository.js';

test('GitRepository.diffCheck returns ok on clean repo', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-repo-test-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello world\n');
    execSync('git add test.txt && git commit -m "initial"', { cwd: tmpDir });

    const git = new GitRepository(tmpDir);
    const result = git.diffCheck('HEAD');
    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GitRepository.patchFingerprint is deterministic and untracked-aware', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-repo-fp-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'initial content\n');
    execSync('git add file1.txt && git commit -m "initial"', { cwd: tmpDir });

    const git = new GitRepository(tmpDir);
    const cleanFp1 = git.patchFingerprint();
    const cleanFp2 = git.patchFingerprint();
    assert.equal(cleanFp1.length, 64);
    assert.equal(cleanFp1, cleanFp2);

    // Tracked modification changes fingerprint
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'modified content\n');
    const modifiedFp = git.patchFingerprint();
    assert.notEqual(modifiedFp, cleanFp1);

    // Reverting restores clean fingerprint
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'initial content\n');
    assert.equal(git.patchFingerprint(), cleanFp1);

    // Untracked file changes fingerprint (untracked-awareness)
    fs.writeFileSync(path.join(tmpDir, 'untracked.txt'), 'new file content\n');
    const untrackedFp = git.patchFingerprint();
    assert.notEqual(untrackedFp, cleanFp1);

    // Removing untracked file restores clean fingerprint
    fs.unlinkSync(path.join(tmpDir, 'untracked.txt'));
    assert.equal(git.patchFingerprint(), cleanFp1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
