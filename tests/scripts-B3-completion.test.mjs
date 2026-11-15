import test from 'node:test';import assert from 'node:assert/strict';
import {getContent,exampleRun,landOnEvent} from './fixtures/helpers.mjs';import {dispatch} from '../src/engine/index.js';
const c=await getContent();
function battle(id,option){let s=landOnEvent(c,exampleRun(c,'B'),id,{pos:50,die:2,patch:{hp:100,level:10}}).state;if(option)s=dispatch(c,s,{type:'chooseOption',optionId:option}).state;return s;}
test('B3-15 predicts two fixed slides and wall loss only after second',()=>{let s=battle('B3-15');assert.equal(s.battle.current.rawDamage,3);s=dispatch(c,s,{type:'guard'}).state;assert.equal(s.battle.current.rawDamage,3);const hp=s.battle.enemy.hp;s=dispatch(c,s,{type:'guard'}).state;assert.equal(s.battle.enemy.hp,hp-5);});
test('B3-25 moved signal stops round one and stationary signal stops round two',()=>{let a=battle('B3-25','move');assert.equal(a.battle.current.attack,0);let b=battle('B3-25','keep');b=dispatch(c,b,{type:'guard'}).state;assert.equal(b.battle.current.attack,0);});
test('B3-14 opposite position cancels initial pull; north keeps fixed three',()=>{let a=battle('B3-14','opposite');assert.equal(a.battle.current.rawDamage,0);let b=battle('B3-14','north');assert.equal(b.battle.current.rawDamage,3);assert.equal(b.battle.scenario.attackChoices[0].damageMode,'pierce');});
test('B3-12 shoulder clears the three scraps without a hero hit',()=>{let s=battle('B3-12');let r=dispatch(c,s,{type:'attack',choiceId:'shoulder'});assert.ok(r.effects.some(x=>x.blocked==='scenario'));assert.equal(r.state.battle.flags['scenario:scraps-cleared'],true);});
test('B3-19 cutting the fuse consumes an attack without damage',()=>{let s=battle('B3-19');const hp=s.battle.enemy.hp;s=dispatch(c,s,{type:'attack',choiceId:'fuse'}).state;assert.equal(s.battle.enemy.hp,hp);assert.equal(s.battle.flags['scenario:lit'],true);});
test('B3-16 tree choice installs only first-two-round modifiers',()=>{let s=battle('B3-16','tree');assert.equal(s.battle.marks.length,2);assert.deepEqual(s.battle.marks[0].when.lte,[{ref:'battle.round'},2]);});
test('B3-27 puncture is exactly four and leaving cancels the second action',()=>{let s=battle('B3-27');let hp=s.battle.enemy.hp;s=dispatch(c,s,{type:'attack',choiceId:'puncture'}).state;assert.equal(s.battle.enemy.hp,hp-4);let t=battle('B3-27');t.battle.enemy.hp=100;t.battle.enemy.maxHp=100;t=dispatch(c,t,{type:'attack',choiceId:'leave'}).state;const r=dispatch(c,t,{type:'guard'});assert.ok(r.effects.every(x=>!(x.t==='hit'&&x.target==='hero'&&x.amount>0)));});
for(const id of ['B3-17','B3-21','B3-23','B3-29'])test(`${id} starts its authored battle rather than an unscripted placeholder`,()=>{assert.equal(battle(id).phase,'battle');});
import {view} from '../src/engine/index.js';
test('B3-17 gap requires an inserted stone and round-two insertion lasts for round three only',()=>{
 let s=battle('B3-17');assert.ok(!view(c,s).actions.some(a=>a.choiceId==='gap'));
 s=dispatch(c,s,{type:'guard',choiceId:'stone'}).state;s=dispatch(c,s,{type:'guard',choiceId:'stone'}).state;
 assert.ok(view(c,s).actions.some(a=>a.choiceId==='gap'));assert.ok(!view(c,s).actions.some(a=>a.choiceId==='stone'));
 s=dispatch(c,s,{type:'guard'}).state;assert.ok(!view(c,s).actions.some(a=>a.choiceId==='gap'));
});
