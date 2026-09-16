/**
 * @fileoverview Filesystem utility functions for AI Universal Coding Harness.
 * Provides safe directory creation, text and JSON reads/writes, atomic file operations, validated JSON reading, and SHA256 hashing.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Creates a directory and any missing parent directories. */
export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Reads a UTF-8 text file synchronously. */
export function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

/** Writes UTF-8 text, creating parent directories when needed. */
export function writeText(file: string, text: string): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text);
}

/** Appends UTF-8 text, creating parent directories when needed. */
export function appendText(file: string, text: string): void {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, text);
}

/** Parses JSON from a file without runtime schema validation. */
export function readJson<T = unknown>(file: string): T {
  return JSON.parse(readText(file)) as T;
}

/** Parses JSON from a file and validates the payload with a caller-supplied validator. */
export function readJsonValidated<T>(file: string, validator: (data: unknown) => T): T {
  const raw: unknown = readJson(file);
  return validator(raw);
}

/** Serializes a value as pretty-printed JSON with a trailing newline. */
export function writeJson(file: string, value: unknown): void {
  writeText(file, JSON.stringify(value, null, 2) + '\n');
}

/** Returns the SHA-256 hex digest of a string or buffer. */
export function sha256Text(value: crypto.BinaryLike): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Returns the SHA-256 hex digest of a file's contents. */
export function sha256File(file: string): string {
  return sha256Text(fs.readFileSync(file));
}

/** Returns whether a path exists on the filesystem. */
export function exists(file: string): boolean {
  return fs.existsSync(file);
}

/** Recursively copies a directory tree. */
export function copyDir(src: string, dest: string): void {
  ensureDir(dest);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * Marks a directory tree read-only (directories `0555`, files `0444`).
 * Best-effort: chmod failures are ignored on unsupported platforms.
 */
export function makeReadOnlyTree(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      makeReadOnlyTree(p);
      try {
        fs.chmodSync(p, 0o555);
      } catch {}
    } else {
      try {
        fs.chmodSync(p, 0o444);
      } catch {}
    }
  }
  try {
    fs.chmodSync(dir, 0o555);
  } catch {}
}

/** Restores typical writable permissions on a directory tree before deletion or edits. */
export function makeWritableTree(dir: string): void {
  if (!fs.existsSync(dir)) return;
  try {
    fs.chmodSync(dir, 0o755);
  } catch {}
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      makeWritableTree(p);
    } else {
      try {
        fs.chmodSync(p, 0o644);
      } catch {}
    }
  }
}

/** Removes a directory tree after making it writable; no-op when the path is missing. */
export function removeTree(dir: string): void {
  if (!fs.existsSync(dir)) return;
  makeWritableTree(dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Truncates a file from the front when it exceeds `maxBytes`, keeping roughly 60% of the limit.
 * Aligns retention to the next newline so partial lines are not kept.
 */
export function rotateFile(file: string, maxBytes: number): void {
  try {
    const st = fs.statSync(file);
    if (st.size <= maxBytes) return;
    const keep = Math.max(1024, Math.floor(maxBytes * 0.6));
    const fd = fs.openSync(file, 'r');
    const start = Math.max(0, st.size - keep);
    const buf = Buffer.alloc(st.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    let text = buf.toString('utf8');
    const nl = text.indexOf('\n');
    if (start > 0 && nl >= 0) text = text.slice(nl + 1);
    fs.writeFileSync(file, text);
  } catch {}
}

/** Rotates the file when over the byte cap, then appends a single line with a trailing newline. */
export function appendBounded(file: string, line: string, maxBytes: number): void {
  rotateFile(file, maxBytes);
  appendText(file, line + '\n');
}

/**
 * Creates a file exclusively (`wx`); fails if the path already exists.
 * Used for run locks and other single-writer artifacts.
 */
export function atomicCreate(file: string, content: string): void {
  ensureDir(path.dirname(file));
  const fd = fs.openSync(file, 'wx');
  try {
    fs.writeFileSync(fd, content);
  } finally {
    fs.closeSync(fd);
  }
}

/** Lists all file paths under `root` recursively (directories are not included). */
export function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(root)) return out;
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(root);
  return out;
}
