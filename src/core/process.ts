import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import readline from 'node:readline';

export interface ProcessResult { code:number; stdout:string; stderr:string; }
export function execSyncText(cmd:string,args:string[]=[],opts:any={}):ProcessResult{
  const r=spawnSync(cmd,args,{encoding:'utf8',windowsHide:true,...opts});
  return {code:r.status??1,stdout:String(r.stdout||''),stderr:String(r.stderr||'')};
}
export async function runProcess(cmd:string,args:string[],opts:any={}):Promise<ProcessResult>{
  return await new Promise((resolve,reject)=>{
    const child=spawn(cmd,args,{cwd:opts.cwd,env:opts.env||process.env,stdio:['pipe','pipe','pipe'],windowsHide:true});
    let stdout='',stderr=''; let timer:any=null; let settled=false;
    const finish=(fn:()=>void)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);fn();};
    if(opts.stdinText){ child.stdin.write(opts.stdinText); child.stdin.end(); }
    const rl=readline.createInterface({input:child.stdout}); rl.on('line',(line:string)=>{stdout+=line+'\n'; opts.onStdoutLine?.(line);});
    const er=readline.createInterface({input:child.stderr}); er.on('line',(line:string)=>{stderr+=line+'\n'; opts.onStderrLine?.(line);});
    if(opts.timeoutMs) timer=setTimeout(()=>{try{child.kill()}catch{};finish(()=>reject(new Error(`Command timed out after ${opts.timeoutMs}ms: ${cmd} ${args.join(' ')}`)));},opts.timeoutMs);
    child.on('error',(e:any)=>finish(()=>reject(e)));
    child.on('exit',(code:number|null)=>finish(()=>{rl.close();er.close();resolve({code:code??1,stdout,stderr});}));
  });
}
export async function runShellCommand(command:string,opts:any={}):Promise<ProcessResult>{
  return await new Promise((resolve,reject)=>{
    const child=spawn(command,[],{cwd:opts.cwd,env:opts.env||process.env,stdio:['ignore','pipe','pipe'],shell:true,windowsHide:true});
    let stdout='',stderr=''; let timer:any=null; let settled=false;
    const finish=(fn:()=>void)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);fn();};
    const rl=readline.createInterface({input:child.stdout});rl.on('line',(line:string)=>{stdout+=line+'\n';opts.onStdoutLine?.(line)});
    const er=readline.createInterface({input:child.stderr});er.on('line',(line:string)=>{stderr+=line+'\n';opts.onStderrLine?.(line)});
    if(opts.timeoutMs)timer=setTimeout(()=>{try{child.kill()}catch{};finish(()=>reject(new Error(`Command timed out after ${opts.timeoutMs}ms: ${command}`)));},opts.timeoutMs);
    child.on('error',(e:any)=>finish(()=>reject(e)));
    child.on('exit',(code:number|null)=>finish(()=>{rl.close();er.close();resolve({code:code??1,stdout,stderr});}));
  });
}
export function commandExists(name:string){
  if(!name)return false;
  if(path.isAbsolute(name)||name.includes('/')||name.includes('\\')){try{fs.accessSync(name,fs.constants.X_OK);return true}catch{return false}}
  const dirs=(process.env.PATH||'').split(path.delimiter).filter(Boolean);
  const exts=process.platform==='win32'?(process.env.PATHEXT||'.EXE;.CMD;.BAT;.COM').split(';'):[''];
  for(const dir of dirs)for(const ext of exts){const p=path.join(dir,process.platform==='win32'&&path.extname(name)?name:name+ext);try{fs.accessSync(p,fs.constants.X_OK);return true}catch{}}
  return false;
}
