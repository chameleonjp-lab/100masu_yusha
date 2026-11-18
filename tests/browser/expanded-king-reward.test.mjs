import test from 'node:test';import assert from 'node:assert/strict';
import {getContent,exampleRun,place,walk} from '../fixtures/helpers.mjs';
import {dispatch,createMeta} from '../../src/engine/index.js';
import {createSession} from '../../src/ui/session.js';
import {createMemoryStore} from '../../src/save/index.js';
import {planPresentation} from '../../src/ui/presentation-timeline.js';
const c=await getContent();
const opts={kingRewardVisual:true,kingExpandedRewardVisual:true,kingSpellTimeline:true,spellVisual:true,victoryVisual:true,kingTurnVisual:true};
const stages=p=>p.steps.filter(s=>s.payload.stage?.startsWith('king.reward.'));
async function fixture({seed=1,spell,level=20,bag=false,revealed=false}={}){
 const run=dispatch(c,walk(c,place(exampleRun(c,'M',seed),99,{level,xp:level===20?912:828,hp:70,mp:level===20?48:46,
  ...(spell?{spells:{learned:[spell],prepared:[spell]}}:{}),bag:bag?Array(6).fill(Object.keys(c.items)[0]):[]}),1).state,{type:'challengeKing'}).state;
 run.battle.enemy.hp=4;
 if(revealed)run.discovered.gear=Object.keys(c.gear);
 const store=createMemoryStore();await store.startNew({run,meta:createMeta()});const s=createSession(c,store);await s.load();
 const before=structuredClone(s.view),effects=await s.act(spell?{type:'spell',spellId:spell}:{type:'attack'}),after=structuredClone(s.view);return {before,after,effects,store};
}
const p=(f,o={})=>planPresentation({...f,...opts,...o});
for(const spell of [undefined,'SP01','SP04']) test('actual growth, equipment and item '+(spell??'attack'),async()=>{
 const f=await fixture({seed:2,spell,level:19}),saved=await f.store.load(),r=p(f);
 assert.deepEqual(f.effects.slice(spell?4:2).map(e=>e.t),['gold','xp','levelUp','gearGained','discover','rewards','itemGained']);
 assert.equal(p(f,{kingExpandedRewardVisual:false}).steps.length,0);
 assert.deepEqual(stages(r).map(s=>s.payload.stage),['king.reward.money','king.reward.levelUp','king.reward.gear','king.reward.item']);
 const cue=s=>r.steps.find(x=>x.kind==='sound'&&x.payload.cue===s);
 const level=stages(r)[1];
 assert.deepEqual(level.payload.effect,f.effects[level.payload.effectIndex]);assert.equal(level.payload.durationMs,1000);
 assert.equal(cue('levelup').payload.effectIndex,level.payload.effectIndex);
 assert.equal(cue('bag').payload.effectIndex,f.effects.findIndex(e=>e.t==='itemGained'));
 assert.equal(cue(f.after.reward.gear.kind==='剣'?'sheath':'buckle').payload.effectIndex,f.effects.findIndex(e=>e.t==='gearGained'));
 assert.ok(!r.steps.some(s=>/king\.crown|king\.turn\.nextTell|king\.turn\.enemy\.prepare/.test(s.payload.stage??'')));
 assert.equal(f.after.hero.hp,f.before.hero.hp);
 assert.equal(f.after.hero.mp,f.before.hero.mp-(f.effects.find(e=>e.t==='spellCast')?.cost??0));
 assert.deepEqual(r.resultEffects,f.effects);assert.deepEqual(r.finalView,f.after);assert.deepEqual(await f.store.load(),saved);
});
test('gear plus bagFull keeps prompt and does not sound acquisition for item',async()=>{
 const f=await fixture({seed:2,bag:true}),r=p(f);assert.equal(f.after.phase,'bagFull');
 assert.equal(stages(r).at(-1).payload.item.state,'prompt');assert.equal(stages(r).length,3);
 assert.ok(!r.steps.some(s=>s.payload.cue==='bag'));assert.deepEqual(r.finalView.prompt,f.after.prompt);
});
test('already discovered gear legitimately lacks discover effect',async()=>{
 const f=await fixture({seed:2,revealed:true});assert.ok(!f.effects.some(e=>e.t==='discover'));assert.equal(p(f).mode,'king-victory-turn');
});
for(const [name,mutate] of Object.entries({
 extras:f=>f.effects.push({t:'future'}),wrongGear:f=>f.effects.find(e=>e.t==='gearGained').id='SW01',
 wrongItem:f=>f.effects.find(e=>e.t==='itemGained').id='BD01',wrongStat:f=>f.effects.find(e=>e.t==='levelUp').gains.maxHp++,
 wrongOrder:f=>{const g=f.effects.findIndex(e=>e.t==='gearGained');[f.effects[g],f.effects[g+1]]=[f.effects[g+1],f.effects[g]];},
 paidGear:f=>f.effects.find(e=>e.t==='gearGained').paidGold=500,
 fakeDiscover:f=>f.effects.find(e=>e.t==='discover').kind='enemy',
 wrongGearIid:f=>f.after.hero.gear.at(-1).iid='fake', wrongBagId:f=>f.after.hero.bag.items.at(-1).id='BD01',
 hpRefill:f=>f.after.hero.hp+=2, mpRefill:f=>f.after.hero.mp+=2,
 badHistory:f=>f.after.battle.history.at(-1).dealt++, badPhase:f=>f.after.battle.phase.changed=true,
 badRevision:f=>f.after.revision++, duplicateGrowth:f=>f.effects.splice(6,0,{...f.effects[6]}),
 lateTell:f=>f.effects.push({t:'enemyTell'}),
})) test('whole-static '+name,async()=>{const f=await fixture({seed:2,spell:'SP01',level:19});assert.equal(p(f).mode,'king-victory-turn');mutate(f);assert.deepEqual(p(f).steps,[]);});
