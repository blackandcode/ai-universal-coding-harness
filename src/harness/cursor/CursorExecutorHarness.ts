import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {ExecutorHarness,ExecutorSession,ExecutorSessionCallbacks,HarnessInfo,HarnessPreflightResult} from '../types.js';
import {CommandObservation} from '../../types.js';
import {CONFIG,harnessNumber,harnessString} from '../../core/config.js';
import {execSyncText,commandExists,runShellCommand} from '../../core/process.js';
import {appendBounded,ensureDir,rotateFile} from '../../core/fs.js';
import {iso} from '../../core/time.js';
import {PermissionRequest} from '../../permissions/PermissionEngine.js';
import {VERSION} from '../../version.js';

export class CursorExecutorHarness implements ExecutorHarness {
  static defaults={binary:'agent',model:'gemini-3.8-flash',thinking:'high',turnTimeoutMinutes:45};
  private binary=harnessString('cursor','binary',CursorExecutorHarness.defaults.binary);
  private model=harnessString('cursor','model',CursorExecutorHarness.defaults.model);
  private thinking=harnessString('cursor','thinking',CursorExecutorHarness.defaults.thinking);
  private turnTimeoutMinutes=harnessNumber('cursor','turnTimeoutMinutes',CursorExecutorHarness.defaults.turnTimeoutMinutes);
  info:HarnessInfo={id:'cursor',label:`${this.model} ${this.thinking}`,role:'executor',model:this.model};
  constructor(private ctx:any){
    this.binary=ctx?.executorBinary||this.binary;
    this.model=ctx?.executorModel||this.model;
    this.info={...this.info,model:this.model,label:`${this.model} ${this.thinking}`};
  }
  async preflight():Promise<HarnessPreflightResult>{ if(!commandExists(this.binary)) return {ok:false,details:[`${this.binary} not found`]}; const models=execSyncText(this.binary,['models']); const details=[models.stdout.trim()]; if(models.code!==0||!models.stdout.toLowerCase().includes(this.model.toLowerCase())) return {ok:false,details:[...details,`Model ${this.model} not available`]}; return {ok:true,details}; }
  async createSession(opts:any){ const s=new CursorAcpSession({...opts,binary:this.binary,model:this.model,thinking:this.thinking,turnTimeoutMinutes:this.turnTimeoutMinutes,events:this.ctx.events}); await s.start(); return s; }
}

export class CursorAcpSession implements ExecutorSession {
  id='';
  private child:any;
  private rl:any;
  private er:any;
  private nextId=1;
  private pending=new Map<number,any>();
  private agentText='';
  private capabilities:any={};
  private externalResults:any[]=[];
  private tools=new Map<string,any>();
  private observed:CommandObservation[]=[];
  private sequence=0;
  private lastMutationSequence=0;
  private qualityEpochId='';
  private journalFile='';

  constructor(private o:{workspace:string;runLog:string;eventsFile:string;focusFile:string;resumeSessionId?:string;callbacks:ExecutorSessionCallbacks;binary:string;model:string;thinking:string;turnTimeoutMinutes:number;events:any;stageName?:string;attempt?:number;runId?:string;observationsFile?:string}){
    ensureDir(path.dirname(o.eventsFile));
    ensureDir(path.dirname(o.focusFile));
    this.journalFile=o.observationsFile||path.join(path.dirname(o.eventsFile),'executor-observations.jsonl');
    ensureDir(path.dirname(this.journalFile));
    if(!fs.existsSync(o.focusFile))fs.writeFileSync(o.focusFile,'');
  }

  currentSequence():number{return this.sequence;}
  lastMutationSeq():number{return this.lastMutationSequence;}
  setQualityEpoch(epochId:string):void{this.qualityEpochId=epochId;}
  observedCommands():CommandObservation[]{return [...this.observed];}

  private appendObservationJournal(entry:CommandObservation){
    if(!this.journalFile)return;
    try{fs.appendFileSync(this.journalFile,JSON.stringify(entry)+'\n');}catch{}
  }

  private recordObserved(entry:CommandObservation,isReplay=false){
    const idx=this.observed.findIndex(x=>x.tool_call_id===entry.tool_call_id&&x.session_id===entry.session_id);
    if(idx>=0){
      this.observed[idx]={
        ...this.observed[idx],
        ...entry,
        exit_code:entry.exit_code??this.observed[idx].exit_code,
        status:entry.status||this.observed[idx].status,
        sequence:entry.sequence||this.observed[idx].sequence
      };
    }else{
      this.observed.push(entry);
    }
    if(!isReplay){
      this.appendObservationJournal(entry);
    }
  }

