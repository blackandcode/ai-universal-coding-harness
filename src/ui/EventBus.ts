import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {appendBounded,ensureDir} from '../core/fs.js';
import {iso} from '../core/time.js';
import {UiEvent} from '../types.js';

export class EventBus {
  emitter=new EventEmitter(); private tools=new Map<string,UiEvent>(); private focus=''; private focusFile=''; private timer:any=null;
  constructor(public eventFile:string,public lineMode=false,private maxBytes=20*1024*1024,private delay=80){ ensureDir(path.dirname(eventFile)); if(!fs.existsSync(eventFile)) fs.writeFileSync(eventFile,''); }
  emit(type:string,payload:any={}){ const e:UiEvent={ts:iso(),type,payload}; if(type==='executor.tool'){this.tools.set(payload?.id||payload?.toolCallId||String(Math.random()),e);this.schedule();return e;} if(type==='executor.focus.delta'){this.focus+=String(payload?.text||'');this.focusFile=payload?.focus_file||this.focusFile;this.schedule();return e;} this.flush();this.write(e);return e; }
  private schedule(){if(!this.timer)this.timer=setTimeout(()=>this.flush(),this.delay);}
  flush(){if(this.timer){clearTimeout(this.timer);this.timer=null;}if(this.focus){this.write({ts:iso(),type:'executor.focus.delta',payload:{text:this.focus,focus_file:this.focusFile}});this.focus='';}for(const e of this.tools.values())this.write(e);this.tools.clear();}
  close(){this.flush();this.emitter.removeAllListeners();}
  private write(e:UiEvent){appendBounded(this.eventFile,JSON.stringify(e),this.maxBytes);this.emitter.emit('event',e);if(this.lineMode){const line=this.line(e);if(line)console.log(line);}}
  private line(e:UiEvent){const p=e.payload||{};const map:any={
    'run.started':()=>`▶ Run ${p.run_id||''} · ${p.branch||''}`,'run.completed':()=>`✓ Run completed · ${p.branch||''}`,'run.blocked':()=>`✗ Run ${p.status||'stopped'} · ${p.reason||''}`,
    'stage.started':()=>`▶ ${p.stage||'Stage'} started`,'stage.completed':()=>`✓ ${p.stage||'Stage'} completed`,'stage.committed':()=>`✓ Commit ${p.stage||''} · ${p.sha||''}`,
    'executor.message':()=>`⚡ ${String(p.text||'').replace(/\s+/g,' ').trim()}`,'reviewer.plan':()=>`🧠 Plan ${p.verdict||''}: ${p.summary||''}`,'reviewer.permission':()=>`🧠 Permission ${p.verdict||''}: ${p.summary||''}`,'reviewer.question':()=>`🧠 Answer: ${p.answer||''}`,
    'quality.result':()=>`${p.status==='PASS'?'✓':'✗'} Quality ${p.status||''}: ${p.summary||p.quality_summary||''}`,'review.result':()=>`🧠 Final review ${p.verdict||''}: ${p.summary||''}`,'log':()=>`${p.level==='error'?'✗':p.level==='warn'?'!':'·'} ${p.message||''}`};return map[e.type]?.()||'';}
}
