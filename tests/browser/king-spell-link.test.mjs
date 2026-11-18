import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './spell-effect-session-fixture.mjs';
import {planPresentation} from '../../src/ui/presentation-timeline.js';
const caps={kingSpellTimeline:true,spellVisual:true,victoryVisual:true,kingTurnVisual:true,battleVisual:true};
test('default keeps old SP01 but leaves new SP02 unconnected until capability opt-in',async()=>{
 const f=await fixture('SP02');assert.equal(planPresentation({...f,...caps,kingSpellTimeline:false}).steps.length,0);
 const r=planPresentation({...f,...caps});assert.equal(r.spellId,'SP02');
 assert.ok(r.steps.some(s=>s.payload.stage==='king.turn.spell.hp'));assert.equal(r.mode,'king-turn');
 const g=await fixture('SP01');assert.ok(planPresentation({...g,...caps,kingSpellTimeline:false}).steps.length);
});
test('whole-static does not fall back to legacy spell or any move route',async()=>{
 const f=await fixture('SP01');f.effects.push({t:'future'});
 const r=planPresentation({...f,...caps});assert.deepEqual(r.steps,[]);assert.deepEqual(r.finalView,f.after);
});
test('terminal CP03 uses only victory, support options retained, both flags literal',async()=>{
 const f=await fixture('SP01',{enemyHp:45,kind:'反撃の隙',companions:['CP03']});
 const r=planPresentation({...f,...caps});assert.equal(r.mode,'king-victory-turn');
 assert.deepEqual(r.steps.find(s=>s.payload.cue==='support').payload.options,{role:'thrower'});
 for(const gate of ['spellVisual','victoryVisual'])assert.deepEqual(planPresentation({...f,...caps,[gate]:false}).steps,[]);
});
