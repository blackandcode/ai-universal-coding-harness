import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT,STATE_ROOT,RUNS_ROOT,STAGE_INPUT_ROOT,STAGE_RUNTIME_ROOT,LOCAL_CONFIG_FILE,LOCAL_PERMISSIONS_FILE,LATEST_FILE,LOCK_FILE} from '../core/paths.js';
import {removeTree} from '../core/fs.js';
import {projectPlaceholderConfigTemplate,projectPermissionsTemplate} from '../core/config.js';

function ensureDir(p:string){fs.mkdirSync(p,{recursive:true});}
function git(args:string[]){return spawnSync('git',args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']});}

export class ProjectWorkspace {
  readonly root=ROOT;
  isGitRepository(){return git(['rev-parse','--is-inside-work-tree']).status===0;}
  isInitialized(){return fs.existsSync(LOCAL_CONFIG_FILE)&&fs.existsSync(STATE_ROOT);}
  requireInitialized(){if(!this.isInitialized())throw new Error(`Project is not initialized for AI Universal Coding Harness. Run: ai-harness init`);}

  init(force=false){
    if(!this.isGitRepository())throw new Error(`AI Universal Coding Harness requires a Git repository. Initialize Git first, then run ai-harness init.`);
    ensureDir(STATE_ROOT);ensureDir(RUNS_ROOT);ensureDir(STAGE_INPUT_ROOT);ensureDir(STAGE_RUNTIME_ROOT);
    if(force||!fs.existsSync(LOCAL_CONFIG_FILE))fs.writeFileSync(LOCAL_CONFIG_FILE,projectPlaceholderConfigTemplate());
    if(force||!fs.existsSync(LOCAL_PERMISSIONS_FILE))fs.writeFileSync(LOCAL_PERMISSIONS_FILE,projectPermissionsTemplate());
    const readme=path.join(STATE_ROOT,'README.md');
    if(force||!fs.existsSync(readme))fs.writeFileSync(readme,`# .ai-orchestrator\n\nLocal runtime workspace for AI Universal Coding Harness.\n\n- \`config.jsonc\` — local project overrides\n- \`permissions.jsonc\` — local permission overrides\n- \`runs/\` — machine + human run history\n- \`stage-input/\` — frozen selected stage specifications for the active run\n- \`stage-runtime/\` — executor evidence/runtime files\n\nThis directory is excluded locally through \`.git/info/exclude\` and should not be committed.\n`);
    this.ensureGitExclude();
    return {root:STATE_ROOT,config:LOCAL_CONFIG_FILE,permissions:LOCAL_PERMISSIONS_FILE,runs:RUNS_ROOT,stageInput:STAGE_INPUT_ROOT,stageRuntime:STAGE_RUNTIME_ROOT};
  }

  ensureGitExclude(){
    const gitDirRes=git(['rev-parse','--git-dir']);if(gitDirRes.status!==0)return;
    const raw=String(gitDirRes.stdout).trim();const gitDir=path.resolve(ROOT,raw);const info=path.join(gitDir,'info');ensureDir(info);const file=path.join(info,'exclude');const entry='.ai-orchestrator/';let text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';if(!text.split(/\r?\n/).includes(entry)){if(text&&!text.endsWith('\n'))text+='\n';text+=entry+'\n';fs.writeFileSync(file,text);}
  }

  listRuns(){
    if(!fs.existsSync(RUNS_ROOT))return [] as Array<{id:string;status?:string;updated_at?:string;branch?:string}>;
    return fs.readdirSync(RUNS_ROOT,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>{const file=path.join(RUNS_ROOT,x.name,'run.json');try{const j=JSON.parse(fs.readFileSync(file,'utf8'));return{id:x.name,status:j.status,updated_at:j.updated_at,branch:j.branch};}catch{return{id:x.name};}}).sort((a,b)=>b.id.localeCompare(a.id));
  }

  assertNoActiveRun(){
    if(!fs.existsSync(LOCK_FILE))return;
    try{const lock=JSON.parse(fs.readFileSync(LOCK_FILE,'utf8'));const pid=Number(lock.pid);if(pid>0){try{process.kill(pid,0);throw new Error(`Another orchestrator process is active (PID ${pid}, run ${lock.run_id||'unknown'}).`);}catch(e:any){if(e?.code!=='ESRCH')throw e;}}}catch(e:any){if(/Another orchestrator/.test(String(e?.message)))throw e;}
  }

  resetRuns(force=false){
    this.requireInitialized();if(!force)throw new Error('Refusing to delete run history without --force.');this.assertNoActiveRun();
    removeTree(RUNS_ROOT);removeTree(STAGE_INPUT_ROOT);removeTree(STAGE_RUNTIME_ROOT);ensureDir(RUNS_ROOT);ensureDir(STAGE_INPUT_ROOT);ensureDir(STAGE_RUNTIME_ROOT);
    for(const p of [LATEST_FILE,LOCK_FILE,path.join(STATE_ROOT,'preflight-events.jsonl'),path.join(STATE_ROOT,'creating-events.jsonl'),path.join(STATE_ROOT,'preflight.log')]){try{fs.rmSync(p,{force:true})}catch{}}
    return {deleted:'all run history',preserved:[LOCAL_CONFIG_FILE,LOCAL_PERMISSIONS_FILE]};
  }

  deleteRun(id:string,force=false){
    this.requireInitialized();if(!id)throw new Error('--run <run-id> is required.');if(!force)throw new Error('Refusing to delete a run without --force.');this.assertNoActiveRun();
    if(!/^[A-Za-z0-9._-]+$/.test(id))throw new Error(`Invalid run id: ${id}`);const dir=path.join(RUNS_ROOT,id);if(!fs.existsSync(dir))throw new Error(`Run not found: ${id}`);removeTree(dir);
    if(fs.existsSync(LATEST_FILE)&&fs.readFileSync(LATEST_FILE,'utf8').trim()===id){const remaining=this.listRuns();if(remaining.length)fs.writeFileSync(LATEST_FILE,remaining[0].id+'\n');else fs.rmSync(LATEST_FILE,{force:true});}
    return id;
  }
}
