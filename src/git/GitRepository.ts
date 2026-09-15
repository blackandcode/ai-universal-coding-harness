import {execSyncText} from '../core/process.js';

export class GitRepository {
  constructor(public root:string){}
  run(args:string[],allowFail=false){ const r=execSyncText('git',args,{cwd:this.root}); if(!allowFail&&r.code!==0) throw new Error(`git ${args.join(' ')} failed:\n${r.stderr||r.stdout}`); return r; }
  currentBranch(){ return this.run(['branch','--show-current'],true).stdout.trim(); }
  head(){ return this.run(['rev-parse','HEAD']).stdout.trim(); }
  isDirty(){ return Boolean(this.run(['status','--porcelain'],true).stdout.trim()); }
  branchExists(name:string){ return this.run(['show-ref','--verify','--quiet',`refs/heads/${name}`],true).code===0; }
  switch(name:string){ this.run(['switch',name]); }
  createBranch(name:string,base:string){ this.run(['switch','-c',name,base]); }
  stash(label:string){ const before=this.run(['rev-parse','refs/stash'],true).stdout.trim(); this.run(['stash','push','-u','-m',label]); const after=this.run(['rev-parse','refs/stash'],true).stdout.trim(); return after&&after!==before?after:''; }
  findStash(label:string){ const out=this.run(['stash','list','--format=%H%x09%gs'],true).stdout; for(const line of out.split(/\r?\n/)){ if(!line.includes(label)) continue; return line.split('\t')[0]||''; } return ''; }
  diffStat(){ return this.run(['diff','--stat','HEAD'],true).stdout; }
  statusShort(){ return this.run(['status','--short'],true).stdout; }
  diff(paths?:string[]){ const args=['diff','--binary','HEAD']; if(paths?.length) args.push('--',...paths); return this.run(args,true).stdout; }
  reviewDiff(paths?:string[]){ let out=this.diff(paths); const selected=paths?new Set(paths):null; for(const line of this.run(['status','--porcelain'],true).stdout.split(/\r?\n/)){ if(!line.startsWith('?? ')) continue; const file=line.slice(3).trim(); if(selected&&![...selected].some(p=>file===p||file.startsWith(p.replace(/\/$/,'')+'/'))) continue; const r=this.run(['diff','--no-index','--binary','--','/dev/null',file],true); out+=`\n${r.stdout||''}`; } return out; }
  changedFiles(){ const names=new Set<string>(); for(const line of this.run(['status','--porcelain'],true).stdout.split(/\r?\n/)){ if(!line) continue; const p=line.slice(3).trim(); if(p) names.add(p.includes(' -> ')?p.split(' -> ').at(-1)!:p); } return [...names]; }
  commit(subject:string,bodyLines:string[]=[]){ this.run(['add','-A']); const args=['commit','--allow-empty','-m',subject]; for(const line of bodyLines){ if(line) args.push('-m',line); } this.run(args); return this.head(); }
}
