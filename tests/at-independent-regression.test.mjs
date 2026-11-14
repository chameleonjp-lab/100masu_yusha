import test from 'node:test';import assert from 'node:assert/strict';
import {getContent,exampleRun,landOnEvent,startBattle,cl} from './fixtures/helpers.mjs';
import {dispatch} from '../src/engine/index.js';
const c=await getContent();
test('AT21 also affects SP04 normal-attack-based calculation without changing base defense',()=>{
 let s=startBattle(c,exampleRun(c,'M'),'EN06',{patch:{level:20,hp:78,mp:30,bag:['AT21']}}).state;
 s.battle.enemy.hp=s.battle.enemy.maxHp=1000;s.battle.current.attack=0;
 s=dispatch(c,s,{type:'item',itemId:'AT21'}).state;s.hp=78;s.mp=30;s.spells.prepared=['SP04'];s.battle.current.attack=0;s.battle.current.defense=30;
 const plain=cl(s);delete plain.battle.flags.weakenDefenseUntil;
 const a=dispatch(c,s,{type:'spell',spellId:'SP04'}).state,b=dispatch(c,plain,{type:'spell',spellId:'SP04'}).state;
 assert.ok(a.battle.enemy.hp<b.battle.enemy.hp);assert.equal(s.battle.current.defense,30);
});
test('AT12 pierces the real B4-29 silk shell rather than only synthetic tagged effects',()=>{
 let s=landOnEvent(c,exampleRun(c,'B'),'B4-29',{pos:70,patch:{level:20,hp:78,bag:['AT12']}}).state;
 s.battle.enemy.maxHp=1000;s.battle.enemy.hp=500;s=dispatch(c,s,{type:'guard'}).state;s.hp=78;
 s=dispatch(c,s,{type:'attack',choiceId:'chase'}).state;s.hp=78;
 const before=s.battle.enemy.hp,out=dispatch(c,s,{type:'item',itemId:'AT12'}).state;
 assert.equal(before-out.battle.enemy.hp,10);
});
test('AT12 pierces the real B5-26 door used as a shield',()=>{
 const s=landOnEvent(c,exampleRun(c,'B'),'B5-26',{pos:90,patch:{level:20,hp:78,bag:['AT12']}}).state;
 s.battle.enemy.hp=s.battle.enemy.maxHp=1000;
 const out=dispatch(c,s,{type:'item',itemId:'AT12'}).state;assert.equal(out.battle.enemy.hp,990);
});
