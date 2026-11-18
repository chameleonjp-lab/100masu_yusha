import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './spell-effect-session-fixture.mjs';
import {getContent,exampleRun,place,walk} from '../fixtures/helpers.mjs';
import {dispatch,createMeta} from '../../src/engine/index.js';
import {createSession} from '../../src/ui/session.js';
import {createMemoryStore} from '../../src/save/index.js';
import {planPresentation,createPresentationPlayer} from '../../src/ui/presentation-timeline.js';
const opts={kingSpellTimeline:true,spellVisual:true,victoryVisual:true,kingTurnVisual:true};
const stages=p=>p.steps.filter(s=>s.payload.stage?.startsWith('king.reward.'));
const content=await getContent();
async function attackFixture({seed=1,full=false}={}){
 const run=dispatch(content,walk(content,place(exampleRun(content,'M',seed),99,{level:20,xp:912,hp:78,mp:48,bag:full?Array(6).fill(Object.keys(content.items)[0]):[]}),1).state,{type:'challengeKing'}).state;
 run.battle.enemy.hp=4;
 const store=createMemoryStore();await store.startNew({run,meta:createMeta()});const s=createSession(content,store);await s.load();
 const before=structuredClone(s.view),effects=await s.act({type:'attack'}),after=structuredClone(s.view);
 return {before,after,effects,store};
}
for(const [settings,time] of [[{},400],[{animation:'short'},150],[{animation:'short',reducedMotion:true},0]])test('reward stages and original sources '+JSON.stringify(settings),async()=>{
 const f=await fixture('SP01',{enemyHp:4}),saved=await f.store.load(),legacy=planPresentation({...f,...opts,settings}),p=planPresentation({...f,...opts,kingRewardVisual:true,settings});
 assert.equal(stages(legacy).length,0);assert.equal(p.mode,legacy.mode);assert.equal(p.spellId,'SP01');
 assert.equal(p.durationMs,legacy.durationMs+time*3);
 assert.deepEqual(stages(p).map(s=>s.payload.stage),['king.reward.money','king.reward.gear','king.reward.item']);
 assert.deepEqual(stages(p).map(({atMs,payload})=>[atMs,payload.durationMs]),[0,1,2].map(i=>[legacy.durationMs+i*time,time]));
 assert.deepEqual(stages(p)[0].payload.effectIndices,[4,5]);
 assert.ok(p.steps.indexOf(p.steps.find(s=>s.payload.stage==='king.victory.label'))<p.steps.indexOf(stages(p)[0]));
 assert.equal(p.steps.at(-1).payload.enabled,true);assert.equal(p.steps.at(-1).atMs,p.durationMs);
 assert.deepEqual(p.steps.filter(s=>s.payload.cue==='coin.in').map(s=>s.payload.effectIndex),[4]);
 assert.ok(!p.steps.some(s=>['bag','sheath','buckle'].includes(s.payload.cue)));
 assert.deepEqual(p.resultEffects,f.effects);assert.deepEqual(p.finalView,f.after);assert.deepEqual(await f.store.load(),saved);
});
test('real attack victory uses same stages; complicated or unknown reward remains whole-static',async()=>{
 const f=await attackFixture(),p=planPresentation({...f,...opts,kingRewardVisual:true});
 assert.deepEqual(stages(p).map(s=>s.payload.effectIndex),[2,4,4]);
 const g=await attackFixture({seed:2});assert.ok(g.effects.some(e=>e.t==='gearGained'));
 assert.equal(planPresentation({...g,...opts,kingRewardVisual:true}).steps.length,0);
});
test('real pending bag full retains prompt and never plays bag acquisition',async()=>{
 const f=await attackFixture({seed:5,full:true}),saved=await f.store.load(),p=planPresentation({...f,...opts,kingRewardVisual:true});
 assert.equal(f.after.phase,'bagFull');assert.deepEqual(stages(p).at(-1).payload.item,f.after.reward.item);
 assert.ok(!p.steps.some(s=>s.payload.cue==='bag'));assert.deepEqual(p.finalView.prompt,f.after.prompt);
 assert.deepEqual(await f.store.load(),saved);
});
test('skip during reward finalizes once and does not reread pending state',async()=>{
 const f=await attackFixture({seed:5,full:true}),saved=await f.store.load(),p=planPresentation({...f,...opts,kingRewardVisual:true});
 const queue=new Map(),seen=[],final=[];let id=0;
 const player=createPresentationPlayer({clock:{setTimeout:(fn,ms)=>{queue.set(++id,{fn,ms});return id;},clearTimeout:id=>queue.delete(id)},onStep:s=>seen.push(s.payload.stage),onFinal:x=>final.push(x)});
 player.play(p);
 const boundary=stages(p)[0].atMs;
 for(const [key,x] of [...queue].sort((a,b)=>a[1].ms-b[1].ms))if(x.ms<=boundary&&queue.delete(key))x.fn();
 assert.ok(seen.includes('king.reward.money'));assert.equal(seen.includes('king.reward.gear'),false);
 player.skip();assert.equal(player.running,false);assert.equal(queue.size,0);assert.equal(final.length,1);assert.equal(final[0].reason,'skip');
 assert.deepEqual(player.finalView,f.after);assert.deepEqual(await f.store.load(),saved);
});
