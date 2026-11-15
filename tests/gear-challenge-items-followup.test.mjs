import test from 'node:test';import assert from 'node:assert/strict';import {dispatch}from '../src/engine/index.js';import{getContent,exampleRun,landOnEvent,withScripts,startBattle}from './fixtures/helpers.mjs';const base=await getContent();
const c=withScripts(base,{events:{'F1-32':{onLand:[{op:'giveGear',id:'SW02'}]}}});
test('BD28 waits for new gear receipt, gives only one gear and reserves one attack bonus',()=>{let s=exampleRun(c,'F');s.bag=['BD28'];s=landOnEvent(c,s,'F1-32').state;assert.equal(s.prompt.kind,'gearConfirm');assert.equal(s.gear.some(g=>g.id==='SW02'),false);s=dispatch(c,s,{type:'confirmGear',itemId:'BD28'}).state;assert.equal(s.gear.filter(g=>g.id==='SW02').length,1);assert.equal(s.reservations[0].withinMoves,2);assert.equal(s.reservations[0].rules[0].effects[0].amount,7);assert.deepEqual(s.bag,[]);});
test('BD28 default confirmation does not spend item; duplicate gear is not offered',()=>{let s=exampleRun(c,'F');s.bag=['BD28'];s=landOnEvent(c,s,'F1-32').state;s=dispatch(c,s,{type:'confirmGear'}).state;assert.deepEqual(s.bag,['BD28']);assert.equal(s.reservations.length,0);s=landOnEvent(c,s,'F1-32').state;assert.notEqual(s.prompt?.kind,'gearConfirm');assert.deepEqual(s.bag,['BD28']);});
test('BD46 declaration applies only to a confirmed optional fight and skip spends nothing',()=>{const b=startBattle(base,exampleRun(base),'MB01');let s=b.state;s.bag=['BD46'];const skipped=dispatch(b.content,s,{type:'skip'}).state;assert.deepEqual(skipped.bag,['BD46']);s=dispatch(b.content,s,{type:'challenge',itemId:'BD46',params:{declaration:'attack'}}).state;assert.deepEqual(s.bag,[]);assert.ok(s.battle.marks.some(m=>m.id==='BD46-attack'));assert.throws(()=>dispatch(b.content,s,{type:'useItem',itemId:'BD46'}));});
test('BD46 attack declaration adds exactly12 on matching opening attack, never after mismatch',()=>{
 const b=startBattle(base,exampleRun(base),'MB01',{die:4});b.state.bag=['BD46'];
 const normal=dispatch(b.content,b.state,{type:'challenge'}).state;
 const marked=dispatch(b.content,b.state,{type:'challenge',itemId:'BD46',params:{declaration:'attack'}}).state;
 const n=dispatch(b.content,normal,{type:'attack'}),m=dispatch(b.content,marked,{type:'attack'});assert.equal(n.state.battle.enemy.hp-m.state.battle.enemy.hp,12);
 let n2=dispatch(b.content,normal,{type:'guard'}).state,m2=dispatch(b.content,marked,{type:'guard'}).state;
 n2=dispatch(b.content,n2,{type:'attack'}).state;m2=dispatch(b.content,m2,{type:'attack'}).state;assert.equal(n2.battle.enemy.hp,m2.battle.enemy.hp);
});
test('BD28 chest receipt remains one candidate and rejects duplicate activation',()=>{
 let s=exampleRun(c);s.phase='chest';s.pos=10;s.bag=['BD28'];s.chest={pos:10,shown:['AR02','SW02']};s.chests[10]={opened:true,shown:['AR02','SW02'],taken:null};
 s=dispatch(c,s,{type:'pickChest',index:0}).state;assert.equal(s.prompt.kind,'gearConfirm');s=JSON.parse(JSON.stringify(s));s=dispatch(c,s,{type:'confirmGear',itemId:'BD28'}).state;assert.equal(s.chests[10].taken,'AR02');assert.equal(s.gear.some(g=>g.id==='SW02'),false);assert.equal(s.reservations[0].rules[0].effects[0].op,'reduceDamage');assert.throws(()=>dispatch(c,s,{type:'confirmGear',itemId:'BD28'}));
});
test('BD46 guard declaration reduces first direct hit only when opening guard matches',()=>{
 const b=startBattle(base,exampleRun(base),'MB01',{die:4});b.state.bag=['BD46'];
 const n=dispatch(b.content,b.state,{type:'challenge'}).state,m=dispatch(b.content,b.state,{type:'challenge',itemId:'BD46',params:{declaration:'guard'}}).state;
 const ng=dispatch(b.content,n,{type:'guard'}).state,mg=dispatch(b.content,m,{type:'guard'}).state;
 const loss=n.hp-ng.hp;assert.ok(loss>0);assert.equal(mg.hp-ng.hp,Math.min(12,loss));
 const na=dispatch(b.content,n,{type:'attack'}).state,ma=dispatch(b.content,m,{type:'attack'}).state;assert.equal(na.hp,ma.hp);
});
test('BD46 guard protection is spent on first direct hit even when it already deals zero',()=>{const b=startBattle(base,exampleRun(base),'MB01');b.state.bag=['BD46'];let s=dispatch(b.content,b.state,{type:'challenge',itemId:'BD46',params:{declaration:'guard'}}).state;s.battle.current.rawDamage=0;s.battle.current.attack=1;s=dispatch(b.content,s,{type:'guard'}).state;assert.equal(s.battle.marks.some(m=>m.id==='BD46-guard'),false);});
