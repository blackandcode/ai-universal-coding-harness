import fs from 'node:fs';
const required=['dist/bin.js','dist/index.js','README.md','CHANGELOG.md','LICENSE','permissions.default.jsonc','config.example.jsonc','docs/publishing.md','.github/workflows/publish-npm.yml'];
for(const f of required)if(!fs.existsSync(f)){console.error(`Missing package artifact: ${f}`);process.exit(2);}
const bin=fs.readFileSync('dist/bin.js','utf8');if(!bin.startsWith('#!/usr/bin/env node')){console.error('dist/bin.js is missing Node shebang.');process.exit(2);}
for(const f of fs.readdirSync('.'))if(f.endsWith('.sh')){console.error(`Shell runtime script should not be present in package root: ${f}`);process.exit(2);}
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
if(pkg.name!=='ai-universal-coding-harness'){console.error('Unexpected npm package name.');process.exit(2);}
if(pkg.repository?.url!=='git+https://github.com/blackandcode/ai-universal-coding-harness.git'){console.error('package.json repository URL must exactly match the GitHub repository for npm trusted publishing.');process.exit(2);}
if(!pkg.bin?.['ai-harness']||!pkg.bin?.['ai-universal-coding-harness']){console.error('Required CLI bin aliases are missing.');process.exit(2);}

const publishWorkflow=fs.readFileSync('.github/workflows/publish-npm.yml','utf8');
if(!/id-token:\s*write/.test(publishWorkflow)){console.error('npm publish workflow must request id-token: write for OIDC.');process.exit(2);}
if(/NPM_TOKEN|NODE_AUTH_TOKEN/.test(publishWorkflow)){console.error('npm publish workflow must not contain long-lived npm publish token variables.');process.exit(2);}
if(!/run:\s*npm publish/.test(publishWorkflow)){console.error('npm publish workflow is missing npm publish.');process.exit(2);}
if(!/already_published/.test(publishWorkflow)){console.error('npm publish workflow must safely skip an already-published bootstrap version.');process.exit(2);}

const versionSrc=fs.readFileSync('src/version.ts','utf8');if(!versionSrc.includes(`VERSION = '${pkg.version}'`)){console.error('package.json and src/version.ts versions differ.');process.exit(2);}
console.log('Package check OK.');
