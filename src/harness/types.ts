import {ExecutionEvidence,FinalVerdict,PermissionVerdict,PlanReviewVerdict,QuestionVerdict,CommandObservation} from '../types.js';
import {PermissionRequest} from '../permissions/PermissionEngine.js';

export interface HarnessInfo { id:string; label:string; role:'executor'|'reviewer'; model:string; }
export interface HarnessPreflightResult { ok:boolean; details:string[]; }

export interface PlanDecision {
  accepted:boolean;
  feedback?:string;
  status?:string;
  carryover?:string;
  verdict?:PlanReviewVerdict;
}

export interface ExecutorSessionCallbacks {
  onPlan:(plan:string,metadata:any)=>Promise<PlanDecision>;
  onQuestion:(payload:any)=>Promise<{answers:Array<{questionId:string;selectedOptionIds:string[]}>; rationale:string}>;
  onPermission:(request:PermissionRequest,payload:any)=>Promise<{allow:boolean;reason:string}>;
  onSessionId?:(id:string)=>void;
}

export interface ExecutorSession {
  id:string;
  setMode(mode:'plan'|'agent'|'ask'):Promise<void>;
  prompt(text:string):Promise<{text:string;result:any}>;
  stop():Promise<void>;
  cancel?():Promise<void>;
  observedCommands():CommandObservation[];
  currentSequence?():number;
  lastMutationSeq?():number;
  setQualityEpoch?(epochId:string):void;
}

export interface ExecutorHarness {
  info:HarnessInfo;
  preflight():Promise<HarnessPreflightResult>;
  createSession(opts:{workspace:string;runLog:string;eventsFile:string;focusFile:string;resumeSessionId?:string;callbacks:ExecutorSessionCallbacks}):Promise<ExecutorSession>;
}

export interface ReviewerHarness {
  info:HarnessInfo;
  preflight():Promise<HarnessPreflightResult>;
  reviewPlan(input:any,opts?:{finalConsolidation?:boolean}):Promise<PlanReviewVerdict>;
  answerQuestions(input:any):Promise<QuestionVerdict>;
  decidePermission(input:any):Promise<PermissionVerdict>;
  reviewImplementation(input:any):Promise<FinalVerdict>;
}

export type ExecutorHarnessFactory=(context:any)=>ExecutorHarness;
export type ReviewerHarnessFactory=(context:any)=>ReviewerHarness;
