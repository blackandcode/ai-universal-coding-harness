import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardLayout} from './layout.js';
for(const [rows,expected] of [[10,'minimal'],[15,'minimal'],[16,'compact'],[23,'compact'],[24,'normal'],[40,'normal']] as const){
  test(`dashboard layout ${rows} rows`,()=>{const l=dashboardLayout(rows,26);assert.equal(l.mode,expected);assert.ok(l.maxRows<=rows-2);});
}
test('configured max is respected',()=>{assert.equal(dashboardLayout(60,22).maxRows,22)});
