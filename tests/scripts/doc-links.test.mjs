/**
 * @fileoverview Automated tests for documentation relative link validation script.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkDocLinks,
  discoverMarkdownFiles,
  extractBrokenLinks,
  stripCodeBlocks
} from '../../scripts/check-doc-links.mjs';

test('stripCodeBlocks removes fenced code blocks while preserving line breaks', () => {
  const input = '# Title\n\n```ts\nconst x = [link](missing.md);\n```\n\n[Real link](real.md)\n';
  const stripped = stripCodeBlocks(input);

  assert.ok(!stripped.includes('missing.md'));
  assert.ok(stripped.includes('real.md'));
  assert.equal(input.split('\n').length, stripped.split('\n').length);
});

test('discoverMarkdownFiles recursively discovers only .md files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-discover-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'nested'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'node_modules'), { recursive: true });

    fs.writeFileSync(path.join(tmpDir, 'root.md'), '# Root');
    fs.writeFileSync(path.join(tmpDir, 'nested', 'child.md'), '# Child');
    fs.writeFileSync(path.join(tmpDir, 'nested', 'ignore.txt'), 'text');
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'ignored.md'), 'ignore');

    const discovered = discoverMarkdownFiles(tmpDir);
    const basenames = discovered.map((p) => path.basename(p)).sort();

    assert.deepEqual(basenames, ['child.md', 'root.md']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('extractBrokenLinks correctly identifies broken and valid relative links', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-links-'));
  try {
    const targetFile = path.join(tmpDir, 'target.md');
    fs.writeFileSync(targetFile, '# Target');

    const docFile = path.join(tmpDir, 'doc.md');
    const content = `
# Sample Doc

Valid relative link: [Target](./target.md)
Valid with anchor: [Target with anchor](./target.md#section)
External link ignored: [Google](https://google.com)
Mailto ignored: [Email](mailto:user@example.com)
Pure anchor ignored: [Jump to header](#sample-doc)
Placeholder ignored: [Placeholder](path)

Broken relative link: [Missing](./does-not-exist.md)
Broken image target: ![Missing Image](./missing-image.png)

\`\`\`markdown
[Code fence missing](./ignore-me.md)
\`\`\`
`;
    fs.writeFileSync(docFile, content);

    const broken = extractBrokenLinks(docFile, content);

    assert.equal(broken.length, 2);
    assert.equal(broken[0].target, './does-not-exist.md');
    assert.equal(broken[1].target, './missing-image.png');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('checkDocLinks returns ok: true when all relative links resolve', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-all-valid-'));
  try {
    const fileA = path.join(tmpDir, 'a.md');
    const fileB = path.join(tmpDir, 'b.md');

    fs.writeFileSync(fileA, 'Link to B: [B](b.md)');
    fs.writeFileSync(fileB, 'Link to A: [A](a.md)');

    const res = checkDocLinks({ targets: [tmpDir], silent: true });
    assert.equal(res.ok, true);
    assert.equal(res.broken.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
