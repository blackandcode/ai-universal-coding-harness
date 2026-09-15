import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {ExecutorHarness,ReviewerHarness} from './types.js';
import {CursorExecutorHarness} from './cursor/CursorExecutorHarness.js';
import {CodexReviewerHarness} from './codex/CodexReviewerHarness.js';
import {PROJECT_ROOT,CONFIG} from '../core/config.js';

export class HarnessRegistry {
  private executors=new Map<string,(ctx:any)=>ExecutorHarness>();
  private reviewers=new Map<string,(ctx:any)=>ReviewerHarness>();
  private loaded=new Set<string>();
  constructor(){
    this.registerExecutor('cursor',ctx=>new CursorExecutorHarness(ctx));
    this.registerReviewer('codex',ctx=>new CodexReviewerHarness(ctx));
  }
  registerExecutor(id:string,f:(ctx:any)=>ExecutorHarness){this.executors.set(id,f);}
  registerReviewer(id:string,f:(ctx:any)=>ReviewerHarness){this.reviewers.set(id,f);}
  executor(id:string,ctx:any){const f=this.executors.get(id);if(!f)throw new Error(`Unknown executor harness '${id}'. Registered: ${[...this.executors.keys()].join(', ')}`);return f(ctx);}
  reviewer(id:string,ctx:any){const f=this.reviewers.get(id);if(!f)throw new Error(`Unknown reviewer harness '${id}'. Registered: ${[...this.reviewers.keys()].join(', ')}`);return f(ctx);}
  list(){return{executors:[...this.executors.keys()],reviewers:[...this.reviewers.keys()]};}
  async loadConfigured(modules:string[]=CONFIG.harnessModules){for(const spec of modules)await this.loadModule(spec);}
  async loadModule(spec:string){
    if(this.loaded.has(spec))return;
    let target=spec;
    if(spec.startsWith('.')||path.isAbsolute(spec)) target=pathToFileURL(path.resolve(PROJECT_ROOT,spec)).href;
    else {const req=createRequire(path.join(PROJECT_ROOT,'package.json'));target=pathToFileURL(req.resolve(spec)).href;}
    const mod:any=await import(target);const register=mod.registerHarnesses||mod.default;
    if(typeof register!=='function')throw new Error(`Harness module '${spec}' must export registerHarnesses(registry) or a default registration function.`);
    await register(this);this.loaded.add(spec);
  }
}
