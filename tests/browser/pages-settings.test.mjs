import test from 'node:test';import assert from 'node:assert/strict';import {runSettingsPersistence,collectPageErrors} from './pages-settings.mjs';
function fixture(mutate=null,{label='演出の長さ標準の演出短い演出',matches=1,control=['SELECT',['standard','short']]}={}){const before={run:{runId:'r',revision:2,pos:4},meta:{settings:{},bests:{M:2},dex:{enemies:['e']},recordedRuns:['old']},view:{pos:4}};let saved=false,value='standard',reloads=0;const select={selectOption:async v=>value=v,inputValue:async()=>value,count:async()=>matches,evaluate:async()=>control};const dialog={waitFor:async()=>{},getByLabel:(selector,{exact=false}={})=>{
 const match=selector instanceof RegExp?selector.test(label):exact?label===selector:label.includes(selector);
 assert.ok(match,'Control label includes its option text');return select;
 },getByRole:(_,o)=>({click:async()=>{if(o.name==='設定を保存')saved=true}})};return {before,page:{getByRole:(role)=>role==='dialog'?dialog:{click:async()=>{}},reload:async()=>reloads++,locator:()=>({waitFor:async()=>{}})},readSnapshot:async()=>{const x=structuredClone(before);if(saved)x.meta.settings={language:'ja',animation:value,reducedMotion:false,mute:false,masterVolume:.8,bgmVolume:.5,seVolume:.8};if(saved&&mutate)mutate(x);return x},reloads:()=>reloads};}
test('settings UI changes only animation plus explicit existing UI defaults, persists after reload',async()=>{const f=fixture(),r=await runSettingsPersistence(f);assert.equal(r.settingsPersisted,true);assert.equal(r.runUnchanged,true);assert.equal(r.animation,'short');assert.equal(f.reloads(),1)});
test('rejects missing or ambiguous controls before changing a setting',async()=>{
 for(const matches of [0,2])await assert.rejects(runSettingsPersistence(fixture(null,{matches})),/Unique animation setting required/);
});
test('rejects a wrongly associated control or unexpected option values',async()=>{
 for(const control of [['INPUT',[]],['SELECT',['ja','en']]])await assert.rejects(runSettingsPersistence(fixture(null,{control})),/Unexpected animation setting control/);
});
for(const [name,mutate] of [['run',x=>x.run.revision++],['bests',x=>x.meta.bests={}],['unrelated setting',x=>x.meta.settings.language='en']])test('rejects unexpected '+name+' change',async()=>{await assert.rejects(runSettingsPersistence(fixture(mutate)))});
test('console/page errors recorded by kind without saved messages',()=>{const handlers={},errors=[];collectPageErrors({on:(event,fn)=>handlers[event]=fn},errors);handlers.console({type:()=> 'log',text:()=> 'private'});handlers.console({type:()=> 'error',text:()=> 'private saved content'});handlers.pageerror(Error('private run'));assert.deepEqual(errors,[{kind:'console.error'},{kind:'pageerror'}]);});
