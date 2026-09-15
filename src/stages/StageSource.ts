import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import {sha256File,removeTree} from '../core/fs.js';
import {StageManifest} from '../types.js';

export const REQUIRED_STAGE_FILES=['functional-spec.md','technical-spec.md','prompt.md'] as const;
export interface StageValidationIssue { level:'error'|'warning'; file?:string; message:string; }
export interface StageValidationReport { stage:string; dir:string; valid:boolean; issues:StageValidationIssue[]; }

export const stageNameOk=(s:string)=>/^stage-[0-9]{2}-[a-z0-9][a-z0-9-]*$/.test(s);
export function selectorNum(sel:string){ if(/^[0-9]{1,2}$/.test(sel)) return String(Number(sel)).padStart(2,'0'); const m=sel.match(/^stage-([0-9]{2})-[a-z0-9][a-z0-9-]*$/); if(m) return m[1]; throw new Error(`Invalid stage selector '${sel}'. Use 6, 06, or exact stage-NN-kebab-name.`); }
function walk(root:string,out:string[]=[]){ const b=path.basename(root); if(stageNameOk(b)){out.push(root);return out;} for(const ent of fs.readdirSync(root,{withFileTypes:true})){ if(!ent.isDirectory()||['.git','node_modules','vendor','.ai-orchestrator'].includes(ent.name)) continue; const p=path.join(root,ent.name); if(stageNameOk(ent.name)) out.push(p); else walk(p,out); } return out; }
function validateEntries(zip:any){ for(const entry of zip.getEntries()){ const name=entry.entryName.replace(/\\/g,'/'); if(name.startsWith('/')||/(^|\/)\.\.(\/|$)/.test(name)||/^[A-Za-z]:/.test(name)) throw new Error(`Unsafe ZIP entry rejected: ${entry.entryName}`); const mode=(Number(entry.attr||0)>>>16)&0o170000; if(mode===0o120000) throw new Error(`ZIP symbolic links are not allowed in stage sources: ${entry.entryName}`); } }
function hasMarkdownHeading(text:string){return /^#{1,6}\s+\S+/m.test(text);}

export class StageSource {
  private tempDir:string|null=null;
  readonly root:string;
  constructor(public source:string){
    const abs=path.resolve(source); if(!fs.existsSync(abs)) throw new Error(`Stage source not found: ${abs}`);
    if(fs.statSync(abs).isDirectory()) this.root=abs;
    else if(abs.toLowerCase().endsWith('.zip')){
      const zip=new AdmZip(abs); validateEntries(zip); this.tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-harness-stage-source-')); zip.extractAllTo(this.tempDir,true); this.root=this.tempDir;
    } else throw new Error('Stage source must be a directory or .zip file.');
  }
  list(feature=''){ return walk(this.root).filter(p=>!feature||p.split(path.sep).includes(feature)||p.includes(`${path.sep}${feature}${path.sep}`)).sort(); }
  validateDir(dir:string):StageValidationReport {
    const issues:StageValidationIssue[]=[]; const stage=path.basename(dir);
    let stat:any; try{stat=fs.lstatSync(dir);}catch{return{stage,dir,valid:false,issues:[{level:'error',message:'Stage directory does not exist.'}]};}
    if(stat.isSymbolicLink())issues.push({level:'error',message:'Stage directory must not be a symbolic link.'});
    if(!stat.isDirectory())issues.push({level:'error',message:'Stage path must be a directory.'});
    if(!stageNameOk(stage))issues.push({level:'error',message:'Stage directory must match stage-NN-kebab-case-name.'});
    for(const file of REQUIRED_STAGE_FILES){const p=path.join(dir,file);if(!fs.existsSync(p)){issues.push({level:'error',file,message:`Missing required ${file}.`});continue;}const s=fs.lstatSync(p);if(s.isSymbolicLink()){issues.push({level:'error',file,message:`${file} must be a regular file, not a symbolic link.`});continue;}if(!s.isFile()){issues.push({level:'error',file,message:`${file} must be a regular file.`});continue;}if(s.size===0){issues.push({level:'error',file,message:`${file} must not be empty.`});continue;}const text=fs.readFileSync(p,'utf8');if(!text.trim())issues.push({level:'error',file,message:`${file} contains no meaningful content.`});else if(!hasMarkdownHeading(text))issues.push({level:'error',file,message:`${file} must contain at least one Markdown heading.`});if(text.includes('\u0000'))issues.push({level:'error',file,message:`${file} contains binary/NUL data instead of Markdown text.`});}
    return{stage,dir,valid:!issues.some(i=>i.level==='error'),issues};
  }
  assertValid(dir:string){const report=this.validateDir(dir);if(!report.valid)throw new Error(`Invalid stage package '${report.stage}':\n${report.issues.map(i=>`  - ${i.file?`${i.file}: `:''}${i.message}`).join('\n')}`);return report;}
  validateAll(feature=''){return this.list(feature).map(dir=>this.validateDir(dir));}
  find(selector:string,feature=''){ const num=selectorNum(selector); const found=this.list(feature).filter(p=>{const b=path.basename(p);return selector.startsWith('stage-')?b===selector:b.startsWith(`stage-${num}-`)}); if(!found.length) throw new Error(`No stage matched '${selector}' under ${this.source}${feature?` (feature=${feature})`:''}.`); if(found.length>1) throw new Error(`Stage '${selector}' is ambiguous:\n${found.map(x=>`  ${x}`).join('\n')}\nUse --feature or the exact stage folder name.`); return found[0]; }
  resolve(selector:string,feature=''){ const dir=this.find(selector,feature); this.assertValid(dir); return dir; }
  manifest(dir:string,selector:string):StageManifest { this.assertValid(dir); const sha:any={}; for(const f of REQUIRED_STAGE_FILES) sha[f]=sha256File(path.join(dir,f)); return {name:path.basename(dir),selector,source:path.resolve(this.source),relative_path:path.relative(this.root,dir),sha256:sha}; }
  close(){ if(this.tempDir) removeTree(this.tempDir); this.tempDir=null; }
}
