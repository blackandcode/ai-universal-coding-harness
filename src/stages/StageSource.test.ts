import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {StageSource} from './StageSource.js';

function fixture(valid=true){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-harness-stage-test-'));
  const stage=path.join(root,'stage-06-example-feature');fs.mkdirSync(stage,{recursive:true});
  fs.writeFileSync(path.join(stage,'functional-spec.md'),'# Functional Specification\n\n## Acceptance Criteria\n- Works.\n');
  fs.writeFileSync(path.join(stage,'technical-spec.md'),'# Technical Specification\n\nImplementation details.\n');
  fs.writeFileSync(path.join(stage,'prompt.md'),valid?'# Implementation Prompt\n\nImplement the specification.\n':'no markdown heading here');
  return{root,stage};
}

test('validates a structured stage package',()=>{
  const f=fixture();const src=new StageSource(f.root);try{const dir=src.resolve('06');assert.equal(dir,f.stage);assert.equal(src.validateDir(dir).valid,true);}finally{src.close();fs.rmSync(f.root,{recursive:true,force:true});}
});

test('rejects stage files without required markdown structure',()=>{
  const f=fixture(false);const src=new StageSource(f.root);try{assert.throws(()=>src.resolve('06'),/prompt\.md must contain at least one Markdown heading/);}finally{src.close();fs.rmSync(f.root,{recursive:true,force:true});}
});
