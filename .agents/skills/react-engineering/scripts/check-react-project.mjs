#!/usr/bin/env node
import fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
const warnings = [];
const react = deps.react ?? null;
const reactDom = deps['react-dom'] ?? null;
if (!react) warnings.push('React dependency not found.');
if (!reactDom) warnings.push('react-dom dependency not found (may be intentional for non-DOM targets).');
const testing = Object.keys(deps).filter((d) => /testing-library|vitest|jest|playwright/.test(d));
console.log(JSON.stringify({ react, reactDom, testing, warnings }, null, 2));
