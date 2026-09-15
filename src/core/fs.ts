import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}
export function readText(file: string) {
  return fs.readFileSync(file, 'utf8');
}
export function writeText(file: string, text: string) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text);
}
export function appendText(file: string, text: string) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, text);
}
export function readJson<T = any>(file: string): T {
  return JSON.parse(readText(file));
}
export function writeJson(file: string, value: any) {
  writeText(file, JSON.stringify(value, null, 2) + '\n');
}
export function sha256Text(value: crypto.BinaryLike) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
export function sha256File(file: string) {
  return sha256Text(fs.readFileSync(file));
}
export function exists(file: string) {
  return fs.existsSync(file);
}
export function copyDir(src: string, dest: string) {
  ensureDir(dest);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name),
      d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
export function makeReadOnlyTree(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      makeReadOnlyTree(p);
      try {
        fs.chmodSync(p, 0o555);
      } catch {}
    } else
      try {
        fs.chmodSync(p, 0o444);
      } catch {}
  }
  try {
    fs.chmodSync(dir, 0o555);
  } catch {}
}
export function makeWritableTree(dir: string) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.chmodSync(dir, 0o755);
  } catch {}
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) makeWritableTree(p);
    else
      try {
        fs.chmodSync(p, 0o644);
      } catch {}
  }
}
export function removeTree(dir: string) {
  if (!fs.existsSync(dir)) return;
  makeWritableTree(dir);
  fs.rmSync(dir, { recursive: true, force: true });
}
export function rotateFile(file: string, maxBytes: number) {
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
export function appendBounded(file: string, line: string, maxBytes: number) {
  rotateFile(file, maxBytes);
  appendText(file, line + '\n');
}
export function atomicCreate(file: string, content: string) {
  ensureDir(path.dirname(file));
  const fd = fs.openSync(file, 'wx');
  fs.writeFileSync(fd, content);
  fs.closeSync(fd);
}
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
