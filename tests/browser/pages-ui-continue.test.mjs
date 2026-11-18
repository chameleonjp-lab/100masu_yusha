import test from 'node:test';
import assert from 'node:assert/strict';
import {runUiContinue} from './pages-ui-continue.mjs';
const saved=()=>({status:'ok',run:{runId:'r',pos:4,revision:2},meta:{settings:{language:'ja'}},view:{pos:4,actions:[{type:'roll',enabled:true}]}});
function fixture({before=saved(),mutate=false,missing=false,disabled=false}={}){let clicked=false;const calls=[];return {before,calls,readSnapshot:async()=>{const x=structuredClone(before);if(clicked&&mutate)x.run.revision++;return x},page:{getByRole(role,options){calls.push({role,...options});return {async waitFor(){if(missing)throw Error('missing UI')},async isEnabled(){return !disabled},async click(){clicked=true},async textContent(){return `${before.run.pos} / 100`}}}}};}
test('continues via exact saved-position UI and checks chapter plus unchanged state',async()=>{const f=fixture();const result=await runUiContinue(f);assert.deepEqual(result,{position:4,runId:'r',revision:2,uiContinue:true,savedStateUnchanged:true});assert.deepEqual(f.calls,[{role:'button',name:'4マスから続きを遊ぶ',exact:true},{role:'heading',level:1,name:'4 / 100',exact:true}]);});
test('rejects mutated persisted state after continuation',async()=>{await assert.rejects(runUiContinue(fixture({mutate:true})),/changed/)});
test('rejects missing continue control',async()=>{await assert.rejects(runUiContinue(fixture({missing:true})),/missing UI/)});
test('rejects disabled continue control',async()=>{await assert.rejects(runUiContinue(fixture({disabled:true})),/disabled/)});
for(const before of [null,{run:null}, {...saved(),run:{runId:'r',pos:101,revision:2}},{...saved(),view:{pos:3,actions:[]}}])test(`rejects invalid snapshot ${JSON.stringify(before)}`,async()=>{const f=fixture({before});await assert.rejects(runUiContinue(f));assert.equal(f.calls.length,0)});
