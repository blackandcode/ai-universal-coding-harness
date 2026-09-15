#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const warnings = [];
const errors = [];
const info = [];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function stripJsonc(input) {
  let out = '';
  let i = 0;
  let quote = null;
  let escaped = false;
  while (i < input.length) {
    const c = input[i];
    const n = input[i + 1];
    if (quote) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && n === '/') {
      i += 2;
      while (i < input.length && input[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}

function readJsonc(file) {
  return JSON.parse(stripJsonc(fs.readFileSync(file, 'utf8')));
}

function findTsconfigs(dir, maxDepth = 3, depth = 0, result = []) {
  if (depth > maxDepth) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findTsconfigs(full, maxDepth, depth + 1, result);
    else if (/^tsconfig(?:\.[^/]+)?\.json$/i.test(entry.name)) result.push(full);
  }
  return result;
}

function installedVersion(pkgName) {
  const p = path.join(cwd, 'node_modules', ...pkgName.split('/'), 'package.json');
  try { return readJson(p).version ?? null; } catch { return null; }
}

function majorOf(version) {
  const m = String(version ?? '').match(/(?:^|[^0-9])(\d+)\./);
  return m ? Number(m[1]) : null;
}

function localTscShowConfig(configFile) {
  const cli = path.join(cwd, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!fs.existsSync(cli)) return null;
  const r = spawnSync(process.execPath, [cli, '-p', configFile, '--showConfig'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const pkgPath = path.join(cwd, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error(JSON.stringify({ ok: false, errors: ['package.json not found'] }, null, 2));
  process.exit(2);
}

const pkg = readJson(pkgPath);
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
const declaredTs = deps.typescript ?? null;
const actualTs = installedVersion('typescript');
const tsMajor = majorOf(actualTs) ?? majorOf(declaredTs);

if (!declaredTs) errors.push('TypeScript is not declared in package.json.');
if (tsMajor && tsMajor < 6) errors.push(`Installed/declared TypeScript appears to be ${actualTs ?? declaredTs}; this skill targets TS7 with TS6 only as a bridge.`);
if (tsMajor === 6) info.push('TypeScript 6 detected: treat this as a migration/tooling compatibility lane and validate with TS7 before declaring a TS7 migration complete.');
if (tsMajor === 7) info.push('TypeScript 7 detected: TS6-deprecated options are hard errors and legacy compiler-API consumers require explicit compatibility planning.');

const tsconfigs = findTsconfigs(cwd).sort();
if (!tsconfigs.length) errors.push('No tsconfig*.json found within project depth 3.');

const bundlerPkgs = ['vite', 'webpack', 'rollup', 'esbuild', 'parcel', '@rspack/core', 'next', '@tanstack/react-start', '@tanstack/start'];
const hasBundler = bundlerPkgs.some((x) => x in deps);
const hasReact = 'react' in deps;
const hasNodeTypes = '@types/node' in deps;

const configs = [];
for (const file of tsconfigs) {
  const rel = path.relative(cwd, file) || path.basename(file);
  let raw;
  try { raw = readJsonc(file); }
  catch (e) {
    errors.push(`${rel}: could not parse JSONC: ${e.message}`);
    continue;
  }

  let effective = null;
  const shown = localTscShowConfig(file);
  if (shown?.status === 0) {
    try { effective = JSON.parse(shown.stdout); } catch { /* ignore */ }
  } else if (shown) {
    errors.push(`${rel}: installed tsc rejects this project config: ${(shown.stderr || shown.stdout).trim().split('\n').slice(0, 8).join(' | ')}`);
  }

  const c = effective?.compilerOptions ?? raw.compilerOptions ?? {};
  const rawC = raw.compilerOptions ?? {};
  const lower = (v) => typeof v === 'string' ? v.toLowerCase() : v;

  const removed = [];
  if ('baseUrl' in rawC) removed.push('baseUrl');
  if ('downlevelIteration' in rawC) removed.push('downlevelIteration');
  if ('outFile' in rawC) removed.push('outFile');
  if ('ignoreDeprecations' in rawC && tsMajor === 7) removed.push('ignoreDeprecations');
  if (['node', 'node10', 'classic'].includes(lower(rawC.moduleResolution))) removed.push(`moduleResolution:${rawC.moduleResolution}`);
  if (['amd', 'umd', 'system', 'systemjs', 'none'].includes(lower(rawC.module))) removed.push(`module:${rawC.module}`);
  if (lower(rawC.target) === 'es5') removed.push('target:ES5');
  if (rawC.esModuleInterop === false) removed.push('esModuleInterop:false');
  if (rawC.allowSyntheticDefaultImports === false) removed.push('allowSyntheticDefaultImports:false');
  if (rawC.alwaysStrict === false) removed.push('alwaysStrict:false');
  if (removed.length) errors.push(`${rel}: TS7-incompatible/legacy options found: ${removed.join(', ')}.`);

  const moduleKind = lower(c.module);
  const resolution = lower(c.moduleResolution);
  const jsx = lower(c.jsx);
  const types = c.types;

  if (hasBundler && !['bundler', undefined].includes(resolution) && !/node(next|16)/.test(String(resolution))) {
    warnings.push(`${rel}: bundler detected; verify moduleResolution is intentionally Bundler (or framework-required equivalent).`);
  }
  if (!hasBundler && hasNodeTypes && moduleKind && !/node(next|16)/.test(String(moduleKind))) {
    warnings.push(`${rel}: Node types/runtime detected; verify module is NodeNext for direct Node execution rather than generic ${c.module}.`);
  }
  if (hasReact && /app|src|json$/i.test(rel) && jsx && !['react-jsx', 'react-jsxdev', 'preserve'].includes(jsx)) {
    errors.push(`${rel}: React 19 requires the modern JSX transform; jsx=${c.jsx} is suspicious.`);
  }
  if (Array.isArray(types) && types.includes('*')) warnings.push(`${rel}: types:["*"] restores old ambient enumeration; prefer explicit global type packages in TS7.`);
  if (hasNodeTypes && Array.isArray(types) && !types.includes('node') && /node(next|16)/.test(String(moduleKind))) {
    warnings.push(`${rel}: Node config appears not to include "node" in compilerOptions.types; TS7 defaults ambient types to [].`);
  }
  if (c.noEmit !== true && raw.include?.some?.((x) => String(x).includes('src')) && !('rootDir' in rawC) && !effective?.compilerOptions?.rootDir) {
    warnings.push(`${rel}: source appears under src but rootDir is not explicit; TS7 defaults rootDir to the config directory.`);
  }
  if (c.strict === false) warnings.push(`${rel}: strict is explicitly disabled; TS7 defaults strict to true.`);
  if (c.noUncheckedSideEffectImports === false) warnings.push(`${rel}: noUncheckedSideEffectImports is disabled; TS7 defaults it to true.`);
  if (c.verbatimModuleSyntax !== true) info.push(`${rel}: consider verbatimModuleSyntax:true so type/value import behavior matches the runtime module model.`);
  if (c.noUncheckedIndexedAccess !== true) info.push(`${rel}: consider noUncheckedIndexedAccess:true for new/strict code; plan migration before enabling on a mature codebase.`);
  if (c.exactOptionalPropertyTypes !== true) info.push(`${rel}: consider exactOptionalPropertyTypes:true for new code; React prop semantics may expose migrations.`);

  configs.push({
    file: rel,
    effective: {
      target: c.target ?? null,
      module: c.module ?? null,
      moduleResolution: c.moduleResolution ?? null,
      jsx: c.jsx ?? null,
      strict: c.strict ?? null,
      rootDir: c.rootDir ?? null,
      types: c.types ?? null,
      verbatimModuleSyntax: c.verbatimModuleSyntax ?? null,
      noUncheckedSideEffectImports: c.noUncheckedSideEffectImports ?? null,
      noUncheckedIndexedAccess: c.noUncheckedIndexedAccess ?? null,
      exactOptionalPropertyTypes: c.exactOptionalPropertyTypes ?? null,
      erasableSyntaxOnly: c.erasableSyntaxOnly ?? null,
      rewriteRelativeImportExtensions: c.rewriteRelativeImportExtensions ?? null,
    },
  });
}

const toolApiRisk = [];
for (const name of ['typescript-eslint', '@typescript-eslint/parser', '@typescript-eslint/typescript-estree', 'ts-morph', 'ts-node', 'typedoc', 'api-extractor', '@microsoft/api-extractor']) {
  if (name in deps) toolApiRisk.push(name);
}
if (tsMajor === 7 && toolApiRisk.length) {
  warnings.push(`TS7 compiler-API compatibility must be verified for tooling present in this project: ${toolApiRisk.join(', ')}. TS7.0 does not expose the previous compiler API.`);
}

const scripts = pkg.scripts ?? {};
if (!scripts.typecheck && !Object.values(scripts).some((v) => /\btsc\b/.test(String(v)))) {
  warnings.push('No obvious TypeScript typecheck script found. A bundler/transpiler build does not replace TS7 typechecking.');
}

const report = {
  ok: errors.length === 0,
  baseline: 'TypeScript 7 primary; TypeScript 6.0 bridge only',
  typescript: { declared: declaredTs, installed: actualTs, major: tsMajor },
  project: { hasReact, hasBundler, hasNodeTypes, packageType: pkg.type ?? null },
  configs,
  toolApiRisk,
  errors,
  warnings,
  info,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
