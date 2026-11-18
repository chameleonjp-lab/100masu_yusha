import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './spell-effect-session-fixture.mjs';
import {planKingSpellTimeline} from '../../src/ui/king-spell-timeline.js';
const p=(f,x={})=>planKingSpellTimeline({...f,spellVisual:true,victoryVisual:true,...x});
const stages=r=>r.steps.filter(s=>s.kind==='display').map(s=>s.payload.stage);
for(const id of ['SP01','SP02','SP03','SP04'])test('real spell plan '+id,async()=>{
 const f=await fixture(id),saved=await f.store.load(),r=p(f);assert.equal(r?.mode,'king-turn');assert.equal(r.spellId,id);
 assert.deepEqual(stages(r).slice(0,3),['king.turn.spell.mp','king.turn.spell.prepare','king.turn.spell.cast']);
 assert.deepEqual(r.steps.filter(s=>s.kind==='sound').slice(0,2).map(s=>[s.payload.cue,s.payload.effectIndex]),[['cast',1],['cast.'+id.toLowerCase(),1]]);
 assert.deepEqual(r.resultEffects,f.effects);assert.deepEqual(r.finalView,f.after);assert.deepEqual(await f.store.load(),saved);
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.steps[1].payload));assert.equal(p(f,{spellVisual:false}),null);
});
test('ordered multi-hit shield/die/medic real events',async()=>{
 const f=await fixture('SP04',{kind:'大技',hits:2,companions:['CP01','CP02'],hp:35,attack:50}),r=p(f);
 assert.deepEqual(r.steps.filter(s=>s.kind==='display').map(s=>s.payload.effectIndex),[0,1,1,2,3,4,5,6,7,8,9,10,11]);
});
test('CP03 lethal precedes terminal and suppresses earlier crown without losing index',async()=>{
 const f=await fixture('SP01',{enemyHp:45,kind:'反撃の隙',companions:['CP03']}),r=p(f);
 assert.equal(r?.mode,'king-victory-turn');
 assert.deepEqual(r.resultEffects,f.effects);
 assert.ok(!stages(r).some(s=>s.startsWith('king.crown.')||s==='king.turn.nextTell'||s==='king.turn.enemy.prepare'));
 assert.equal(r.steps.find(s=>s.payload.cue==='victory').payload.effectIndex,6);
 assert.ok(stages(r).indexOf('king.turn.spell.support')<stages(r).indexOf('king.victory.disappear'));
 assert.equal(p(f,{victoryVisual:false}),null);
});
test('existing surviving crown accepts SP01 and rejects SP04 without synthetic effects',async()=>{
 const f=await fixture('SP01',{enemyHp:100});assert.ok(stages(p(f)).includes('king.crown.resume'));
 const g=await fixture('SP04',{enemyHp:75});assert.ok(g.effects.some(e=>e.t==='phaseChange'));assert.equal(p(g),null);
});
test('whole static on unsupported effect',async()=>{const f=await fixture('SP03');f.effects.push({t:'future'});assert.equal(p(f),null);});
test('motion/timing preserve casts and ordered source indices',async()=>{
 const f=await fixture('SP02');for(const [settings,length,motion] of [[{},300,'sparkle'],[{animation:'short'},120,'sparkle'],[{reducedMotion:true},300,'fade']]){
 const r=p(f,{settings}),cast=r.steps.find(s=>s.payload.stage==='king.turn.spell.cast');assert.equal(cast.atMs,length);assert.equal(cast.payload.motion,motion);assert.ok(r.steps.every((s,i)=>!i||s.atMs>=r.steps[i-1].atMs));}
});
test('thrower cue supplies the existing audio role without pretending to be a shield',async()=>{
 const r=p(await fixture('SP01',{enemyHp:45,kind:'反撃の隙',companions:['CP03']}));
 const cue=r.steps.find(s=>s.kind==='sound'&&s.payload.cue==='support');assert.deepEqual(cue.payload.options,{role:'thrower'});assert.equal(cue.payload.effectIndex,5);
});
