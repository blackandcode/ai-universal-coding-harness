#!/usr/bin/env node
/**
 * @fileoverview CLI tool to increment and synchronize the package version
 * across package manifests, TypeScript constants, docs, and CHANGELOG.md.
 */

import process from 'node:process';
import { parseArgs } from 'node:util';
import { synchronizeVersion } from './version-sync.mjs';

const HELP = `
Usage:
  npm run update-version -- [version | patch | minor | major] [options]
  npm run update-version -- --bump <patch|minor|major> [options]
  npm run update-version -- --target-version <X.Y.Z> [options]

Synchronizes the package version across project files, package manifests,
TypeScript constants, and creates a CHANGELOG.md release entry (promoting unreleased changes).

Arguments:
  [version|bump]                 Target version (e.g. 2.1.0) or bump type (patch, minor, major).

Options:
  -v, --target-version <X.Y.Z>   Explicit target semantic version.
  -b, --bump <type>              Bump type: patch, minor, or major.
  -m, --changelog <text>         Release notes summary (prepended to unreleased notes).
  -d, --decision <text>          Release headline summary (alias for --changelog).
  --date <YYYY-MM-DD>            Override release date. Default: today's date.
  --root <path>                  Project root. Defaults to current directory.
  --env <path>                   Environment file relative to root (optional fallback). Default: .env
  --dry-run                      Show planned changes without writing files.
  --allow-downgrade              Permit a lower target version for recovery only.
  --check-php                    Run optional PHP version_compare check. Default: false.
  -h, --help                     Show this help.
`;

const { values, positionals } = parseArgs({
  options: {
    root: { type: 'string', default: process.cwd() },
    env: { type: 'string', default: '.env' },
    date: { type: 'string' },
    'target-version': { type: 'string', short: 'v' },
    bump: { type: 'string', short: 'b' },
    changelog: { type: 'string', short: 'm' },
    decision: { type: 'string', short: 'd' },
    'dry-run': { type: 'boolean', default: false },
    'allow-downgrade': { type: 'boolean', default: false },
    'check-php': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
  strict: true,
});

if (values.help) {
  console.log(HELP.trim());
  process.exit(0);
}

try {
  let targetVersion = values['target-version'];
  let bump = values.bump;

  if (positionals.length > 0) {
    const pos = positionals[0].trim();
    if (['patch', 'minor', 'major'].includes(pos.toLowerCase())) {
      bump = bump || pos.toLowerCase();
    } else {
      targetVersion = targetVersion || pos;
    }
  }

  const summary = await synchronizeVersion({
    root: values.root,
    targetVersion,
    bump,
    changelog: values.changelog,
    decision: values.decision,
    envFile: values.env,
    date: values.date,
    dryRun: values['dry-run'],
    allowDowngrade: values['allow-downgrade'],
    checkPhp: values['check-php'],
  });

  if (summary.alreadyImplemented) {
    console.log(
      `Target version ${summary.targetVersion} is already implemented in ${summary.currentVersion}. No version changes needed.`,
    );
    process.exit(0);
  }

  console.log(
    `${summary.dryRun ? 'Planned' : 'Updated'} package version ${
      summary.currentVersion
    } -> ${summary.targetVersion}`,
  );
  console.log(`Release date: ${summary.date}`);
  console.log(`Scanned text files: ${summary.scannedFiles}`);
  if (values['check-php']) {
    const phpOrdering = summary.phpVersionOrdering.checked
      ? 'verified'
      : `not checked (${summary.phpVersionOrdering.reason})`;
    console.log(`PHP version ordering: ${phpOrdering}`);
  }

  if (summary.dryRun) {
    console.log('\n[Dry Run] Planned file modifications:');
    for (const change of summary.changes) {
      console.log(`  - ${change.path} (${change.kind})`);
    }
    console.log('\nDry run completed successfully. No files were written.');
  } else {
    console.log(`Successfully updated ${summary.modifiedFiles} files.`);
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
