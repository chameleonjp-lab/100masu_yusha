import test from 'node:test';import assert from 'node:assert/strict';
import {dispatch} from '../src/engine/index.js';import {getContent,exampleRun,startBattle} from './fixtures/helpers.mjs';
const content=await getContent();
test('HE20 accompanies legal flee, without victory rewards',()=>{
 const b=startBattle(content,exampleRun(content,'M'),'EN09',{die:4});let s=b.state;s.hp=10;s.mp=0;s.bag=['HE20'];
 const r=dispatch(b.content,s,{type:'flee',itemId:'HE20'});assert.equal(r.state.hp,22);assert.equal(r.state.mp,3);assert.equal(r.state.bag.includes('HE20'),false);assert.equal(r.state.gold,s.gold);assert.equal(r.state.xp,s.xp);
});
test('HE20 cannot be spent to flee an optional boss',()=>{
 const b=startBattle(content,exampleRun(content,'M'),'MB01',{die:4});let s=b.state;if(s.phase==='bossOffer')s=dispatch(b.content,s,{type:'challenge'}).state;s.bag=['HE20'];
 assert.throws(()=>dispatch(b.content,s,{type:'flee',itemId:'HE20'}));assert.deepEqual(s.bag,['HE20']);
});
test('HE34 counts actual enemy actions and is limited to one per victory across reload',()=>{
 const b=startBattle(content,exampleRun(content,'M'),'EN09',{die:3});let s=b.state;
 for(let i=0;i<2;i++)s=dispatch(b.content,s,{type:'attack'}).state;
 s.hp=10;s.mp=0;s.bag=['HE34','HE34'];s=dispatch(b.content,s,{type:'attack'},{rolls:[0.99,0.99]}).state;
 assert.equal(s.phase,'battleReward');const gold=s.gold,xp=s.xp;
 s=dispatch(b.content,s,{type:'useItem',itemId:'HE34'}).state;assert.equal(s.hp,18);assert.equal(s.mp,2);assert.deepEqual(s.bag,['HE34']);
 s=JSON.parse(JSON.stringify(s));assert.throws(()=>dispatch(b.content,s,{type:'useItem',itemId:'HE34'}));
 s=dispatch(b.content,s,{type:'continue'}).state;assert.equal(s.gold,gold);assert.equal(s.xp,xp);
});
