#!/usr/bin/env node
/**
 * @fileoverview Deterministic helper script to append unreleased change entries
 * under ## [Unreleased] in CHANGELOG.md following Keep a Changelog standards.
 */

import process from 'node:process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const CANONICAL_TYPES = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

export function normalizeChangeType(type) {
  if (!type) {
    return 'Changed';
  }
  const clean = type.trim();
  const matched = CANONICAL_TYPES.find((c) => c.toLowerCase() === clean.toLowerCase());
  return matched || clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function formatBullet(message) {
  const trimmed = message.trim();
  if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
    return `- ${trimmed.slice(2).trim()}`;
  }
  return `- ${trimmed}`;
}

export function recordUnreleasedChange(source, { type = 'Changed', message }) {
  if (!message || !message.trim()) {
    throw new Error('Message is required for changelog entry.');
  }

  const normalizedType = normalizeChangeType(type);
  const bullet = formatBullet(message);
  const unreleasedHeading = '## [Unreleased]';

  let working = source;
  if (!working.trim()) {
    working = [
      '# Changelog',
      '',
      'All notable changes to this project are documented in this file.',
      '',
      unreleasedHeading,
      ''
    ].join('\n');
  }

  let unreleasedIndex = working.indexOf(unreleasedHeading);
  if (unreleasedIndex === -1) {
    const firstReleaseMatch = working.match(/\n## \[[^\]]+\]/);
    if (firstReleaseMatch && firstReleaseMatch.index !== undefined) {
      const insertAt = firstReleaseMatch.index + 1;
      working = `${working.slice(0, insertAt)}${unreleasedHeading}\n\n${working.slice(insertAt)}`;
    } else {
      const trimmedWorking = working.trimEnd();
      working = `${trimmedWorking}\n\n${unreleasedHeading}\n\n`;
    }
    unreleasedIndex = working.indexOf(unreleasedHeading);
  }

  const bodyStart = unreleasedIndex + unreleasedHeading.length;
  const remainder = working.slice(bodyStart);
  const nextReleaseMatch = remainder.match(/\n## \[(?!Unreleased\])[^\n]+/);
  const bodyEnd = nextReleaseMatch ? bodyStart + nextReleaseMatch.index : working.length;
  const unreleasedSection = working.slice(bodyStart, bodyEnd);

  const sectionRegex = new RegExp(`(^|\\n)###\\s+${normalizedType}\\b([^\\n]*)`, 'i');
  const sectionMatch = unreleasedSection.match(sectionRegex);

  let newUnreleasedSection;

  if (sectionMatch && sectionMatch.index !== undefined) {
    const headerStart = sectionMatch.index + sectionMatch[1].length;
    const afterHeader = unreleasedSection.slice(headerStart);
    const nextSubheadingMatch = afterHeader.match(/\n###\s+/);
    const sectionContentEnd = nextSubheadingMatch
      ? headerStart + nextSubheadingMatch.index
      : unreleasedSection.length;

    const sectionContent = unreleasedSection.slice(headerStart, sectionContentEnd).trimEnd();
    newUnreleasedSection = [
      unreleasedSection.slice(0, headerStart),
      sectionContent,
      `\n${bullet}\n`,
      unreleasedSection.slice(sectionContentEnd).replace(/^\n*/, '\n')
    ].join('');
  } else {
    const newSectionBlock = `\n\n### ${normalizedType}\n\n${bullet}\n`;
    newUnreleasedSection = `${unreleasedSection.trimEnd()}${newSectionBlock}`;
  }

  return [
    working.slice(0, bodyStart),
    newUnreleasedSection.startsWith('\n\n')
      ? newUnreleasedSection
      : `\n\n${newUnreleasedSection.replace(/^\n*/, '')}`,
    working.slice(bodyEnd).startsWith('\n') ? working.slice(bodyEnd) : `\n${working.slice(bodyEnd)}`
  ].join('');
}

export async function addUnreleasedEntry({
  root = process.cwd(),
  changelogFile = 'CHANGELOG.md',
  type = 'Changed',
  message
}) {
  const changelogPath = join(root, changelogFile);
  let source = '';
  try {
    await access(changelogPath);
    source = await readFile(changelogPath, 'utf8');
  } catch {
    source = '';
  }

  const updated = recordUnreleasedChange(source, { type, message });
  await writeFile(changelogPath, updated, 'utf8');
  return {
    path: changelogPath,
    type: normalizeChangeType(type),
    message: message.trim()
  };
}

const HELP = `
Usage:
  npm run changelog:add -- [message] [options]
  node scripts/changelog/record-unreleased-change.mjs [message] [options]

Records a concise change bullet under ## [Unreleased] in CHANGELOG.md.

Arguments:
  [message]                The descriptive change summary bullet.

Options:
  -t, --type <type>        Category: Added, Changed, Deprecated, Removed, Fixed, Security. Default: Changed.
  -m, --message <text>     Alternative flag to provide change description.
  --root <path>            Project root. Defaults to current directory.
  --changelog <path>       Path to CHANGELOG.md relative to root. Default: CHANGELOG.md.
  -h, --help               Show this help.
`;

// Only run CLI parsing when invoked directly from command line
if (process.argv[1] && process.argv[1].endsWith('record-unreleased-change.mjs')) {
  const { values, positionals } = parseArgs({
    options: {
      type: { type: 'string', short: 't', default: 'Changed' },
      message: { type: 'string', short: 'm' },
      root: { type: 'string', default: process.cwd() },
      changelog: { type: 'string', default: 'CHANGELOG.md' },
      help: { type: 'boolean', short: 'h', default: false }
    },
    allowPositionals: true,
    strict: true
  });

  if (values.help) {
    console.log(HELP.trim());
    process.exit(0);
  }

  const message = values.message || positionals.join(' ').trim();
  if (!message) {
    console.error(
      'Error: Change message is required. Example: npm run changelog:add -- -t Added "New REST route"'
    );
    process.exit(1);
  }

  try {
    const result = await addUnreleasedEntry({
      root: values.root,
      changelogFile: values.changelog,
      type: values.type,
      message
    });
    console.log(`Successfully recorded unreleased [${result.type}] change in ${result.path}:`);
    console.log(`  - ${result.message}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
