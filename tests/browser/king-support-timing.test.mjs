import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './spell-effect-session-fixture.mjs';
import {planKingSpellTimeline} from '../../src/ui/king-spell-timeline.js';
for(const [settings,duration,motion] of [[{},250,'support'],[{animation:'short'},100,'support'],[{reducedMotion:true},150,'fade'],[{reducedMotion:true,animation:'short'},150,'fade']])test('support time and retained effects '+JSON.stringify(settings),async()=>{
 const f=await fixture('SP04',{kind:'大技',hits:2,companions:['CP01','CP02'],hp:35,attack:50}),saved=await f.store.load(),p=planKingSpellTimeline({...f,settings,spellVisual:true});
 const support=p.steps.filter(s=>s.payload.stage==='king.turn.spell.support');
 assert.equal(support.length,3);
 for(const s of support){assert.equal(s.payload.durationMs,duration);assert.equal(s.payload.motion,motion);assert.deepEqual(s.payload.effect,f.effects[s.payload.effectIndex]);}
 const last=support.at(-1),tell=p.steps.find(s=>s.payload.stage==='king.turn.nextTell');
 assert.equal(tell.atMs,last.atMs+duration);assert.deepEqual(p.finalView,f.after);assert.deepEqual(p.resultEffects,f.effects);assert.deepEqual(await f.store.load(),saved);
});