  private replayHistoricalEvents(){
    if(!fs.existsSync(this.o.eventsFile))return;
    try{
      const replayed=parseAcpEvents(this.o.eventsFile,{
        runId:this.o.runId,
        stageName:this.o.stageName,
        attempt:this.o.attempt,
        workspace:this.o.workspace
      });
      for(const obs of replayed){
        this.recordObserved(obs,true);
      }
      if(this.observed.length>0){
        this.o.events?.emit?.('log',{level:'info',message:`Replayed ${this.observed.length} executor observations from historical ACP log.`});
      }
    }catch(e:any){
      appendBounded(this.o.runLog,`[executor replay failed] ${e.message}`,CONFIG.RUN_LOG_MAX_BYTES);
    }
  }

  private raw(obj:any){const line=JSON.stringify(obj);this.child?.stdin?.write(line+'\n');fs.appendFileSync(this.o.eventsFile,`CLIENT ${line}\n`);}
  private respond(id:any,result:any){this.raw({jsonrpc:'2.0',id,result});}
  private request(method:string,params:any,timeoutMs=this.o.turnTimeoutMinutes*60_000):Promise<any>{const id=this.nextId++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);if(method==='session/prompt')this.cancel().catch(()=>{});reject(new Error(`Cursor ACP request timed out: ${method}`));},timeoutMs);this.pending.set(id,{resolve,reject,timer,method});this.raw({jsonrpc:'2.0',id,method,params});});}
  async start(){this.child=spawn(this.o.binary,['--model',this.o.model,'acp'],{cwd:this.o.workspace,stdio:['pipe','pipe','pipe'],env:process.env});this.child.stdin?.on?.('error',(e:any)=>{if(e?.code!=='EPIPE')this.o.events.emit('log',{level:'warn',message:`Executor stdin: ${e.message}`});});this.rl=readline.createInterface({input:this.child.stdout});this.rl.on('line',(l:string)=>this.handleLine(l));this.er=readline.createInterface({input:this.child.stderr});this.er.on('line',(l:string)=>{appendBounded(this.o.runLog,`[executor-stderr] ${l}`,CONFIG.RUN_LOG_MAX_BYTES);this.o.events.emit('log',{level:'warn',message:`Executor: ${l}`});});this.child.on('exit',(code:number)=>{for(const [,p] of this.pending){clearTimeout(p.timer);p.reject(new Error(`Cursor ACP exited ${code}`));}this.pending.clear();});
    const init=await this.request('initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'ai-universal-coding-harness',version:VERSION}},60_000);this.capabilities=init?.agentCapabilities||init?.agent_capabilities||{};try{await this.request('authenticate',{methodId:'cursor_login'},60_000)}catch{}
    let ns:any=null;if(this.o.resumeSessionId&&(this.capabilities.loadSession===true||this.capabilities.load_session===true)){try{ns=await this.request('session/load',{sessionId:this.o.resumeSessionId,cwd:this.o.workspace,mcpServers:[]},60_000);this.id=this.o.resumeSessionId;this.o.events.emit('log',{level:'info',message:`Resumed executor session ${this.id}.`});}catch(e:any){appendBounded(this.o.runLog,`[executor session/load failed] ${e.message}`,CONFIG.RUN_LOG_MAX_BYTES);}}
    if(!this.id){ns=await this.request('session/new',{cwd:this.o.workspace,mcpServers:[]},60_000);this.id=ns.sessionId;}this.o.callbacks.onSessionId?.(this.id);
    const cfg=ns?.configOptions||ns?.config_options||[];const thinking=cfg.find((x:any)=>x.id==='thinking');if(thinking&&(thinking.options||[]).some((x:any)=>(x.value||x.id)===this.o.thinking)){try{await this.request('session/set_config_option',{sessionId:this.id,configId:'thinking',value:this.o.thinking},60_000);this.o.events.emit('log',{level:'info',message:`Executor thinking set to ${this.o.thinking}.`});}catch{}}
    this.replayHistoricalEvents();
  }
  async setMode(mode:'plan'|'agent'|'ask'){try{await this.request('session/set_mode',{sessionId:this.id,modeId:mode},60_000)}catch(e:any){this.o.events.emit('log',{level:'warn',message:`Unable to set executor mode ${mode}: ${e.message}`});}this.o.events.emit('executor.mode',{mode});}
  async prompt(text:string){this.agentText='';let r=await this.request('session/prompt',{sessionId:this.id,prompt:[{type:'text',text}]});let combined=this.agentText;let n=0;while(this.externalResults.length&&n<5){n++;const rs=this.externalResults.splice(0);this.agentText='';const note='The autonomous permission broker executed approved command(s) because ACP exposed no direct allow option. Use these exact results and continue without asking a human:\n\n'+rs.map(x=>`COMMAND: ${x.command}\nEXIT: ${x.code}\nOUTPUT:\n${x.output}`).join('\n\n');r=await this.request('session/prompt',{sessionId:this.id,prompt:[{type:'text',text:note}]});combined+='\n'+this.agentText;}return{result:r,text:combined};}
  async cancel(){if(this.child&&this.id)try{this.raw({jsonrpc:'2.0',method:'session/cancel',params:{sessionId:this.id}})}catch{}}
  async stop(){try{await this.cancel()}catch{};try{this.rl?.close()}catch{};try{this.er?.close()}catch{};try{this.child?.stdin?.end()}catch{};try{this.child?.kill('SIGTERM')}catch{};this.pending.clear();}
  private async handleLine(line:string){
    this.sequence++;
    fs.appendFileSync(this.o.eventsFile,`SERVER ${line}\n`);
    let m:any;
    try{m=JSON.parse(line)}catch{return}
    if(m.id!=null&&(Object.hasOwn(m,'result')||Object.hasOwn(m,'error'))){
      const p=this.pending.get(m.id);
      if(!p)return;
      clearTimeout(p.timer);
      this.pending.delete(m.id);
      m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);
      return;
    }
    if(m.method==='session/update'){
      const u=m.params?.update;
      if(u&&m.params?.sessionId&&!u.sessionId)u.sessionId=m.params.sessionId;
      this.renderUpdate(u);
      return;
    }
    if(m.method==='cursor/update_todos'){this.o.events.emit('executor.todos',{todos:m.params?.todos||[],merge:Boolean(m.params?.merge)});return;}
    if(m.method==='cursor/task'){this.o.events.emit('executor.task',{title:m.params?.title||'',summary:m.params?.summary||''});return;}
    if(m.method==='cursor/create_plan'){await this.handlePlan(m);return;}
    if(m.method==='cursor/ask_question'){await this.handleQuestion(m);return;}
    if(m.method==='session/request_permission'){await this.handlePermission(m);return;}
    if(m.id!=null)this.respond(m.id,{outcome:{outcome:'cancelled'}});
  }
  private appendFocus(text:string){if(!text)return;rotateFile(this.o.focusFile,CONFIG.FOCUS_LOG_MAX_BYTES);fs.appendFileSync(this.o.focusFile,text);this.o.events.emit('executor.focus.delta',{text,focus_file:this.o.focusFile});}
  private renderUpdate(u:any){if(!u)return;const t=u.sessionUpdate||u.type||'';if(t==='agent_message_chunk'){const text=u.content?.text||u.text||'';this.agentText+=text;this.o.events.emit('executor.message',{text,stream:true});return;}if(t==='agent_thought_chunk'||t==='agent_progress_chunk'){this.appendFocus(u.content?.text||u.text||'');return;}if(t==='tool_call'||t==='tool_call_update'||u.toolCallId||u.toolCall){this.processTool(u);return;}}
  processTool(u:any,emitEvent=true,isReplay=false){
    this.sequence++;
    const tc=u.toolCall||{};
    const id=u.toolCallId||tc.toolCallId||tc.id||u.id||`tool-${Date.now()}`;
    const sid=u.sessionId||tc.sessionId||this.id||'default';
    const compositeKey=`${sid}:${id}`;
    const prev=this.tools.get(compositeKey)||{};

    let title=u.title||tc.title||prev.title||'Tool';
    let kind=u.kind||tc.kind||prev.kind||'';

    const newRaw=tc.rawInput??u.rawInput;
    const raw=(newRaw&&typeof newRaw==='object'&&!Array.isArray(newRaw))
      ?{...(prev.rawInput||{}),...newRaw}
      :(newRaw!==undefined?newRaw:(prev.rawInput??{}));

    const newOut=tc.rawOutput??u.rawOutput;
    const out=(newOut&&typeof newOut==='object'&&!Array.isArray(newOut))
      ?{...(prev.rawOutput||{}),...newOut}
      :(newOut!==undefined?newOut:(prev.rawOutput??{}));

    let detail=prev.detail||'';
    let commandConfidence:'high'|'medium'|'low'=prev.commandConfidence||'low';

    if(raw?.command||raw?.cmd){
      title='Run';
      detail=String(raw.command||raw.cmd);
      commandConfidence='high';
    }else if(typeof raw==='string'&&raw.trim()){
      detail=raw.trim();
      commandConfidence='high';
    }else if(raw?.path||raw?.file){
      detail=String(raw.path||raw.file);
    }else if(raw?.pattern||raw?.query||raw?.glob){
      detail=String(raw.pattern||raw.query||raw.glob);
    }

    if(!detail&&title.startsWith('`')&&title.endsWith('`')){
      detail=title.slice(1,-1);
      title='Run';
      commandConfidence='low';
    }else if(!detail&&/^run\s+(.+)$/i.test(title)){
      const m=title.match(/^run\s+(.+)$/i);
      if(m&&m[1]){
        detail=m[1].replace(/^`|`$/g,'').trim();
        commandConfidence='low';
      }
    }

    const status=u.status||tc.status||prev.status||'in_progress';

    const titleLower=title.toLowerCase();
    const kindLower=kind.toLowerCase();
    const isMutation=['edit','write','delete','apply_patch','file_edit','file_write'].includes(kindLower)||
      /edit|write|delete|patch|unlink|rmdir/i.test(titleLower)||
      Boolean(raw?.path&&/edit|write|save/i.test(titleLower));
    if(isMutation){
      this.lastMutationSequence=this.sequence;
    }

    let exit:number|null=prev.exit_code??null;
    if(out&&typeof out==='object'){
      for(const k of ['exit_code','exitCode','code']){
        if(out[k]!=null&&Number.isFinite(Number(out[k]))){
          exit=Number(out[k]);
          break;
        }
      }
    }
    if(exit==null&&['failed','error'].includes(status)){
      exit=1;
    }

    const isExecution=title==='Run'||kind==='execute'||Boolean(raw?.command||raw?.cmd)||commandConfidence==='high';
    const row={id,sid,title:isExecution?'Run':title,kind,detail,status,exit_code:exit,rawInput:raw,rawOutput:out,commandConfidence,updatedAt:Date.now()};
    this.tools.set(compositeKey,row);

    if(emitEvent){
      this.o.events?.emit?.('executor.tool',{id,title:row.title,kind,detail,status,exit_code:exit,updatedAt:row.updatedAt});
    }

    if(isExecution&&detail&&['completed','failed','error','in_progress'].includes(status)){
      this.recordObserved({
        observation_id:`${sid}-${id}`,
        run_id:this.o.runId,
        stage:this.o.stageName,
        attempt:this.o.attempt,
        session_id:sid,
        tool_id:id,
        tool_call_id:id,
        sequence:this.sequence,
        timestamp:iso(),
        source:isReplay?'replay':'acp',
        command:detail,
        normalized_command:detail.trim().replace(/\s+/g,' '),
        command_confidence:commandConfidence,
        status:status as any,
        exit_code:exit,
        cwd:this.o.workspace,
        quality_epoch_id:this.qualityEpochId||undefined
      },isReplay);
    }
  }
  private async handlePlan(m:any){const p=m.params||{};const plan=String(p.plan||'').trim();this.o.events.emit('executor.plan.request',{name:p.name||'',overview:p.overview||''});if(!plan){this.respond(m.id,{outcome:{outcome:'rejected',reason:'Plan is empty. Submit a complete plan.'}});return;}try{const d=await this.o.callbacks.onPlan(plan,p);if(d.accepted){this.respond(m.id,{outcome:{outcome:'accepted'}});this.o.events.emit('reviewer.plan',{verdict:d.status||'APPROVE',summary:d.verdict?.summary||'Plan accepted.',feedback:d.carryover||''});}else{this.respond(m.id,{outcome:{outcome:'rejected',reason:`Revise the entire current plan and incorporate ALL consolidated feedback below in one revision:\n\n${d.feedback||''}`}});this.o.events.emit('reviewer.plan',{verdict:'REPLAN',summary:d.verdict?.summary||'',feedback:d.feedback||''});}}catch(e:any){this.respond(m.id,{outcome:{outcome:'rejected',reason:`Reviewer unavailable or plan review failed. Keep the current complete plan and resubmit once. Error: ${e.message}`}});}}
  private async handleQuestion(m:any){const p=m.params||{};this.o.events.emit('executor.question',{title:p.title||'',prompt:(p.questions||[]).map((q:any)=>q.prompt).join(' | '),questions:p.questions||[]});try{const a=await this.o.callbacks.onQuestion(p);this.respond(m.id,{outcome:{outcome:'answered',answers:a.answers}});this.o.events.emit('reviewer.question',{answer:a.answers.map(x=>x.selectedOptionIds.join(',')).join(' | '),rationale:a.rationale});}catch(e:any){this.respond(m.id,{outcome:{outcome:'cancelled'}});this.o.events.emit('log',{level:'warn',message:`Question could not be resolved automatically: ${e.message}`});}}
  private permissionRequest(p:any):PermissionRequest{const tc=p.toolCall||p.tool_call||{};const raw=tc.rawInput||tc.raw_input||p.rawInput||{};const command=raw.command||raw.cmd||p.command||'';const paths:string[]=[];for(const k of ['path','file','target','destination'])if(raw[k])paths.push(String(raw[k]));return{command:String(command||''),description:tc.title||p.description||'',paths,raw:p};}
  private pickOption(p:any,allow:boolean){const opts=p.options||[];const words=allow?['allow_once','allow_always','allow','approve']:['reject_once','deny','reject'];for(const o of opts){const kind=String(o.kind||o.name||o.optionId||'').toLowerCase();if(words.some(w=>kind.includes(w)))return o.optionId||o.id;}return null;}
  private async handlePermission(m:any){
    const p=m.params||{};
    const req=this.permissionRequest(p);
    this.o.events.emit('executor.permission',{summary:req.command||req.description||'permission request'});
    let decision:{allow:boolean;reason:string};
    try{decision=await this.o.callbacks.onPermission(req,p);}
    catch(e:any){decision={allow:false,reason:`Permission reviewer failed: ${e.message}. Denying this operation only; continue with another approach.`};}
    this.o.events.emit('reviewer.permission',{verdict:decision.allow?'ALLOW':'DENY',summary:decision.reason});
    let option=this.pickOption(p,decision.allow);
    if(!option&&decision.allow&&req.command){
      const denyOpt=this.pickOption(p,false);
      if(denyOpt){
        const r=await runShellCommand(req.command,{cwd:this.o.workspace,timeoutMs:20*60_000,onStdoutLine:(l:string)=>this.o.events.emit('log',{level:'info',message:`Command: ${l}`}),onStderrLine:(l:string)=>this.o.events.emit('log',{level:'warn',message:`Command: ${l}`})});
        this.externalResults.push({command:req.command,code:r.code,output:(r.stdout+r.stderr).slice(-20000)});
        this.sequence++;
        if(/git\s+(apply|checkout|restore|clean)|rm\s+|mv\s+|cp\s+|touch\s+|sed\s+/i.test(req.command)){
          this.lastMutationSequence=this.sequence;
        }
        const toolCallId=`broker-${Date.now()}-${Math.random().toString(16).slice(2,6)}`;
        this.recordObserved({
          observation_id:`${this.id||'broker'}-${toolCallId}`,
          run_id:this.o.runId,
          stage:this.o.stageName,
          attempt:this.o.attempt,
          session_id:this.id||'broker',
          tool_id:toolCallId,
          tool_call_id:toolCallId,
          sequence:this.sequence,
          timestamp:iso(),
          source:'broker',
          command:req.command,
          normalized_command:req.command.trim().replace(/\s+/g,' '),
          command_confidence:'high',
          status:r.code===0?'completed':'failed',
          exit_code:r.code,
          cwd:this.o.workspace,
          quality_epoch_id:this.qualityEpochId||undefined
        });
        this.respond(m.id,{outcome:{outcome:'selected',optionId:denyOpt}});
        return;
      }
    }
    if(option)this.respond(m.id,{outcome:{outcome:'selected',optionId:option}});else this.respond(m.id,{outcome:{outcome:'cancelled'}});
  }
}

