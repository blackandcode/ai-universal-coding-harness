import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { spawnNpm } from './lib/npm-invoke.mjs';

const requiredDiskFiles = [
  'dist/bin.js',
  'dist/index.js',
  'dist/index.d.ts',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'permissions.default.jsonc',
  'config.example.jsonc',
  'docs/publishing.md',
  '.github/workflows/publish-npm.yml',
];

for (const file of requiredDiskFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Missing package artifact: ${file}`);
    process.exit(2);
  }
}

const binContent = fs.readFileSync('dist/bin.js', 'utf8');
if (!binContent.startsWith('#!/usr/bin/env node')) {
  console.error('dist/bin.js is missing Node shebang.');
  process.exit(2);
}

if (process.platform !== 'win32') {
  const mode = fs.statSync('dist/bin.js').mode;
  if ((mode & 0o111) === 0) {
    console.error('dist/bin.js is not executable.');
    process.exit(2);
  }
}

for (const file of fs.readdirSync('.')) {
  if (file.endsWith('.sh')) {
    console.error(`Shell runtime script should not be present in package root: ${file}`);
    process.exit(2);
  }
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (pkg.name !== 'ai-universal-coding-harness') {
  console.error('Unexpected npm package name.');
  process.exit(2);
}

if (pkg.repository?.url !== 'git+https://github.com/blackandcode/ai-universal-coding-harness.git') {
  console.error(
    'package.json repository URL must exactly match the GitHub repository for npm trusted publishing.',
  );
  process.exit(2);
}

if (!pkg.bin?.['ai-harness'] || !pkg.bin?.['ai-universal-coding-harness']) {
  console.error('Required CLI bin aliases are missing.');
  process.exit(2);
}

if (pkg.engines?.node !== '>=24.18.0') {
  console.error('package.json engines.node must be >=24.18.0');
  process.exit(2);
}

if (!fs.existsSync('.nvmrc')) {
  console.error('.nvmrc is missing.');
  process.exit(2);
}
const nvmrc = fs.readFileSync('.nvmrc', 'utf8').trim();
if (nvmrc !== '24.18.0') {
  console.error(`.nvmrc must specify 24.18.0, found: ${nvmrc}`);
  process.exit(2);
}

// Frozen dependency assertions
const frozenDeps = {
  typescript: '7.0.2',
  react: '19.2.8',
  ink: '7.1.1',
  '@types/node': '24.13.4',
  '@types/react': '19.2.18',
  oxfmt: '0.68.0',
  oxlint: '1.83.0',
};

for (const [dep, expectedVersion] of Object.entries(frozenDeps)) {
  const actualVersion = pkg.dependencies?.[dep] || pkg.devDependencies?.[dep];
  if (actualVersion !== expectedVersion) {
    console.error(
      `Frozen dependency requirement mismatch for ${dep}: expected ${expectedVersion}, got ${actualVersion}`,
    );
    process.exit(2);
  }
}

// Bidirectional lockfile consistency check
if (!fs.existsSync('package-lock.json')) {
  console.error('package-lock.json is missing.');
  process.exit(2);
}

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
if (pkg.name !== lock.name) {
  console.error(`Lockfile name (${lock.name}) does not match package.json (${pkg.name}).`);
  process.exit(2);
}
if (pkg.version !== lock.version) {
  console.error(`Lockfile version (${lock.version}) does not match package.json (${pkg.version}).`);
  process.exit(2);
}

const rootLock = lock.packages?.[''];
if (!rootLock) {
  console.error('package-lock.json is missing root package entry.');
  process.exit(2);
}

function validateDependencySection(sectionName, pkgMap = {}, lockMap = {}) {
  const pKeys = Object.keys(pkgMap).sort();
  const lKeys = Object.keys(lockMap).sort();

  for (const dep of pKeys) {
    if (!lKeys.includes(dep)) {
      console.error(`Missing in lockfile root ${sectionName}: ${dep}`);
      process.exit(2);
    }
    if (pkgMap[dep] !== lockMap[dep]) {
      console.error(
        `Lockfile ${sectionName} mismatch for ${dep}: expected ${pkgMap[dep]}, got ${lockMap[dep]}`,
      );
      process.exit(2);
    }
    const resolved = lock.packages?.[`node_modules/${dep}`];
    if (!resolved) {
      console.error(`Missing resolved package entry in lockfile: node_modules/${dep}`);
      process.exit(2);
    }
    if (resolved.version !== pkgMap[dep]) {
      console.error(
        `Resolved version mismatch for ${dep}: expected ${pkgMap[dep]}, got ${resolved.version}`,
      );
      process.exit(2);
    }
  }

  for (const dep of lKeys) {
    if (!pKeys.includes(dep)) {
      console.error(`Extra stale entry in lockfile root ${sectionName}: ${dep}`);
      process.exit(2);
    }
  }
}

validateDependencySection('dependencies', pkg.dependencies, rootLock.dependencies);
validateDependencySection('devDependencies', pkg.devDependencies, rootLock.devDependencies);

// Trusted publishing workflow verification
const publishWorkflow = fs.readFileSync('.github/workflows/publish-npm.yml', 'utf8');
if (!/id-token:\s*write/.test(publishWorkflow)) {
  console.error('npm publish workflow must request id-token: write for OIDC.');
  process.exit(2);
}
if (/NPM_TOKEN|NODE_AUTH_TOKEN/.test(publishWorkflow)) {
  console.error('npm publish workflow must not contain long-lived npm publish token variables.');
  process.exit(2);
}
if (!/run:\s*npm publish/.test(publishWorkflow)) {
  console.error('npm publish workflow is missing npm publish.');
  process.exit(2);
}
if (!/already_published/.test(publishWorkflow)) {
  console.error('npm publish workflow must safely skip an already-published bootstrap version.');
  process.exit(2);
}

const versionSrc = fs.readFileSync('src/version.ts', 'utf8');
if (!versionSrc.includes(`VERSION = '${pkg.version}'`)) {
  console.error('package.json and src/version.ts versions differ.');
  process.exit(2);
}

// Package dry-run inventory verification (using --ignore-scripts to prevent recursion)
const packResult = spawnNpm(['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8',
});

if (packResult.error || packResult.status !== 0) {
  console.error('npm pack --dry-run failed:');
  if (packResult.error) {
    console.error('Subprocess error:', packResult.error);
  }
  if (packResult.stderr || packResult.stdout) {
    console.error(packResult.stderr || packResult.stdout);
  }
  process.exit(2);
}

let tarballFiles = [];
try {
  const packJson = JSON.parse(packResult.stdout);
  tarballFiles = packJson[0]?.files?.map((f) => f.path) || [];
} catch (err) {
  console.error('Failed to parse npm pack --dry-run JSON output:', err);
  process.exit(2);
}

// Assert no test files in tarball
const testFilesInTarball = tarballFiles.filter((f) => f.includes('.test.'));
if (testFilesInTarball.length > 0) {
  console.error(`Package tarball contains emitted test files: ${testFilesInTarball.join(', ')}`);
  process.exit(2);
}

// Assert no dev-only rewrite artifacts in tarball
const prohibitedPatterns = [
  'ai-universal-coding-harness-rewrite-plan',
  '.ai-orchestrator',
  '.agents',
  '.cursor',
  '.oxfmtrc.json',
  '.oxlintrc.json',
];

for (const pattern of prohibitedPatterns) {
  const found = tarballFiles.filter((f) => f.includes(pattern));
  if (found.length > 0) {
    console.error(`Package tarball contains prohibited development artifact: ${found.join(', ')}`);
    process.exit(2);
  }
}

// Assert required production files are present in actual npm inventory
const requiredTarballArtifacts = [
  'dist/bin.js',
  'dist/index.js',
  'dist/index.d.ts',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'permissions.default.jsonc',
  'config.example.jsonc',
  'schemas/final-verdict.schema.json',
  'docs/publishing.md',
  'docs/Functional-specification.md',
  'docs/configuration.md',
  'docs/development.md',
  'docs/harnesses.md',
  'docs/testing.md',
];

for (const artifact of requiredTarballArtifacts) {
  if (!tarballFiles.includes(artifact)) {
    console.error(`Missing required artifact in npm package tarball inventory: ${artifact}`);
    process.exit(2);
  }
}

// Consumer declaration check via TS7 against actual packaged package metadata
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-consumer-'));
try {
  const cleanEnv = { ...process.env };
  delete cleanEnv.npm_config_dry_run;

  const packDestRes = spawnNpm(
    ['pack', '--pack-destination', fixtureDir, '--ignore-scripts', '--dry-run=false'],
    {
      encoding: 'utf8',
      env: cleanEnv,
    },
  );
  if (packDestRes.error || packDestRes.status !== 0) {
    console.error('Failed to pack tarball for consumer verification:');
    if (packDestRes.error) console.error('Subprocess error:', packDestRes.error);
    if (packDestRes.stderr || packDestRes.stdout)
      console.error(packDestRes.stderr || packDestRes.stdout);
    process.exit(2);
  }

  const tgzName = packDestRes.stdout.trim().split('\n').pop().trim();

  fs.writeFileSync(
    path.join(fixtureDir, 'package.json'),
    JSON.stringify({
      name: 'consumer-check',
      type: 'module',
      dependencies: {
        'ai-universal-coding-harness': `file:${tgzName}`,
      },
    }),
  );

  const installRes = spawnNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: fixtureDir,
    encoding: 'utf8',
    env: cleanEnv,
  });
  if (installRes.error || installRes.status !== 0) {
    console.error('Failed to install package in consumer test fixture:');
    if (installRes.error) console.error('Subprocess error:', installRes.error);
    if (installRes.stderr || installRes.stdout)
      console.error(installRes.stderr || installRes.stdout);
    process.exit(2);
  }

  const consumerTs = path.join(fixtureDir, 'consumer.ts');
  fs.writeFileSync(
    consumerTs,
    `
import {
  HarnessRegistry,
  StageSource,
  PermissionEngine,
  ProjectWorkspace,
  VERSION,
  PACKAGE_NAME,
  PRODUCT_NAME,
} from 'ai-universal-coding-harness';

import type {
  ExecutorHarness,
  ReviewerHarness,
  HarnessInfo,
  RunState,
  StageRuntimeState,
  StageManifest,
  PermissionMode,
  StageValidationIssue,
} from 'ai-universal-coding-harness';

const registry = new HarnessRegistry();
const version: string = VERSION;
const pkgName: string = PACKAGE_NAME;
const prodName: string = PRODUCT_NAME;
`,
  );

  const tsconfig = path.join(fixtureDir, 'tsconfig.json');
  fs.writeFileSync(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2024',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        typeRoots: [path.resolve('node_modules/@types').replace(/\\/g, '/')],
        types: ['node'],
        noEmit: true,
      },
      include: ['consumer.ts'],
    }),
  );

  const tscBin = path.resolve('node_modules/typescript/bin/tsc');
  const checkResult = spawnSync(process.execPath, [tscBin, '-p', tsconfig], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (checkResult.error || checkResult.status !== 0) {
    console.error('Consumer declaration check failed:');
    if (checkResult.error) console.error('Subprocess error:', checkResult.error);
    if (checkResult.stdout) console.error(checkResult.stdout);
    if (checkResult.stderr) console.error(checkResult.stderr);
    process.exit(2);
  }
} finally {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
}

console.log('Package check OK.');
