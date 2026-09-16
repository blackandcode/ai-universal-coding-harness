#!/usr/bin/env node
/**
 * @fileoverview CLI and programmatic tool to scaffold Architecture Decision Records (ADRs)
 * in docs/adr/ following established templates and maintaining the ADR README index table.
 */

import process from 'node:process';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function getNygardTemplate(title, date) {
  return `# ${title}

- Status: Proposed
- Date: ${date}

## Context

What is the issue or architectural force that is motivating this decision?

## Decision

What is the architectural change or direction that we are committing to?

## Consequences

What becomes easier or more difficult because of this change?
What follow-up invariants or verification tests are required?
`;
}

export function getMadrTemplate(title, date) {
  return `# ${title}

- Status: Proposed
- Date: ${date}

## Context and Problem Statement

Describe the context and problem statement in a few sentences.

## Decision Drivers

- Driver 1
- Driver 2

## Considered Options

- Option 1
- Option 2

## Decision Outcome

Chosen option: "Option 1", because justification.

### Positive Consequences

- Positive impact on quality attributes or developer velocity.

### Negative Consequences

- Trade-offs or operational costs accepted.

## Pros and Cons of the Options

### Option 1

- Good, because reason.
- Bad, because reason.

### Option 2

- Good, because reason.
- Bad, because reason.
`;
}

export function getHarnessTemplate(title, date) {
  return `# ADR: ${title}

- Status: Proposed
- Date: ${date}

## Context

What concrete problem/force requires a decision? Which project invariant or module boundary is involved?

## Decision

State the decision and the authority/module that owns it.

## Alternatives considered

For each serious alternative: benefit, cost, and why it was not selected.

## Consequences

- positive;
- negative/trade-off;
- compatibility/migration;
- security/reliability impact;
- testing/observability impact.

## Verification

What tests/checks prove the decision remains true?

## Revisit triggers

What future condition would make this decision worth reopening?
`;
}

export function renderAdrTemplate(template, title, date) {
  const norm = (template || 'nygard').toLowerCase().trim();
  switch (norm) {
    case 'madr':
      return getMadrTemplate(title, date);
    case 'harness':
      return getHarnessTemplate(title, date);
    case 'nygard':
    case 'simple':
    default:
      return getNygardTemplate(title, date);
  }
}

export async function findNextAdrNumber(adrDir) {
  try {
    const entries = await readdir(adrDir);
    let maxNumber = 0;
    for (const entry of entries) {
      const match = entry.match(/^(\d{4})-.*\.md$/);
      if (match) {
        const num = Number.parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }
    return (maxNumber + 1).toString().padStart(4, '0');
  } catch {
    return '0001';
  }
}

export function updateAdrIndex(
  existingContent,
  { number, title, filename, date, status = 'Proposed' }
) {
  const header =
    '# Architecture Decision Records (ADR)\n\nThis directory contains durable Architecture Decision Records for AI Universal Coding Harness.\n\n| Number | Title | Status | Date |\n| --- | --- | --- | --- |';
  const newRow = `| [${number}](${filename}) | ${title} | ${status} | ${date} |`;

  if (!existingContent || !existingContent.trim()) {
    return `${header}\n${newRow}\n`;
  }

  const trimmed = existingContent.trimEnd();
  if (trimmed.includes(`[${number}](${filename})`)) {
    return `${trimmed}\n`;
  }

  return `${trimmed}\n${newRow}\n`;
}

export async function createNewAdr({
  root = process.cwd(),
  title,
  template = 'nygard',
  date = todayIso(),
  dryRun = false
}) {
  if (!title || !title.trim()) {
    throw new Error('ADR title is required.');
  }

  const cleanTitle = title.trim();
  const slug = slugify(cleanTitle) || 'architecture-decision';
  const adrDir = join(root, 'docs', 'adr');

  let nextNum = '0001';
  try {
    await access(adrDir);
    nextNum = await findNextAdrNumber(adrDir);
  } catch {
    nextNum = '0001';
  }

  const filename = `${nextNum}-${slug}.md`;
  const filePath = join(adrDir, filename);
  const content = renderAdrTemplate(template, cleanTitle, date);

  const indexPath = join(adrDir, 'README.md');
  let indexContent = '';
  try {
    indexContent = await readFile(indexPath, 'utf8');
  } catch {
    indexContent = '';
  }

  const updatedIndex = updateAdrIndex(indexContent, {
    number: nextNum,
    title: cleanTitle,
    filename,
    date,
    status: 'Proposed'
  });

  if (!dryRun) {
    await mkdir(adrDir, { recursive: true });
    await writeFile(filePath, content, 'utf8');
    await writeFile(indexPath, updatedIndex, 'utf8');
  }

  return {
    number: nextNum,
    title: cleanTitle,
    slug,
    filename,
    filePath,
    template,
    date,
    dryRun
  };
}

const HELP = `
Usage:
  npm run adr:new -- -t "<Title>" [options]
  node scripts/adr/new-adr.mjs --title "<Title>" [options]

Scaffolds a new Architecture Decision Record in docs/adr/ and updates docs/adr/README.md.

Options:
  -t, --title <text>         Title of the architectural decision (required).
  --template <name>          Template to use: nygard (default), madr, harness.
  --date <YYYY-MM-DD>        Decision date. Default: today's date.
  --root <path>              Project root. Defaults to current directory.
  --dry-run                  Preview output path and contents without creating files.
  -h, --help                 Show this help.
`;

if (process.argv[1] && process.argv[1].endsWith('new-adr.mjs')) {
  const { values, positionals } = parseArgs({
    options: {
      title: { type: 'string', short: 't' },
      template: { type: 'string', default: 'nygard' },
      date: { type: 'string' },
      root: { type: 'string', default: process.cwd() },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    },
    allowPositionals: true,
    strict: true
  });

  if (values.help) {
    console.log(HELP.trim());
    process.exit(0);
  }

  const title = values.title || positionals.join(' ').trim();
  if (!title) {
    console.error(
      'Error: ADR title is required. Example: npm run adr:new -- -t "Choose Stage Execution Model"'
    );
    process.exit(1);
  }

  try {
    const result = await createNewAdr({
      root: values.root,
      title,
      template: values.template,
      date: values.date,
      dryRun: values['dry-run']
    });

    if (result.dryRun) {
      console.log(`[Dry Run] Would create ADR ${result.number}: ${result.filePath}`);
    } else {
      console.log(`Successfully created ADR ${result.number}: docs/adr/${result.filename}`);
      console.log('Updated docs/adr/README.md index.');
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
