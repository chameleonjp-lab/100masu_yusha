import test from 'node:test';import assert from 'node:assert/strict';
import * as module from '../../src/ui/saved-result-receipt.js';
import {createMeta,applyRunToMeta} from '../../src/engine/index.js';
import {getContent,exampleRun,place,walk} from '../fixtures/helpers.mjs';
import {dispatch} from '../../src/engine/index.js';
import {createMemoryStore} from '../../src/save/index.js';import {createSession} from '../../src/ui/session.js';
const validate=x=>module.validateSavedResultReceipt?.(x)??null;
const c=await getContent(),cl=structuredClone;
async function fixture(meta=createMeta()){
 const run=dispatch(c,walk(c,place(exampleRun(c),99,{level:20,xp:912,hp:78,mp:48,bag:[]}),1).state,{type:'challengeKing'}).state;run.battle.enemy.hp=4;
 const store=createMemoryStore();await store.startNew({run,meta});const s=createSession(c,store);await s.load();await s.act({type:'attack'});
 if(s.view.phase==='bagFull')await s.act({type:'bagDecline'});
 const beforeRun=cl(s.run),beforeMeta=cl(s.meta),effects=await s.act({type:'continue'});
 return {beforeRun,beforeMeta,afterRun:cl(s.run),afterMeta:cl(s.meta),status:s.status,effects};
}
function remeta(f,m){f.beforeMeta=m;f.afterMeta=applyRunToMeta(m,f.afterRun).meta;f.afterMeta.uiLastResult={runId:f.afterRun.runId,revision:f.afterRun.revision,effects:cl(f.effects)};return f;}
test('real memory commit result yields detached all-best receipt without mutation',async()=>{const f=await fixture(),before=cl(f),r=validate(f);assert.ok(r);assert.equal(r.newBest,true);assert.equal(r.recorded,true);assert.equal(r.key,`${f.afterRun.runId}:${f.afterRun.revision}`);assert.deepEqual(r.result,f.afterRun.result);r.result.rolls++;assert.deepEqual(f,before);});
for(const [name,alter,expected] of [
 ['route only',m=>m.bests.all={defeated:true,furthest:100,rolls:0},false],
 ['tie', (m,f)=>m.bests.all=cl(f.afterRun.result),false],
 ['already recorded',(m,f)=>m.recordedRuns.push(f.afterRun.runId),false],
])test(name+' is not all-best',async()=>{const f=await fixture(),m=cl(f.beforeMeta);alter(m,f);const r=validate(remeta(f,m));assert.ok(r);assert.equal(r.newBest,expected);if(name==='already recorded')assert.equal(r.recorded,false);});
test('multiple discoveries use engine merge and detached count',async()=>{const f=await fixture(),m=cl(f.beforeMeta);m.dex={enemies:[],companions:[],gear:[]};const r=validate(remeta(f,m));assert.ok(r);assert.ok(r.discoveryCount>0);assert.equal(r.discoveryCount,Object.values(r.discoveries).flat().length);r.discoveries.enemies.push('BAD');assert.equal(f.afterMeta.dex.enemies.includes('BAD'),false);});
for(const [name,mutate] of Object.entries({
 status:f=>f.status='missing',empty:f=>f.effects=[],effect:f=>f.effects[0].extra=true,
 run:f=>f.afterRun.runId+='x',revision:f=>f.afterRun.revision++,metaRun:f=>f.afterMeta.uiLastResult.runId+='x',
 metaRev:f=>f.afterMeta.uiLastResult.revision--,settings:f=>f.afterMeta.settings.sound=false,dex:f=>f.afterMeta.dex.enemies.push('unknown'),
 unknown:f=>f.afterMeta.extra=true,version:f=>f.beforeMeta.metaVersion=99,
 discoveryDuplicate:f=>f.afterRun.discovered.enemies.push(f.afterRun.discovered.enemies[0]),
 badResult:f=>f.afterRun.result.runId='alien',badBefore:f=>f.beforeRun=null,
}))test('rejects '+name,async()=>{const f=await fixture();mutate(f);assert.equal(validate(f),null);});
test('reload/same revision does not manufacture evidence',async()=>{const f=await fixture();f.beforeRun=cl(f.afterRun);f.beforeMeta=cl(f.afterMeta);assert.equal(validate(f),null);});
test('plain JSON key order is not relevant',async()=>{const f=await fixture();f.afterMeta=Object.fromEntries(Object.entries(f.afterMeta).reverse());assert.ok(validate(f));});
test('rejects undefined, cyclic and non-JSON evidence without throwing',async()=>{assert.equal(validate(),null);const f=await fixture();f.afterMeta.cycle=f.afterMeta;assert.equal(validate(f),null);const g=await fixture();g.afterMeta.settings.x=undefined;assert.equal(validate(g),null);});
test('real nonterminal act can prove discoveries without a result',async()=>{
 const run=exampleRun(c),meta=createMeta(),store=createMemoryStore();await store.startNew({run,meta});const s=createSession(c,store);await s.load();
 const beforeRun=cl(s.run),beforeMeta=cl(s.meta),effects=await s.act({type:'roll'});
 const r=validate({beforeRun,beforeMeta,afterRun:cl(s.run),afterMeta:cl(s.meta),status:s.status,effects});assert.ok(r);assert.equal(r.recorded,false);assert.equal(r.newBest,false);assert.equal(r.result,null);
});
for(const mode of ['commit abort','readback failure'])test(mode+' does not yield proof',async()=>{
 const store=createMemoryStore();await store.startNew({run:exampleRun(c),meta:createMeta()});let enabled=false;
 const proxy={...store,commit:async p=>{if(enabled&&mode==='commit abort')throw Error('quota');return store.commit(p);},load:async()=>{if(enabled&&mode==='readback failure')throw Error('read');return store.load();}};
 const s=createSession(c,proxy);await s.load();const beforeRun=cl(s.run),beforeMeta=cl(s.meta);enabled=true;
 await assert.rejects(s.act({type:'roll'}));assert.equal(validate({beforeRun,beforeMeta,afterRun:cl(s.run),afterMeta:cl(s.meta),status:s.status,effects:[]}),null);
});
test('runFinished effect must describe the actual recorded result',async()=>{const f=await fixture();f.effects[0].result.rolls++;f.afterMeta.uiLastResult.effects=cl(f.effects);assert.equal(validate(f),null);});
for(const bad of [null,{},'bad',42,{t:''}])test('reject invalid effect shape '+JSON.stringify(bad),async()=>{const f=await fixture();f.effects.push(bad);f.afterMeta.uiLastResult.effects=cl(f.effects);assert.equal(validate(f),null);});
test('rejects sparse array disguised by named key',async()=>{const f=await fixture();const bad=Array(1);bad.extra=true;f.afterMeta.settings.test=bad;f.beforeMeta.settings.test=bad;assert.equal(validate(f),null);});
for(const kind of ['changed','removed'])test('terminal result cannot '+kind,async()=>{const f=await fixture();f.beforeRun.result=cl(f.afterRun.result);if(kind==='changed')f.beforeRun.result.rolls++;else f.afterRun.result=null;assert.equal(validate(f),null);});
