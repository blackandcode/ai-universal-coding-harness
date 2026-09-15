import {GitRepository} from './GitRepository.js';
import {RunState} from '../types.js';
import {iso} from '../core/time.js';

export class BranchManager {
  constructor(private git:GitRepository, private save:(state:RunState)=>void){}
  reconcile(state:RunState){
    const exists=this.git.branchExists(state.branch); const current=this.git.currentBranch();
    if(exists&&!state.branch_created){ state.branch_created=true; state.branch_created_at=state.branch_created_at||iso(); }
    if(!state.pre_run_stash){ const found=this.git.findStash(`ai-orchestrator-pre-run-${state.run_id}`); if(found) state.pre_run_stash={label:`ai-orchestrator-pre-run-${state.run_id}`,commit:found}; }
    if(state.branch_created&&current!==state.branch){ if(this.git.isDirty()){ const label=`ai-orchestrator-resume-${state.run_id}`; const commit=this.git.stash(label); if(commit&&!state.pre_run_stash) state.pre_run_stash={label,commit}; } this.git.switch(state.branch); }
    this.save(state);
  }
  ensureCreated(state:RunState){
    this.reconcile(state);
    if(state.branch_created) return;
    if(this.git.isDirty()){ const label=`ai-orchestrator-pre-run-${state.run_id}`; const commit=this.git.stash(label); if(commit) state.pre_run_stash={label,commit}; }
    if(this.git.branchExists(state.branch)) this.git.switch(state.branch); else this.git.createBranch(state.branch,state.base_commit);
    state.branch_created=true; state.branch_created_at=iso(); this.save(state);
  }
  assertActive(state:RunState){ const current=this.git.currentBranch(); if(current===state.branch) return; if(this.git.isDirty()) throw new Error(`Repository left AI branch ${state.branch} while working tree is dirty (currently ${current||'detached'}).`); this.git.switch(state.branch); }
}
