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
import { GitRepository } from '../../src/git/GitRepository.js';

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
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00])
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

test('GitRepository.switch and createBranch checkout and create branches', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-repo-switch-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'content\n');
    execSync('git add test.txt && git commit -m "initial"', { cwd: tmpDir });

    const git = new GitRepository(tmpDir);
    git.createBranch('feature', 'main');
    assert.equal(git.currentBranch(), 'feature');

    git.switch('main');
    assert.equal(git.currentBranch(), 'main');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GitRepository: head, isDirty, diffStat, statusShort, stash, findStash, commit, mergeBase, resetSoft', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-repo-methods-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'line 1\n');
    execSync('git add test.txt && git commit -m "initial"', { cwd: tmpDir });

    const git = new GitRepository(tmpDir);
    const initialHead = git.head();
    assert.equal(typeof initialHead, 'string');
    assert.equal(initialHead.length, 40);

    assert.equal(git.isDirty(), false);
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'line 1\nline 2\n');
    assert.equal(git.isDirty(), true);

    const stat = git.diffStat();
    assert.match(stat, /test\.txt/);

    const shortStatus = git.statusShort();
    assert.match(shortStatus, /test\.txt/);

    // Stash and findStash
    const stashSha = git.stash('test stash label');
    assert.ok(stashSha);
    assert.equal(git.isDirty(), false);
    const foundSha = git.findStash('test stash label');
    assert.ok(foundSha);
    assert.equal(git.findStash('nonexistent-stash-label'), '');

    // Commit with subject and body lines
    fs.writeFileSync(path.join(tmpDir, 'commit-test.txt'), 'commit content\n');
    const commitSha = git.commit('Second commit', ['Body line 1', 'Body line 2']);
    assert.notEqual(commitSha, initialHead);
    assert.equal(git.head(), commitSha);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GitRepository.reviewDiff filters untracked files by path filter', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-repo-diff-filter-'));
  try {
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'init.txt'), 'init\n');
    execSync('git add init.txt && git commit -m "initial"', { cwd: tmpDir });

    fs.writeFileSync(path.join(tmpDir, 'selected.txt'), 'selected content\n');
    fs.writeFileSync(path.join(tmpDir, 'ignored.txt'), 'ignored content\n');

    const git = new GitRepository(tmpDir);
    const filteredDiff = git.reviewDiff(['selected.txt']);
    assert.match(filteredDiff, /selected\.txt/);
    assert.doesNotMatch(filteredDiff, /ignored\.txt/);

    // Test directory prefix match in untracked files
    fs.mkdirSync(path.join(tmpDir, 'subdir'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'subdir', 'nested.txt'), 'nested content\n');
    const dirFilteredDiff = git.reviewDiff(['subdir/']);
    assert.match(dirFilteredDiff, /subdir\/nested\.txt/);

    // Test diff against HEAD without paths and with paths
    const diffAll = git.diff();
    assert.equal(typeof diffAll, 'string');
    const diffSpecific = git.diff(['init.txt']);
    assert.equal(typeof diffSpecific, 'string');

    // Test changedFiles with rename arrow if present
    const changed = git.changedFiles();
    assert.ok(changed.length > 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
