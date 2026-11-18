import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './spell-effect-session-fixture.mjs';
import {consumeSpellTurn} from '../../src/ui/spell-effect-consumer.js';

for(const [id,opts] of [['SP01',{}],['SP02',{}],['SP03',{}],['SP03',{kind:'反撃の隙'}],['SP04',{}],['SP04',{kind:'大技',hits:2,companions:['CP01','CP02'],hp:35,attack:50}]]){
 test(id+' keeps committed effects '+JSON.stringify(opts),async()=>{
  const f=await fixture(id,opts),saved=await f.store.load(),r=consumeSpellTurn(f);
  assert.ok(r);assert.equal(r.spellId,id);
  assert.deepEqual(r.events.map(e=>[e.index,e.effect]),f.effects.map((e,i)=>[i,e]));
  assert.deepEqual(r.boundaries,{crown:null,victory:null,nextTell:f.effects.length-1});
  assert.ok(Object.isFrozen(r.events[0].effect));assert.notEqual(r.events[0].effect,f.effects[0]);
  assert.deepEqual(await f.store.load(),saved);
 });
}
test('lethal hit selects only victory boundary',async()=>{const r=consumeSpellTurn(await fixture('SP01',{enemyHp:4}));assert.deepEqual(r?.boundaries,{crown:null,victory:3,nextTell:null});});
test('CP03 second lethal hit retains real first-hit phase boundary and support position',async()=>{const f=await fixture('SP01',{enemyHp:45,kind:'反撃の隙',companions:['CP03']}),r=consumeSpellTurn(f);assert.deepEqual(r?.boundaries,{crown:3,victory:6,nextTell:null});assert.deepEqual(r.events.map(e=>e.effect),f.effects);});
test('SP03 emitted wall rule contains no inferred damage contribution',async()=>{const f=await fixture('SP03'),r=consumeSpellTurn(f);assert.ok(r);assert.deepEqual(r.events.find(e=>e.effect.t==='rule'),{index:3,effect:f.effects[3]});});
for(const [label,change] of Object.entries({
 unknown:x=>x.effects.splice(4,0,{t:'future'}),
 sparse:x=>{delete x.effects[3]},
 wrongMp:x=>x.effects[0].after--,
 wrongHistory:x=>x.after.battle.history.at(-2).hpLost++,
 wrongOffer:x=>x.before.battle.spells[0].kind='heal',
 wrongBound:x=>x.effects.find(e=>e.t==='hit'&&e.target==='hero').maxHp++,
 falseMedic:x=>x.effects.find(e=>e.role==='medic').amount--,
 wrongOrder:x=>{const i=x.effects.findIndex(e=>e.role==='medic');[x.effects[i-1],x.effects[i]]=[x.effects[i],x.effects[i-1]];},
 delayedShield:x=>{const i=x.effects.findIndex(e=>e.role==='medic');x.effects.splice(i+1,0,{t:'companion',id:'CP01',role:'shield',amount:1});},
 fakeSupport:x=>x.effects.find(e=>e.role==='shield').id='CP03',
 wrongDamage:x=>{x.effects.find(e=>e.t==='hit'&&e.target==='hero').potentialDamage=1;},
 wrongTell:x=>x.effects.at(-1).attack++,
}))test('whole-static '+label,async()=>{const f=await fixture('SP04',{kind:'大技',hits:2,companions:['CP01','CP02'],hp:35,attack:50});change(f);assert.equal(consumeSpellTurn(f),null)});
test('altered individual shield amount fails even though aggregate block remains coherent',async()=>{
 const f=await fixture('SP04',{kind:'大技',hits:2,companions:['CP01','CP02'],hp:35,attack:50});
 f.effects.find(e=>e.role==='shield').amount--;assert.equal(consumeSpellTurn(f),null);
});
test('foreign crown phase is rejected',async()=>{
 const f=await fixture('SP01',{enemyHp:100});f.after.battle.phase.changed=false;assert.equal(consumeSpellTurn(f),null);
});
test('null packet returns static rather than throwing',()=>assert.equal(consumeSpellTurn(null),null));
test('sparse committed history is rejected even when current record remains',async()=>{
 const f=await fixture('SP01');delete f.after.battle.history[1];assert.equal(consumeSpellTurn(f),null);
});
