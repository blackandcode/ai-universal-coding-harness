import fs from 'node:fs';
if(fs.existsSync('dist/bin.js')){
  try{fs.chmodSync('dist/bin.js',0o755);}catch{}
}
