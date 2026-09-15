import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const command=fs.existsSync('package-lock.json')?'ci':'install';
const args=[command,'--ignore-scripts','--no-audit','--no-fund'];
const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{stdio:'inherit',windowsHide:true});
process.exit(r.status??1);
