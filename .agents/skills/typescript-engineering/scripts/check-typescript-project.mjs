#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const pkgPath = path.join(cwd, 'package.json');
const result = { ok: true, checks: [], warnings: [] };

if (!fs.existsSync(pkgPath)) {
  console.error('package.json not found');
  process.exit(2);
}
const pkg = readJson(pkgPath);
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
const ts = allDeps.typescript;
result.checks.push({ name: 'typescript-dependency', value: ts ?? null });
if (!ts) { result.ok = false; result.warnings.push('TypeScript is not declared in package.json.'); }

const configs = fs.readdirSync(cwd).filter((f) => /^tsconfig.*\.json$/.test(f));
result.checks.push({ name: 'tsconfig-files', value: configs });
if (!configs.length) { result.ok = false; result.warnings.push('No tsconfig*.json found.'); }

for (const file of configs) {
  try {
    const raw = fs.readFileSync(path.join(cwd, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const cfg = JSON.parse(raw);
    const c = cfg.compilerOptions ?? {};
    result.checks.push({
      name: `compiler-options:${file}`,
      value: {
        strict: c.strict,
        noUncheckedIndexedAccess: c.noUncheckedIndexedAccess,
        exactOptionalPropertyTypes: c.exactOptionalPropertyTypes,
        verbatimModuleSyntax: c.verbatimModuleSyntax,
        module: c.module,
        moduleResolution: c.moduleResolution,
      },
    });
    if (c.strict !== true) result.warnings.push(`${file}: compilerOptions.strict is not true.`);
  } catch {
    result.warnings.push(`${file}: could not parse as plain JSON; it may contain JSONC syntax.`);
  }
}

result.checks.push({ name: 'typecheck-script', value: pkg.scripts?.typecheck ?? null });
if (!pkg.scripts?.typecheck) result.warnings.push('No package.json typecheck script found.');
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
