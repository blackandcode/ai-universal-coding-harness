import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-harness-cli-smoke-'));
const cli=path.resolve('dist/bin.js');
function run(args,expected=0){const r=spawnSync(process.execPath,[cli,...args],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,AI_HARNESS_CONFIG_HOME:path.join(root,'global-config')}});if(r.status!==expected){console.error(`Command failed: ${args.join(' ')}`);console.error(r.stdout);console.error(r.stderr);process.exit(2);}return r;}
try{
  spawnSync('git',['init'],{cwd:root,stdio:'ignore'});
  spawnSync('git',['config','user.email','smoke@example.test'],{cwd:root,stdio:'ignore'});
  spawnSync('git',['config','user.name','Smoke Test'],{cwd:root,stdio:'ignore'});
  fs.writeFileSync(path.join(root,'README.md'),'# Smoke\n');
  spawnSync('git',['add','.'],{cwd:root,stdio:'ignore'});
  spawnSync('git',['commit','-m','init'],{cwd:root,stdio:'ignore'});

  run(['init','--project',root]);
  for(const f of ['config.jsonc','permissions.jsonc','README.md']) if(!fs.existsSync(path.join(root,'.ai-orchestrator',f))) throw new Error(`init did not create ${f}`);
  for(const d of ['runs','stage-input','stage-runtime']) if(!fs.statSync(path.join(root,'.ai-orchestrator',d)).isDirectory()) throw new Error(`init did not create ${d}`);

  const stage=path.join(root,'specs','stage-06-smoke-feature');fs.mkdirSync(stage,{recursive:true});
  fs.writeFileSync(path.join(stage,'functional-spec.md'),'# Functional\n\n## Acceptance Criteria\n- pass\n');
  fs.writeFileSync(path.join(stage,'technical-spec.md'),'# Technical\n\nDetails\n');
  fs.writeFileSync(path.join(stage,'prompt.md'),'# Prompt\n\nImplement it.\n');
  run(['validate','--project',root,'--stage-source','specs','--stage','06']);

  fs.writeFileSync(path.join(stage,'prompt.md'),'invalid text without heading\n');
  run(['validate','--project',root,'--stage-source','specs','--stage','06'],2);

  run(['runs','list','--project',root]);
  run(['runs','reset','--project',root,'--force']);
  console.log('CLI smoke test OK.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
