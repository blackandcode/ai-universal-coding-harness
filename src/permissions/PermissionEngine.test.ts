import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PermissionEngine} from './PermissionEngine.js';

test('auto_safe permits routine quality commands with no reviewer dependency',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'orch-perm-'));const file=path.join(root,'p.jsonc');fs.writeFileSync(file,'{"terminalAllowlist":[]}');const e=new PermissionEngine(root,'auto_safe',file);const d=e.deterministic({command:'npm run check',raw:{}});assert.equal(d?.allow,true);assert.match(d?.source||'',/safe|allow/i);});
test('hard dangerous commands are denied even in allow_all',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'orch-perm-'));const file=path.join(root,'p.jsonc');fs.writeFileSync(file,'{"terminalAllowlist":[]}');const e=new PermissionEngine(root,'allow_all',file);const d=e.deterministic({command:'git reset --hard HEAD~1',raw:{}});assert.equal(d?.allow,false);});
test('workspace file writes outside repository are denied',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'orch-perm-'));const file=path.join(root,'p.jsonc');fs.writeFileSync(file,'{"terminalAllowlist":[]}');const e=new PermissionEngine(root,'allow_all',file);const d=e.deterministic({description:'write file',paths:['../outside.txt'],raw:{}});assert.equal(d?.allow,false);});

test('auto_safe does not treat broad package executors as universally safe',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'orch-perm-'));
  const file=path.join(root,'p.json'); fs.writeFileSync(file,'{"terminalAllowlist":[]}');
  const e=new PermissionEngine(root,'auto_safe',file);
  assert.equal(e.deterministic({command:'npm install unknown-package',raw:{}}),null);
  assert.equal(e.deterministic({command:'node -e "require(\\\"fs\\\").rmSync(\\\"src\\\",{recursive:true})"',raw:{}}),null);
});
