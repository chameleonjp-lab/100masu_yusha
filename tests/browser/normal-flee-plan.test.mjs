import test from 'node:test';import assert from 'node:assert/strict';
import {getContent,exampleRun,startBattle} from '../fixtures/helpers.mjs';
import {createMeta} from '../../src/engine/index.js';import {createSession} from '../../src/ui/session.js';import {createMemoryStore} from '../../src/save/index.js';
import {planPresentation,createPresentationPlayer} from '../../src/ui/presentation-timeline.js';
const c=await getContent();
async function fixture({die=3,action={type:'flee'},bag=[],hp=25,mp=10,companions=[]}={}){
 const q=startBattle(c,exampleRun(c,'M'),'EN09',{die,patch:{hp,mp,bag,companions}}),store=createMemoryStore();
 await store.startNew({run:q.state,meta:createMeta()});const s=createSession(q.content,store);await s.load();
 const before=structuredClone(s.view),effects=await s.act(action),after=structuredClone(s.view);
 return {before,after,effects,store};
}
const p=(f,o={})=>planPresentation({...f,battleVisual:true,battleGuardVisual:true,battleFleeVisual:true,...o});
for(const [settings,duration,motion] of [[{},500,'retreat'],[{animation:'short'},200,'retreat'],[{reducedMotion:true},150,'fade']])test('real committed normal flee '+JSON.stringify(settings),async()=>{
 const f=await fixture(),stored=await f.store.load(),input=structuredClone({before:f.before,after:f.after,effects:f.effects}),r=p(f,{settings});
 assert.deepEqual(f.effects,[{t:'fled',enemyId:'EN09'}]);assert.equal(f.after.phase,'board');assert.equal(r.mode,'battle-flee');assert.equal(r.durationMs,duration);
 assert.deepEqual(r.steps.map(s=>[s.kind,s.payload.stage??s.payload.cue??s.payload.enabled]),[['controls',false],['sound','flee'],['display','battle.flee.departure'],['display','battle.flee.result'],['controls',true]]);
 const [,cue,depart,result,controls]=r.steps;
 assert.equal(cue.atMs,0);assert.equal(cue.payload.role,'committed');assert.equal(depart.payload.motion,motion);assert.deepEqual([cue,depart,result].map(s=>s.payload.effectIndex),[0,0,0]);
 assert.equal(result.atMs,duration);assert.equal(controls.atMs,duration);assert.equal(result.payload.reward,false);
 assert.deepEqual(r.resultEffects,f.effects);assert.deepEqual(r.finalView,f.after);assert.deepEqual(await f.store.load(),stored);
 assert.deepEqual({before:f.before,after:f.after,effects:f.effects},input);
 assert.ok(Object.isFrozen(r.resultEffects[0]));assert.notEqual(r.resultEffects[0],f.effects[0]);
});
test('opt-in is double literal and leaves guard integration untouched',async()=>{
 const f=await fixture();for(const key of ['battleVisual','battleFleeVisual'])assert.deepEqual(p(f,{[key]:false}).steps,[]);
 const g=await fixture({action:{type:'guard'}});assert.equal(p(g).mode,'battle-guard');assert.deepEqual(p(g),p(g,{battleFleeVisual:false}));
});
for(const [hp,mp] of [[25,2],[39,9],[40,10]])test('HE20 committed heal then flee '+hp+'/'+mp,async()=>{
 const f=await fixture({action:{type:'flee',itemId:'HE20'},bag:['HE01','HE20','HE20'],hp,mp}),r=p(f);
 assert.equal(r.mode,'battle-flee');assert.equal(r.steps.filter(s=>s.kind==='sound').length,1);
 assert.equal(r.steps.find(s=>s.kind==='sound').payload.effectIndex,f.effects.length-1);
 assert.deepEqual(f.after.hero.bag.items.map(x=>[x.id,x.index]),[['HE01',0],['HE20',1]]);
 assert.equal(f.after.hero.bag.free,f.before.hero.bag.free+1);
 assert.equal(f.after.hero.hp,Math.min(40,hp+12));assert.equal(f.after.hero.mp,Math.min(10,mp+3));
 for(const k of ['gold','xp','level','attack','defense'])assert.equal(f.after.hero[k],f.before.hero[k]);
 assert.equal(f.after.pos,f.before.pos);assert.equal(f.after.reward,null);
 assert.deepEqual(r.resultEffects,f.effects);assert.deepEqual(r.finalView,f.after);
});
for(const [name,mutate] of Object.entries({extra:f=>f.effects.splice(1,0,{t:'future'}),wrongItem:f=>f.effects[0].id='HE01',order:f=>f.effects.reverse(),wrongDelta:f=>f.effects[1].delta++,wrongFree:f=>f.after.hero.bag.free++,wrongBag:f=>f.after.hero.bag.items.reverse(),gold:f=>f.after.hero.gold++}))test('HE20 static '+name,async()=>{
 const f=await fixture({action:{type:'flee',itemId:'HE20'},bag:['HE01','HE20','HE20'],mp:2});mutate(f);assert.deepEqual(p(f).steps,[]);
});
for(const [name,mutate] of Object.entries({
 oldId:f=>f.before.battle.enemy.id='EN05',wrongEnemy:f=>f.effects[0].enemyId='EN05',extra:f=>f.effects.push({t:'future'}),
 reward:f=>f.after.reward={},removed:f=>delete f.effects[0],sameRevision:f=>f.after.revision=f.before.revision,
 mp:f=>f.after.hero.mp++, hp:f=>f.after.hero.hp++, gold:f=>f.after.hero.gold++,xp:f=>f.after.hero.xp++,
 moved:f=>f.after.pos++,rolls:f=>f.after.rolls++, staleBattle:f=>f.after.battle=f.before.battle,prompt:f=>f.after.prompt={kind:'chest'},
}))test('whole static '+name,async()=>{const f=await fixture();assert.equal(p(f).mode,'battle-flee');mutate(f);const r=p(f);assert.deepEqual(r.steps,[]);assert.deepEqual(r.finalView,f.after);});
test('cancel and skip discard queued steps and return committed final view',async()=>{
 const f=await fixture(),plan=p(f);for(const reason of ['skip','cancel']){
 const seen=[],ended=[],q=new Map();let id=0;
 const player=createPresentationPlayer({clock:{setTimeout:fn=>{q.set(++id,fn);return id},clearTimeout:i=>q.delete(i)},onStep:e=>seen.push(e),onFinal:e=>ended.push(e)});
 player.play(plan);const callbacks=[...q.values()];player[reason]();callbacks.forEach(fn=>fn());
 assert.equal(q.size,0);assert.deepEqual(seen,[]);assert.equal(ended.length,1);assert.deepEqual(ended[0].finalView,f.after);
 assert.deepEqual(ended[0].sounds.map(s=>s.payload.cue),reason==='skip'?['flee']:[]);
 }
});

for(const [name,mutate] of Object.entries({capacity:f=>f.after.hero.bag.capacity++,counts:f=>f.after.hero.bag.counts.HE20=8,metadata:f=>f.after.hero.bag.items[0].name='bad',nullItem:f=>f.after.hero.bag.items[0]=null,nullGear:f=>f.before.hero.gear[0]=null,hole:f=>delete f.before.hero.bag.items[0]}))test('HE20 rejects malformed '+name,async()=>{const f=await fixture({action:{type:'flee',itemId:'HE20'},bag:['HE01','HE20','HE20'],mp:2});mutate(f);assert.deepEqual(p(f).steps,[]);});
test('HE20 unknown companion hook stays static after real committed escape',async()=>{const f=await fixture({action:{type:'flee',itemId:'HE20'},bag:['HE20'],companions:['CP01']});assert.ok(f.effects.some(e=>e.t==='fled'));assert.deepEqual(p(f).steps,[]);});
