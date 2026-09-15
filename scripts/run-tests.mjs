import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

function walk(dir,out=[]){if(!fs.existsSync(dir))return out;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p,out);else if(e.name.endsWith('.test.js'))out.push(p);}return out;}
const files=walk(path.resolve('dist')).sort();
if(!files.length){console.error('No compiled test files found. Run npm run build first.');process.exit(2);}
const r=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',windowsHide:true});
process.exit(r.status??1);