export function parseAcpEvents(
  eventsFilePath: string,
  opts?: { runId?: string; stageName?: string; attempt?: number; workspace?: string }
): CommandObservation[] {
  if (!fs.existsSync(eventsFilePath)) return [];
  const content = fs.readFileSync(eventsFilePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const tools = new Map<string, any>();
  const observed: CommandObservation[] = [];
  let sequence = 0;

  for (const line of lines) {
    if (!line.startsWith('SERVER ')) continue;
    let m: any;
    try { m = JSON.parse(line.slice(7)); } catch { continue; }
    sequence++;
    if (m.method === 'session/update') {
      const u = m.params?.update;
      if (!u || !(u.sessionUpdate === 'tool_call' || u.sessionUpdate === 'tool_call_update' || u.toolCallId || u.toolCall)) {
        continue;
      }
      const sid = m.params?.sessionId || u.sessionId || 'default';
      const tc = u.toolCall || {};
      const id = u.toolCallId || tc.toolCallId || tc.id || u.id || `tool-${sequence}`;
      const compositeKey = `${sid}:${id}`;
      const prev = tools.get(compositeKey) || {};

      let title = u.title || tc.title || prev.title || 'Tool';
      let kind = u.kind || tc.kind || prev.kind || '';

      const newRaw = tc.rawInput ?? u.rawInput;
      const raw = (newRaw && typeof newRaw === 'object' && !Array.isArray(newRaw))
        ? { ...(prev.rawInput || {}), ...newRaw }
        : (newRaw !== undefined ? newRaw : (prev.rawInput ?? {}));

      const newOut = tc.rawOutput ?? u.rawOutput;
      const out = (newOut && typeof newOut === 'object' && !Array.isArray(newOut))
        ? { ...(prev.rawOutput || {}), ...newOut }
        : (newOut !== undefined ? newOut : (prev.rawOutput ?? {}));

      let detail = prev.detail || '';
      let commandConfidence: 'high' | 'medium' | 'low' = prev.commandConfidence || 'low';

      if (raw?.command || raw?.cmd) {
        title = 'Run';
        detail = String(raw.command || raw.cmd);
        commandConfidence = 'high';
      } else if (typeof raw === 'string' && raw.trim()) {
        detail = raw.trim();
        commandConfidence = 'high';
      } else if (raw?.path || raw?.file) {
        detail = String(raw.path || raw.file);
      } else if (raw?.pattern || raw?.query || raw?.glob) {
        detail = String(raw.pattern || raw.query || raw.glob);
      }

      if (!detail && title.startsWith('`') && title.endsWith('`')) {
        detail = title.slice(1, -1);
        title = 'Run';
        commandConfidence = 'low';
      } else if (!detail && /^run\s+(.+)$/i.test(title)) {
        const match = title.match(/^run\s+(.+)$/i);
        if (match && match[1]) {
          detail = match[1].replace(/^`|`$/g, '').trim();
          commandConfidence = 'low';
        }
      }

      const status = u.status || tc.status || prev.status || 'in_progress';

      let exit: number | null = prev.exit_code ?? null;
      if (out && typeof out === 'object') {
        for (const k of ['exit_code', 'exitCode', 'code']) {
          if (out[k] != null && Number.isFinite(Number(out[k]))) {
            exit = Number(out[k]);
            break;
          }
        }
      }
      if (exit == null && ['failed', 'error'].includes(status)) {
        exit = 1;
      }

      const isExecution = title === 'Run' || kind === 'execute' || Boolean(raw?.command || raw?.cmd) || commandConfidence === 'high';
      const row = { id, sid, title: isExecution ? 'Run' : title, kind, detail, status, exit_code: exit, rawInput: raw, rawOutput: out, commandConfidence, updatedAt: Date.now() };
      tools.set(compositeKey, row);

      if (isExecution && detail && ['completed', 'failed', 'error', 'in_progress'].includes(status)) {
        const obs: CommandObservation = {
          observation_id: `${sid}-${id}`,
          run_id: opts?.runId,
          stage: opts?.stageName,
          attempt: opts?.attempt,
          session_id: sid,
          tool_id: id,
          tool_call_id: id,
          sequence,
          timestamp: iso(),
          source: 'replay',
          command: detail,
          normalized_command: detail.trim().replace(/\s+/g, ' '),
          command_confidence: commandConfidence,
          status: status as any,
          exit_code: exit,
          cwd: opts?.workspace
        };
        const idx = observed.findIndex(x => x.tool_call_id === obs.tool_call_id && x.session_id === obs.session_id);
        if (idx >= 0) {
          observed[idx] = {
            ...observed[idx],
            ...obs,
            exit_code: obs.exit_code ?? observed[idx].exit_code,
            status: obs.status || observed[idx].status,
            sequence: obs.sequence || observed[idx].sequence
          };
        } else {
          observed.push(obs);
        }
      }
    }
  }

  return observed;
}
