import test from 'node:test';import assert from 'node:assert/strict';
import {getContent,exampleRun,startBattle} from '../fixtures/helpers.mjs';
import {createMeta} from '../../src/engine/index.js';import {createSession} from '../../src/ui/session.js';import {createMemoryStore} from '../../src/save/index.js';
import {planNormalGuard} from '../../src/ui/normal-guard-plan.js';
import {createPresentationPlayer,planPresentation} from '../../src/ui/presentation-timeline.js';
const c=await getContent();
async function fixture({die=3,action='guard'}={}){
 const q=startBattle(c,exampleRun(c,'M'),'EN09',{die}),store=createMemoryStore();
 await store.startNew({run:q.state,meta:createMeta()});const s=createSession(q.content,store);await s.load();
 const before=structuredClone(s.view),effects=await s.act({type:action}),after=structuredClone(s.view);
 return {before,after,effects,store};
}
const p=(f,o={})=>planPresentation({...f,battleVisual:true,battleGuardVisual:true,...o});
for(const [settings,duration] of [[{},200],[{animation:'short'},100],[{animation:'short',reducedMotion:true},0]])test('confirmed guard staged in order '+JSON.stringify(settings),async()=>{
 const f=await fixture(),saved=await f.store.load(),r=p(f,{settings}),steps=r.steps.filter(s=>s.kind==='display');
 assert.equal(r.mode,'battle-guard');
 assert.deepEqual(steps.map(s=>s.payload.stage),['battle.hero.guard','battle.enemy.prepare','battle.hero.block','battle.hero.hit','battle.nextTell','battle.result']);
 assert.equal(steps[0].payload.durationMs,duration);
 const hit=f.effects.find(e=>e.t==='hit');assert.deepEqual(steps[3].payload.hit,hit);assert.equal(steps[2].payload.blocked,hit.blocked);
 assert.deepEqual(steps[2].payload.sources,f.effects.filter(e=>e.t==='dieSoften'));
 assert.equal(steps[1].payload.enemyAct.name,f.before.battle.telegraph.name);assert.deepEqual(steps[4].payload.telegraph,f.after.battle.telegraph);
 const cues={'通常攻撃':'tell.attack','大技':'tell.big','守り':'tell.guard','反撃の隙':'tell.open'};
 assert.deepEqual(r.steps.filter(s=>s.kind==='sound').map(s=>[s.payload.cue,s.payload.effectIndex,s.atMs]),[['shield',f.effects.indexOf(hit),steps[3].atMs],[cues[f.after.battle.telegraph.kind],f.effects.length-1,steps[4].atMs]]);
 assert.equal(steps[4].payload.durationMs,settings.reducedMotion?150:settings.animation==='short'?120:350);
 assert.equal(steps[4].payload.motion,settings.reducedMotion?'fade':settings.animation==='short'?'none':'sway');
 assert.equal(steps[5].atMs,steps[4].atMs+steps[4].payload.durationMs);
 assert.deepEqual(r.resultEffects,f.effects);assert.deepEqual(r.finalView,f.after);assert.deepEqual(await f.store.load(),saved);
});
test('actual guard with no die soften and default/explicit opt-in',async()=>{
 const f=await fixture({die:4}),r=p(f);
 assert.ok(!f.effects.some(e=>e.t==='dieSoften'));assert.equal(r.mode,'battle-guard');
 for(const gate of ['battleVisual','battleGuardVisual'])assert.deepEqual(p(f,{[gate]:false}).steps,[]);
});
test('old normal attack still follows exact default mode and stages',async()=>{
 const f=await fixture({action:'attack'});assert.deepEqual(p(f),p(f,{battleGuardVisual:false}));
 assert.ok(p(f).steps.some(s=>s.payload.stage==='battle.hero.slash'));
});
for(const [label,mutate] of Object.entries({
 extra:f=>f.effects.push({t:'future'}),
 item:f=>f.effects[0].source='item',
 multiple:f=>f.effects.splice(-1,0,{...f.effects.find(e=>e.t==='hit')}),
 oldTell:f=>f.before.battle.telegraph.name='other',
 nextTell:f=>f.effects.at(-1).attack++,
 unknownKind:f=>{f.after.battle.telegraph.kind='future';f.effects.at(-1).kind='future'},
 unknownOldKind:f=>{f.before.battle.telegraph.kind='future';for(const e of f.effects){if(e.t==='enemyAct')e.kind='future';if(e.t==='hit')e.enemyKind='future'}},
 falseBlock:f=>f.effects.find(e=>e.t==='hit').blocked--,
 falseHP:f=>f.after.hero.hp--,
 lost:f=>f.after.battle.history.find(r=>r.round===f.before.battle.round).hpLost++,
 custom:f=>f.after.battle.history.find(r=>r.round===f.before.battle.round).action.choiceId='special',
 companion:f=>f.effects.splice(2,0,{t:'companion',role:'shield'}),
}))test('guard fails closed '+label,async()=>{const f=await fixture();assert.equal(p(f).mode,'battle-guard');mutate(f);const rejected=p(f);assert.deepEqual(rejected.steps,[]);assert.deepEqual(rejected.finalView,f.after);});

test('null direct input is whole static',()=>assert.equal(planNormalGuard(null),null));
for(const how of ['skip','cancel'])test('guard '+how+' discards scheduled delivery and retains committed final view',async()=>{
 const f=await fixture(),plan=p(f),seen=[],final=[],queue=new Map();let id=0;
 const player=createPresentationPlayer({clock:{setTimeout:(fn,ms)=>{queue.set(++id,{fn,ms});return id},clearTimeout:key=>queue.delete(key)},onStep:step=>seen.push(step.key),onFinal:x=>final.push(x)});
 player.play(plan);const all=[...queue.values()];player[how]();
 assert.equal(queue.size,0);for(const x of all)x.fn();
 assert.deepEqual(seen,[]);assert.equal(final.length,1);assert.equal(final[0].reason,how);assert.deepEqual(final[0].finalView,f.after);
 if(how==='skip'){assert.deepEqual(final[0].sounds.map(s=>s.atMs),[0,120]);assert.equal(new Set(final[0].sounds.map(s=>s.payload.cue)).size,2);}
 else assert.deepEqual(final[0].sounds,[]);
});
test('four canonical next tells retain timing and existing sound recipes',async()=>{
 for(const [kind,cue] of [['通常攻撃','tell.attack'],['大技','tell.big'],['守り','tell.guard'],['反撃の隙','tell.open']]){
  const f=await fixture();f.after.battle.telegraph.kind=kind;f.effects.at(-1).kind=kind;
  for(const settings of [{},{animation:'short'},{reducedMotion:true}]){
   const r=p(f,{settings}),tell=r.steps.find(s=>s.payload.stage==='battle.nextTell'),sound=r.steps.find(s=>s.payload.cue===cue);
   assert.equal(tell.atMs,sound.atMs);assert.equal(tell.payload.telegraph.kind,kind);
   assert.equal(tell.payload.dangerMotion,kind==='大技'?(settings.reducedMotion||settings.animation==='short'?'still':'pulse'):undefined);
  }
 }
});
