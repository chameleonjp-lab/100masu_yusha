import test from 'node:test';import assert from 'node:assert/strict';
import {runNativeScenarios,nativeStorageAction} from './pages-native-storage.mjs';
const key='__native_probe_'+'a'.repeat(32);
// Orchestrator contract double only. It cannot establish native IndexedDB behavior.
function fixture(fault){let value=0;const calls=[];return {calls,async execute(tab,action,k){calls.push({tab,action,key:k});
 if(action==='game')return [{run:{runId:'r',revision:2}}, {meta:{revision:1}}];
 if(action==='initialize'){value=0;return [0,0,0];}
 if(action==='increment'){value++;return value;}
 if(action==='read')return [value,value,value];
 if(action==='abort')return {aborted:fault!=='no-abort',before:[value,value,value],after:fault==='partial'?[value+1,value,value]:[value,value,value]};
 }};}
test('orchestrates two pages, all three stores, abort and untouched game records',async()=>{const f=fixture();const r=await runNativeScenarios(f.execute,key);assert.deepEqual(r,{twoConnectionAtomicIncrement:2,abortAllStores:true,gameRecordsUnchanged:true});assert.ok(f.calls.some(c=>c.tab===1&&c.action==='increment'));assert.ok(f.calls.some(c=>c.tab===0&&c.action==='increment'));assert.ok(f.calls.every(c=>c.key===key));});
for(const fault of ['no-abort','partial'])test(`rejects ${fault} instead of reporting native success`,async()=>{const f=fixture(fault);await assert.rejects(runNativeScenarios(f.execute,key));});
test('invalid probe keys are rejected before invoking storage',async()=>{for(const k of ['current','meta','__native_probe_x','../current']){let calls=0;await assert.rejects(runNativeScenarios(async()=>calls++,k));assert.equal(calls,0);}});
test('browser action rejects unexpected database destinations before any import',async()=>{await assert.rejects(nativeStorageAction({base:'https://example.com/',key,action:'game'}));await assert.rejects(nativeStorageAction({base:'http://localhost:8123/',key:'current',action:'read'}));});
import {verifyResumedState} from './pages-native-storage.mjs';
test('semantic resume rejects lost run, changed revision or changed next actions',()=>{const s={status:'ok',run:{runId:'r',revision:2},meta:{settings:{}},view:{phase:'rolled',actions:[{type:'move'}]}};assert.doesNotThrow(()=>verifyResumedState(s,structuredClone(s)));for(const next of [{...s,run:null},{...s,run:{runId:'r',revision:3}},{...s,view:{phase:'rolled',actions:[]}}])assert.throws(()=>verifyResumedState(s,next));});
