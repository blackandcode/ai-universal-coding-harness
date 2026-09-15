import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyEvidenceAgainstObserved} from './EvidenceVerifier.js';
const evidence:any={stage:'s',attempt:1,status:'PASS',quality_command:'npm run check',quality_exit_code:0,git_diff_check_exit_code:0,focused_tests:[],quality_summary:'ok',changed_files:[],unresolved:[]};
test('matching ACP command exits corroborate evidence',()=>{const r=verifyEvidenceAgainstObserved(evidence,[{command:'npm run check',exit_code:0,status:'completed',tool_id:'1'},{command:'git diff --check',exit_code:0,status:'completed',tool_id:'2'}]);assert.equal(r.ok,true);});
test('fabricated green evidence is rejected',()=>{const r=verifyEvidenceAgainstObserved(evidence,[{command:'npm run check',exit_code:1,status:'completed',tool_id:'1'},{command:'git diff --check',exit_code:0,status:'completed',tool_id:'2'}]);assert.equal(r.ok,false);assert.match(r.issues.join(' '),/mismatch/i);});
