/**
 * @fileoverview Unit tests for GitRepository wrapper in src/git/GitRepository.ts.
 * Validates diff checks, patch fingerprint calculation, review diff generation, and branch existence queries.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { GitRepository } from './GitRepository.js';

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

test('GitRepository.reviewDiff handles untracked directories with -uall and non-binary diff', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-repo-diff-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'tracked.txt'), 'line 1\n');
    execSync('git add tracked.txt && git commit -m "initial"', { cwd: tmpDir });

    // Tracked modification
    fs.appendFileSync(path.join(tmpDir, 'tracked.txt'), 'line 2\n');

    // Untracked directory with nested files
    const nestedDir = path.join(tmpDir, 'nested', 'sub');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, 'untracked.txt'), 'nested content\n');

    // Untracked binary file
    const binaryFile = path.join(nestedDir, 'image.png');
    fs.writeFileSync(
      binaryFile,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]),
    );

    const git = new GitRepository(tmpDir);
    const diff = git.reviewDiff();

    // Verify diff includes tracked file
    assert.match(diff, /diff --git a\/tracked\.txt b\/tracked\.txt/);
    assert.match(diff, /\+line 2/);

    // Verify diff includes untracked nested text file
    assert.match(diff, /nested\/sub\/untracked\.txt/);
    assert.match(diff, /\+nested content/);

    // Verify binary file is summarized cleanly without base85 blob
    assert.match(diff, /Binary files .* differ/);
    assert.doesNotMatch(diff, /literal \d+/); // Git binary diff format uses "literal <size>"

    // Verify changedFiles lists both files
    const changed = git.changedFiles();
    assert.ok(changed.includes('tracked.txt'));
    assert.ok(changed.includes('nested/sub/untracked.txt'));
    assert.ok(changed.includes('nested/sub/image.png'));
    // Ensure directory itself is not in changed files
    assert.ok(!changed.includes('nested/'));
    assert.ok(!changed.includes('nested/sub/'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GitRepository: run failure, branchExists, and diff filtering', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-repo-extra-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'f1.txt'), 'f1 content\n');
    fs.writeFileSync(path.join(tmpDir, 'f2.txt'), 'f2 content\n');
    execSync('git add . && git commit -m "initial"', { cwd: tmpDir });

    const git = new GitRepository(tmpDir);

    // run throws GitLifecycleError on failed command without allowFail
    assert.throws(() => git.run(['checkout', 'nonexistent-branch-xyz']), /failed/);

    // branchExists
    assert.equal(git.branchExists('main'), true);
    assert.equal(git.branchExists('nonexistent-branch'), false);

    // diff with path filter
    fs.writeFileSync(path.join(tmpDir, 'f1.txt'), 'f1 modified\n');
    fs.writeFileSync(path.join(tmpDir, 'f2.txt'), 'f2 modified\n');
    const filteredDiff = git.diff(['f1.txt']);
    assert.match(filteredDiff, /f1\.txt/);
    assert.doesNotMatch(filteredDiff, /f2\.txt/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
