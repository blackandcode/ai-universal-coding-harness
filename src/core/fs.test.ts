/**
 * @fileoverview Unit tests for filesystem utilities in src/core/fs.ts.
 *
 * Validates directory creation, validated JSON reads/writes, recursive copy/remove,
 * permission manipulation (read-only and writable tree traversal), SHA-256 hashing,
 * bounded file append with rotation, atomic file creation, and recursive listing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ensureDir,
  readText,
  writeText,
  appendText,
  readJson,
  readJsonValidated,
  writeJson,
  sha256Text,
  sha256File,
  exists,
  copyDir,
  makeReadOnlyTree,
  makeWritableTree,
  removeTree,
  rotateFile,
  appendBounded,
  atomicCreate,
  listFilesRecursive,
} from './fs.js';

test('fs utilities: text reads, writes, appends, and existence checks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-text-'));
  try {
    const filePath = path.join(tmpDir, 'nested', 'test.txt');
    assert.equal(exists(filePath), false);

    writeText(filePath, 'hello');
    assert.equal(exists(filePath), true);
    assert.equal(readText(filePath), 'hello');

    appendText(filePath, ' world');
    assert.equal(readText(filePath), 'hello world');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fs utilities: json operations and readJsonValidated', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-json-'));
  try {
    const jsonPath = path.join(tmpDir, 'data.json');
    const payload = { num: 42, str: 'value', arr: [1, 2, 3] };

    writeJson(jsonPath, payload);
    const read = readJson<{ num: number; str: string }>(jsonPath);
    assert.deepEqual(read, payload);

    interface ValidatedType {
      num: number;
    }
    const validated = readJsonValidated<ValidatedType>(jsonPath, (raw) => {
      if (typeof raw !== 'object' || raw === null || !('num' in raw)) {
        throw new Error('Invalid payload');
      }
      return raw as ValidatedType;
    });
    assert.equal(validated.num, 42);

    assert.throws(
      () =>
        readJsonValidated(jsonPath, () => {
          throw new Error('Validation failed');
        }),
      /Validation failed/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fs utilities: sha256 hashing for text and files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-sha-'));
  try {
    const sample = 'deterministic test string';
    const hash = sha256Text(sample);
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);

    const filePath = path.join(tmpDir, 'hash.txt');
    writeText(filePath, sample);
    const fileHash = sha256File(filePath);
    assert.equal(fileHash, hash);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fs utilities: directory copy, recursive listing, and tree removal', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-dir-'));
  try {
    const srcDir = path.join(tmpDir, 'source');
    const destDir = path.join(tmpDir, 'dest');

    ensureDir(path.join(srcDir, 'sub1'));
    writeText(path.join(srcDir, 'file1.txt'), 'content1');
    writeText(path.join(srcDir, 'sub1', 'file2.txt'), 'content2');

    copyDir(srcDir, destDir);
    assert.equal(readText(path.join(destDir, 'file1.txt')), 'content1');
    assert.equal(readText(path.join(destDir, 'sub1', 'file2.txt')), 'content2');

    const files = listFilesRecursive(destDir).map((p) =>
      path.relative(destDir, p).replace(/\\/g, '/'),
    );
    files.sort();
    assert.deepEqual(files, ['file1.txt', 'sub1/file2.txt']);

    removeTree(destDir);
    assert.equal(exists(destDir), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fs utilities: makeReadOnlyTree and makeWritableTree', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-perms-'));
  try {
    const sub = path.join(tmpDir, 'tree');
    ensureDir(sub);
    const file = path.join(sub, 'readonly.txt');
    writeText(file, 'protected content');

    makeReadOnlyTree(sub);
    assert.equal(readText(file), 'protected content');

    // Make writable again and remove
    makeWritableTree(sub);
    writeText(file, 'updated content');
    assert.equal(readText(file), 'updated content');
    removeTree(sub);
    assert.equal(exists(sub), false);

    // Should not throw on non-existent directories
    makeReadOnlyTree('/nonexistent/tree/path');
    makeWritableTree('/nonexistent/tree/path');
    removeTree('/nonexistent/tree/path');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fs utilities: atomicCreate and rotation/appendBounded', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-bounded-'));
  try {
    const atomicPath = path.join(tmpDir, 'atomic.txt');
    atomicCreate(atomicPath, 'initial');
    assert.equal(readText(atomicPath), 'initial');
    assert.throws(() => atomicCreate(atomicPath, 'collision'));

    const boundedPath = path.join(tmpDir, 'bounded.log');
    for (let i = 0; i < 50; i++) {
      appendBounded(boundedPath, `line number ${i} with padding text`, 500);
    }
    const stat = fs.statSync(boundedPath);
    // File size should remain bounded by rotation
    assert.ok(stat.size <= 1500, `Expected bounded file size <= 1500, got ${stat.size}`);

    // Direct rotateFile call truncates in-place when size exceeds maxBytes
    rotateFile(boundedPath, 100);
    const postRotateStat = fs.statSync(boundedPath);
    assert.ok(postRotateStat.size <= stat.size);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
