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

function major(v) {
  const m = String(v ?? '').match(/(?:^|[^0-9])(\d+)\./);
  return m ? Number(m[1]) : null;
}
function installedVersion(name) {
  try {
    const p = path.join(cwd, 'node_modules', ...name.split('/'), 'package.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')).version ?? null;
  } catch { return null; }
}
function walk(dir, depth = 0, files = []) {
  if (depth > 5 || files.length > 1500 || !fs.existsSync(dir)) return files;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build', 'coverage', '.next'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, depth + 1, files);
    else if (/\.(tsx|ts)$/.test(e.name)) files.push(full);
  }
  return files;
}

const reactDeclared = deps.react ?? null;
const reactInstalled = installedVersion('react');
const reactMajor = major(reactInstalled) ?? major(reactDeclared);
const domDeclared = deps['react-dom'] ?? null;
const typesReact = deps['@types/react'] ?? null;
const typesDom = deps['@types/react-dom'] ?? null;
const typesReactMajor = major(installedVersion('@types/react')) ?? major(typesReact);

if (!reactDeclared) errors.push('React dependency not found.');
if (reactMajor && reactMajor < 19) errors.push(`React ${reactInstalled ?? reactDeclared} detected; this skill targets React 19+.`);
if (reactMajor === 19 && typesReact && typesReactMajor !== 19) warnings.push(`React 19 with @types/react ${typesReact}; align React 19 type major unless the package manager setup intentionally aliases types.`);
if (!domDeclared) info.push('react-dom is not declared; this may be intentional for non-DOM React targets.');
if ('react-test-renderer' in deps) warnings.push('react-test-renderer is deprecated in React 19; prefer Testing Library/integration tests for new work.');
if ('react-reconciler' in deps) info.push('react-reconciler detected: verify React 19 compatibility carefully because custom renderers are sensitive to internal changes.');

const compilerPkg = deps['babel-plugin-react-compiler'] ?? null;
if (compilerPkg) info.push(`React Compiler detected (${compilerPkg}); avoid reflexive manual memoization and keep compiler/rules diagnostics healthy.`);

const sourceRoots = ['src', 'app', 'packages'].map((x) => path.join(cwd, x)).filter(fs.existsSync);
const files = sourceRoots.flatMap((d) => walk(d));
const findings = {
  forwardRef: [],
  globalJsxNamespace: [],
  useRefNoArgument: [],
  legacyMutableRefObject: [],
  reactFC: [],
};
for (const file of files) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const rel = path.relative(cwd, file);
  if (/\bforwardRef\s*[<(]/.test(text)) findings.forwardRef.push(rel);
  if (/\bnamespace\s+JSX\s*\{/.test(text) && !/declare\s+module\s+['"]react(?:\/jsx-(?:dev-)?runtime)?['"]/.test(text)) findings.globalJsxNamespace.push(rel);
  if (/\buseRef\s*(?:<[^>]*>)?\s*\(\s*\)/.test(text)) findings.useRefNoArgument.push(rel);
  if (/\bMutableRefObject\b/.test(text)) findings.legacyMutableRefObject.push(rel);
  if (/\bReact\.FC\b|\bFC\s*</.test(text)) findings.reactFC.push(rel);
}
if (findings.globalJsxNamespace.length) warnings.push(`Possible global JSX namespace augmentation found in: ${findings.globalJsxNamespace.slice(0, 8).join(', ')}. React 19 uses scoped JSX namespaces.`);
if (findings.useRefNoArgument.length) errors.push(`React 19 useRef requires an argument; possible no-argument calls in: ${findings.useRefNoArgument.slice(0, 8).join(', ')}.`);
if (findings.legacyMutableRefObject.length) warnings.push(`MutableRefObject references found in: ${findings.legacyMutableRefObject.slice(0, 8).join(', ')}. React 19 ref typing uses the unified mutable RefObject model.`);
if (findings.forwardRef.length) info.push(`forwardRef appears in ${findings.forwardRef.length} file(s). It is not automatically wrong, but new React 19-only function components can usually receive ref as a prop.`);
if (findings.reactFC.length) info.push(`React.FC/FC appears in ${findings.reactFC.length} file(s). This is not prohibited; prefer direct prop typing unless FC provides deliberate value in the local style.`);

const testing = Object.keys(deps).filter((d) => /testing-library|vitest|jest|playwright|cypress/.test(d));
const report = {
  ok: errors.length === 0,
  baseline: 'React 19+; guidance aligned with React 19.3 and TypeScript 7',
  versions: {
    reactDeclared,
    reactInstalled,
    reactDom: domDeclared,
    typesReact,
    typesReactDom: typesDom,
    reactCompiler: compilerPkg,
  },
  testing,
  scannedTsFiles: files.length,
  findings: Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.slice(0, 25)])),
  errors,
  warnings,
  info,
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
