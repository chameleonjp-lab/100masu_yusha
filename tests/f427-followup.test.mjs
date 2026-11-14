import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../src/engine/index.js';
import { exampleRun,getContent,landOnEvent,withScripts } from './fixtures/helpers.mjs';
const content=await getContent();
function setup(c=content){let s=exampleRun(c,'F');Object.assign(s,{hp:200,mp:0});s.gear.push({iid:'bell-sword',id:'SW11',paidGold:0});s.equipped.sword='bell-sword';return landOnEvent(c,s,'F4-27',{pos:70,die:5}).state;}
// Replacing none with capDamage(0) must fail: the bell is not an enemy hit.
test('F4-27 right bell does not hit enemy, trigger heroHit, or consume die bonus',()=>{
 const s=setup();
 const hp=s.battle.enemy.hp;const r=dispatch(content,s,{type:'attack',choiceId:'right'});
 assert.equal(r.state.battle.enemy.hp,hp);assert.equal(r.state.battle.rounds[0].landed,false);
 assert.equal(r.state.battle.dieBonus.used,false);assert.equal(r.state.mp,0);
 assert.ok(r.effects.filter(e=>e.t==='hit'&&e.target==='enemy').every(e=>e.amount===0&&e.blocked==='scenario'));
 assert.equal(r.effects.some(e=>e.t==='rule'&&e.hook==='heroHit'),false);
 const next=dispatch(content,JSON.parse(JSON.stringify(r.state)),{type:'attack'}).state;
 assert.equal(next.battle.dieBonus.used,true);assert.equal(next.mp,2);
});
test('F4-27 choice belongs to first-round attack, not before other actions',()=>{
 const s=setup();assert.equal(s.phase,'battle');
 assert.throws(()=>dispatch(content,s,{type:'attack'}),/scenario_choice_required/);
 const guarded=dispatch(content,s,{type:'guard'}).state;
 assert.throws(()=>dispatch(content,guarded,{type:'attack',choiceId:'left'}),/bad_scenario_choice/);
 assert.equal(dispatch(content,guarded,{type:'attack'}).state.battle.rounds[1].landed,true);
});
test('F4-27 left adds exactly three to first normal strike; later strikes are ordinary',()=>{
 const plain=withScripts(content,{events:{'F4-27':{onLand:[{op:'battle',enemy:'EN06'}]}}});
 const a=dispatch(content,setup(),{type:'attack',choiceId:'left'}).state;
 const b=dispatch(plain,setup(plain),{type:'attack'}).state;
 assert.equal(a.battle.enemy.hp,b.battle.enemy.hp-3);
 assert.equal(a.battle.dieBonus.used,true);
 const a2=dispatch(content,a,{type:'attack'}).state,b2=dispatch(plain,b,{type:'attack'}).state;
 assert.equal(a2.battle.enemy.hp,b2.battle.enemy.hp-3);
});
