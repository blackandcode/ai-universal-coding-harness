#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const pkgPath = path.join(cwd, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error(JSON.stringify({ ok: false, errors: ['package.json not found'] }, null, 2));
  process.exit(2);
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
const warnings = [];
const errors = [];
const info = [];
const engine = pkg.engines?.node ?? null;

function lowestMajor(range) {
  const nums = String(range ?? '').match(/\d+(?:\.\d+){0,2}/g) ?? [];
  return nums.length ? Number(nums[0].split('.')[0]) : null;
}
const engineMajor = lowestMajor(engine);
if (!engine) warnings.push('Declare engines.node; this skill targets Node 24+.');
else if (engineMajor !== null && engineMajor < 24) errors.push(`engines.node is ${engine}; Node 24+ is required by this skill baseline.`);

const scripts = pkg.scripts ?? {};
const scriptText = Object.entries(scripts).map(([k, v]) => `${k}: ${v}`).join('\n');
const nativeTsScripts = Object.entries(scripts).filter(([, v]) => /\bnode\b[^\n]*(?:\.ts\b|\.mts\b|\.cts\b)/.test(String(v)));
if (nativeTsScripts.length) {
  info.push(`Native Node TypeScript execution appears in scripts: ${nativeTsScripts.map(([k]) => k).join(', ')}.`);
  if (engine && !/(?:\^|>=|~)?24\.(?:1[2-9]|[2-9]\d)|(?:>=|\^)25|(?:>=|\^)26/.test(engine)) {
    warnings.push('Direct .ts execution is detected. Built-in TypeScript stripping is stable from Node 24.12.0; make the engine/runtime contract explicit if relying on it.');
  }
}

if (pkg.type !== 'module') info.push('package.json does not declare type:"module". CommonJS may be intentional, but new Node 24+ projects should make the module contract explicit.');
if (!('@types/node' in deps)) warnings.push('@types/node is not declared; TS7 defaults compilerOptions.types to [], so Node globals/types must be intentional.');
if (!scripts.test) warnings.push('No test script found.');
if (!scripts.typecheck && !/\btsc\b/.test(scriptText)) warnings.push('No obvious TS typecheck script found. Native Node TS execution does not typecheck.');
if (!scripts.lint) warnings.push('No lint script found.');

const usesTsx = 'tsx' in deps;
const usesTsNode = 'ts-node' in deps;
if (usesTsNode) info.push('ts-node detected: verify current TypeScript 7/compiler-API compatibility before relying on it.');
if (usesTsx) info.push('tsx detected: appropriate when full TS execution/tooling behavior is desired beyond Node lightweight type stripping; keep separate TS7 typecheck.');

const report = {
  ok: errors.length === 0,
  baseline: 'Node 24+; Node >=24.12 for stable built-in TypeScript stripping',
  checks: {
    nodeEngine: engine,
    moduleType: pkg.type ?? null,
    nativeTypeScriptScripts: nativeTsScripts.map(([name, command]) => ({ name, command })),
    hasNodeTypes: '@types/node' in deps,
    hasTsx: usesTsx,
    hasTsNode: usesTsNode,
    start: scripts.start ?? null,
    test: scripts.test ?? null,
    typecheck: scripts.typecheck ?? null,
    lint: scripts.lint ?? null,
  },
  errors,
  warnings,
  info,
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
