#!/usr/bin/env node
import fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const warnings = [];
const checks = {
  nodeEngine: pkg.engines?.node ?? null,
  moduleType: pkg.type ?? '(unspecified)',
  start: pkg.scripts?.start ?? null,
  test: pkg.scripts?.test ?? null,
  typecheck: pkg.scripts?.typecheck ?? null,
  lint: pkg.scripts?.lint ?? null,
};
if (!pkg.engines?.node) warnings.push('Declare engines.node (target is Node 24+).');
if (!pkg.scripts?.test) warnings.push('No test script found.');
if (!pkg.scripts?.typecheck) warnings.push('No typecheck script found.');
if (!pkg.scripts?.lint) warnings.push('No lint script found.');
console.log(JSON.stringify({ checks, warnings }, null, 2));
