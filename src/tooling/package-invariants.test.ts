import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function checkNodeVersionRequirement(version: string, requirement: string): boolean {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  const reqMatch = requirement.match(/^>=(\d+)\.(\d+)\.(\d+)/);
  if (!match || !reqMatch) return false;
  const [, maj, min, patch] = match.map(Number);
  const [, reqMaj, reqMin, reqPatch] = reqMatch.map(Number);
  if (maj > reqMaj) return true;
  if (maj < reqMaj) return false;
  if (min > reqMin) return true;
  if (min < reqMin) return false;
  return patch >= reqPatch;
}

test('package.json enforces exact frozen dependencies and engines', () => {
  const pkgPath = path.resolve('package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json must exist');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.equal(pkg.engines?.node, '>=24.18.0');
  assert.equal(pkg.dependencies?.['react'], '19.2.8');
  assert.equal(pkg.dependencies?.['ink'], '7.1.1');
  assert.equal(pkg.devDependencies?.['typescript'], '7.0.2');
  assert.equal(pkg.devDependencies?.['@types/node'], '24.13.4');
  assert.equal(pkg.devDependencies?.['@types/react'], '19.2.18');
  assert.equal(pkg.devDependencies?.['oxfmt'], '0.68.0');
  assert.equal(pkg.devDependencies?.['oxlint'], '1.83.0');
});

test('.nvmrc specifies 24.18.0', () => {
  const nvmrcPath = path.resolve('.nvmrc');
  assert.ok(fs.existsSync(nvmrcPath), '.nvmrc must exist');
  const content = fs.readFileSync(nvmrcPath, 'utf8').trim();
  assert.equal(content, '24.18.0');
});

test('tsconfig.json compiler options are correctly configured for ES2024 and NodeNext', () => {
  const tsconfigPath = path.resolve('tsconfig.json');
  assert.ok(fs.existsSync(tsconfigPath), 'tsconfig.json must exist');
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  const opts = tsconfig.compilerOptions;

  assert.equal(opts.target, 'ES2024');
  assert.equal(opts.module, 'NodeNext');
  assert.equal(opts.moduleResolution, 'NodeNext');
  assert.deepEqual(opts.types, ['node']);
  assert.equal(opts.verbatimModuleSyntax, true);
  assert.equal(opts.isolatedModules, true);
  assert.equal(opts.noUncheckedSideEffectImports, true);
  assert.equal(opts.jsx, 'react-jsx');
  assert.equal(opts.resolveJsonModule, true);
  assert.equal(opts.strict, false);
  assert.equal(opts.noImplicitAny, false);
});

test('toolchain configuration files exist and parse as valid JSON', () => {
  const oxfmtPath = path.resolve('.oxfmtrc.json');
  const oxlintPath = path.resolve('.oxlintrc.json');
  assert.ok(fs.existsSync(oxfmtPath), '.oxfmtrc.json must exist');
  assert.ok(fs.existsSync(oxlintPath), '.oxlintrc.json must exist');

  const oxfmt = JSON.parse(fs.readFileSync(oxfmtPath, 'utf8'));
  assert.equal(oxfmt.tabWidth, 2);
  assert.equal(oxfmt.singleQuote, true);
  assert.equal(oxfmt.semi, true);
  assert.equal(oxfmt.$schema, './node_modules/oxfmt/configuration_schema.json');

  const oxlint = JSON.parse(fs.readFileSync(oxlintPath, 'utf8'));
  assert.equal(oxlint.$schema, './node_modules/oxlint/configuration_schema.json');
  assert.notEqual(oxfmt.$schema, oxlint.$schema, 'oxfmt and oxlint must use distinct schemas');
  assert.ok(Array.isArray(oxlint.plugins), 'oxlint plugins must be an array');
  assert.ok(oxlint.plugins.includes('promise'), 'oxlint must include promise plugin');
  assert.ok(oxlint.plugins.includes('node'), 'oxlint must include node plugin');
  assert.ok(oxlint.plugins.includes('react'), 'oxlint must include react plugin');
  assert.ok(oxlint.plugins.includes('typescript'), 'oxlint must include typescript plugin');
  assert.equal(oxlint.rules?.['promise/no-new-statics'], 'error');
  assert.equal(oxlint.rules?.['node/no-exports-assign'], 'error');
});

test('Node version requirement validator logic', () => {
  assert.equal(checkNodeVersionRequirement('v24.18.0', '>=24.18.0'), true);
  assert.equal(checkNodeVersionRequirement('24.18.0', '>=24.18.0'), true);
  assert.equal(checkNodeVersionRequirement('v24.19.1', '>=24.18.0'), true);
  assert.equal(checkNodeVersionRequirement('v25.0.0', '>=24.18.0'), true);
  assert.equal(checkNodeVersionRequirement('v24.17.9', '>=24.18.0'), false);
  assert.equal(checkNodeVersionRequirement('v22.12.0', '>=24.18.0'), false);
  assert.equal(checkNodeVersionRequirement('invalid', '>=24.18.0'), false);
});
