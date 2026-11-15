import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../src/engine/index.js';
import { completionReport } from '../tools/validate-content.mjs';
import { exampleRun, getContent, place, walk } from './fixtures/helpers.mjs';
const c = await getContent();
const base = exampleRun(c,'M');
function use(id,patch={},params={}) {
 const s=walk(c,place(base,base.board.innPositions[1]-1,{bag:[id],...patch}),1).state;
 return dispatch(c,s,{type:'useItem',itemId:id,params}).state;
}
test('typed item choice, payments, threshold and overflow retain individual effects',()=>{
 assert.equal(use('HE04',{hp:10,mp:0},{which:'hp'}).hp,21);
 assert.equal(use('HE04',{hp:10,mp:0},{which:'mp'}).mp,4);
 assert.equal(use('HE12',{hp:10,mp:3}).hp,30);
 assert.equal(use('HE12',{hp:10,mp:3}).mp,0);
 assert.throws(()=>use('HE12',{hp:10,mp:2}));
 assert.equal(use('HE13',{hp:5,mp:0}).hp,1);
 assert.throws(()=>use('HE13',{hp:4,mp:0}));
 assert.equal(use('HE06',{hp:10}).hp,28);
 assert.equal(use('HE06',{hp:20}).hp,28);
 assert.equal(use('HE25',{hp:38,mp:0}).mp,4);
 assert.equal(use('HE25',{hp:38,mp:0}).hp,40);
 assert.equal(use('HE35',{hp:1,mp:0},{hpRooms:2}).hp,13);
 assert.equal(use('HE35',{hp:1,mp:0},{hpRooms:2}).mp,2);
 assert.equal(use('HE50',{hp:1,mp:0}).hp,20);
 assert.equal(use('HE50',{hp:1,mp:0}).mp,5);
 assert.throws(()=>use('HE50',{hp:20,mp:5}));
});
test('release gate refuses sample coverage, missing scripts, unwired features and browser omissions',()=>{
 const missingItems={...c.scripts.items};delete missingItems.HE01;
 const report=completionReport({...c,scripts:{...c.scripts,items:missingItems}},{events:[],items:[],equipment:[]});
 assert.equal(report.complete,false);
 assert.ok(report.problems.some(p=>p.code==='coverage-incomplete'));
 assert.ok(report.problems.some(p=>p.code==='manifest-missing'));
 const fake={...c,problems:[{level:'warn',code:'script-hook-unwired',message:'reserved'}]};
 assert.ok(completionReport(fake,{}).problems.some(p=>p.code==='script-hook-unwired'&&p.level==='error'));
 const source={...c.scriptSource,items:{...c.scriptSource.items,HE01:'_samples-items.json'}};
 assert.ok(completionReport({...c,scriptSource:source},{}).coverage.items.missing.includes('HE01'));
});

import { startBattle, cl } from './fixtures/helpers.mjs';
function equipped(id) {
 const s=cl(base);
 s.gear.push({iid:'test-gear',id,paidGold:null,from:'test'});
 s.equipped[id.startsWith('SW')?'sword':'armor']='test-gear';
 return s;
}
function durableBattle(id,enemy='EN09') {
 const b=startBattle(c,equipped(id),enemy,{die:5});
 b.state.battle.enemy.hp=1000;b.state.battle.enemy.maxHp=1000;
 return b;
}
test('authored SW02 bonus fires only first round, SW39 only third landed normal hit',()=>{
 for(const [id,expected] of [['SW02',[true,false,false,false]],['SW39',[false,false,true,false]]]){
  const b=durableBattle(id);let s=b.state;
  for(const fires of expected){
   s.hp=40;
   const out=dispatch(b.content,s,{type:'attack'});
   assert.equal(out.effects.some(e=>e.t==='rule'&&e.id===id),fires,`${id} round ${s.battle.round}`);
   s=out.state;
  }
 }
});
test('authored AR09 limit and AR34 ordered reduction are equipment rules, not generic item approximations',()=>{
 const b=durableBattle('AR09');let s=b.state;
 for(let n=0;n<4;n++){
  s.hp=40;s.mp=10;
  const out=dispatch(b.content,s,{type:'guard'});
  assert.equal(out.effects.some(e=>e.t==='rule'&&e.id==='AR09'),n===0);
  s=out.state;
 }
 const q=durableBattle('AR34');s=q.state;
 const fired=[];
 for(let n=0;n<10;n++){
  s.hp=40;
  const out=dispatch(q.content,s,{type:'attack'});
  fired.push(out.effects.filter(e=>e.t==='rule'&&String(e.id).startsWith('AR34')).map(e=>e.id));
  s=out.state;
 }
 assert.deepEqual(fired.flat(),['AR34','AR34-second','AR34-third']);
 assert.deepEqual(fired.slice(1,3),[[],[]]); // non-normal actions never consume the sequence
});
import { rollDie } from './fixtures/helpers.mjs';
test('authored BD12/BD31 map raw dice once and BD21 rejects odd faces without consumption',()=>{
 for(const [id,table] of [['BD12',[2,2,4,4,6,6]],['BD31',[3,2,3,4,5,4]]]){
  for(let face=1;face<=6;face++){
   const s=place(base,10,{bag:[id]});
   const prepared=dispatch(c,s,{type:'useItem',itemId:id}).state;
   const rolled=rollDie(c,prepared,face).state;
   assert.equal(rolled.roll.die,table[face-1]);
   assert.equal(rolled.turn.adjustUsed,true);
  }
 }
 const s=rollDie(c,place(base,10,{bag:['BD21']}),3).state;
 assert.throws(()=>dispatch(c,s,{type:'useItem',itemId:'BD21'}));
 assert.deepEqual(s.bag,['BD21']);
 const even=rollDie(c,place(base,10,{bag:['BD21']}),6).state;
 assert.equal(dispatch(c,even,{type:'useItem',itemId:'BD21'}).state.roll.die,3);
});
test('authored HE47 validates chosen extra recovery item and consumes exactly two items',()=>{
 const out=use('HE47',{hp:1,mp:0,bag:['HE47','HE02','AT01']},{partner:'HE02'});
 assert.deepEqual(out.bag,['AT01']);assert.equal(out.hp,29);
 assert.throws(()=>use('HE47',{hp:1,mp:0,bag:['HE47','AT01']},{partner:'AT01'}));
 assert.throws(()=>use('HE47',{hp:1,mp:0,bag:['HE47']},{partner:'HE02'}));
});
test('release gate rejects unknown hook/op/ref/where even without precomputed loader diagnostics',()=>{
 const scripts=cl(c.scripts);
 scripts.items.HE01={uses:[{where:['invented-context'],effects:[{op:'unregistered'}]}]};
 scripts.equipment.SW01={rules:[{hook:'not-a-hook',when:{ref:'missing-ref'},effects:[]}]};
 const report=completionReport({...c,scripts,problems:[]},{});
 assert.equal(report.complete,false);
 for(const label of ['where invented-context','op unregistered','hook not-a-hook','ref missing-ref'])
  assert.ok(report.problems.some(p=>p.code==='vocabulary-unavailable'&&p.message.endsWith(label)),label);
});
test('authored AR04 and AR44 use intended HP and actual capped MP exactly once',()=>{
 for(const [gear,item,hpStart,mpStart,expected] of [['AR04','HE01',1,0,15],['AR44','HE02',1,8,1]]){
  const b=durableBattle(gear);b.state.hp=hpStart;b.state.mp=mpStart;b.state.bag=[item,item];
  const out=dispatch(b.content,b.state,{type:'item',itemId:item});
  assert.ok(out.effects.some(e=>e.t==='hp'&&e.delta===expected));
  assert.equal(out.effects.filter(e=>e.t==='rule'&&e.id===gear).length,1);
  out.state.hp=1;out.state.mp=0;
  const second=dispatch(b.content,out.state,{type:'item',itemId:item});
  assert.equal(second.effects.filter(e=>e.t==='rule'&&e.id===gear).length,0);
 }
});
test('authored AT42 triggers from a healing spell paid to zero, not only damaging spells',()=>{
 const b=durableBattle('SW01');const heal=Object.values(c.spells).find(x=>x.kind==='heal');
 b.state.hp=10;b.state.mp=heal.mpCost;b.state.bag=['AT42'];b.state.spells={learned:[heal.id],prepared:[heal.id]};
 let out=dispatch(b.content,b.state,{type:'item',itemId:'AT42'});
 out.state.hp=10;
 const before=out.state.battle.enemy.hp;
 out=dispatch(b.content,out.state,{type:'spell',spellId:heal.id});
 assert.equal(before-out.state.battle.enemy.hp,18);
 assert.ok(out.effects.some(e=>e.t==='rule'&&e.id==='AT42'));
 const noMp=durableBattle('SW01');noMp.state.mp=0;noMp.state.bag=['AT42'];
 assert.throws(()=>dispatch(noMp.content,noMp.state,{type:'item',itemId:'AT42'}));
});
test('authored SW18 requires actual previous spell recovery; AR42 requires recovery reaching full',()=>{
 const heal=Object.values(c.spells).find(x=>x.kind==='heal');
 for(const missing of [0,2]){
  const b=durableBattle('SW18');b.state.hp=40-missing;b.state.spells={learned:[heal.id],prepared:[heal.id]};
  if(missing===0){
   assert.throws(()=>dispatch(b.content,b.state,{type:'spell',spellId:heal.id}),/hp_full/);
   const hit=dispatch(b.content,b.state,{type:'attack'});
   assert.equal(hit.effects.some(e=>e.t==='rule'&&e.id==='SW18'),false);continue;
  }
  const first=dispatch(b.content,b.state,{type:'spell',spellId:heal.id});
  first.state.hp=40;
  const hit=dispatch(b.content,first.state,{type:'attack'});
  assert.equal(hit.effects.some(e=>e.t==='rule'&&e.id==='SW18'),missing>0);
 }
 for(const hpBefore of [1,38,40]){
  const b=durableBattle('AR42');b.state.hp=hpBefore;b.state.bag=['HE01'];
  const out=dispatch(b.content,b.state,{type:'item',itemId:'HE01'});
  assert.equal(out.effects.some(e=>e.t==='rule'&&e.hook==='hpRestored'&&e.id==='AR42-arm'),hpBefore===38);
 }
});
test('all 100 canonical equipment IDs have individual typed rules; only starter gear has no extra effect',()=>{
 assert.equal(Object.keys(c.scripts.equipment).length,100);
 assert.deepEqual(Object.keys(c.gear).filter(id=>!c.scripts.equipment[id]),[]);
 assert.deepEqual(Object.keys(c.scripts.equipment).filter(id=>c.scripts.equipment[id].rules.length===0).sort(),['AR01','SW01']);
 assert.equal(c.problems.filter(p=>p.level==='error').length,0);
});
test('authored AT50 preserves next attack reward even if enemy does not attack; expiry excludes later turns',()=>{
 const b=durableBattle('SW01');b.state.bag=['AT50'];
 // isolate a legal non-attacking current tell without replacing item scripts
 b.state.battle.current.attack=0;
 b.state.battle.rounds[0].enemyAction.attack=0;
 let out=dispatch(b.content,b.state,{type:'item',itemId:'AT50'});
 out.state.hp=40;
 let hit=dispatch(b.content,out.state,{type:'attack'});
 assert.ok(hit.effects.some(e=>e.t==='rule'&&e.id==='AT50-strike'));
 const guarded=dispatch(b.content,out.state,{type:'guard'});
 guarded.state.hp=40;
 hit=dispatch(b.content,guarded.state,{type:'attack'});
 assert.equal(hit.effects.some(e=>e.t==='rule'&&e.id==='AT50-strike'),false);
});
test('AR42 non-attacking full-heal round does not spend the once-per-battle hit reduction',()=>{
 const b=durableBattle('AR42');b.state.bag=['HE01','HE01','HE01'];b.state.hp=38;
 b.state.battle.current.attack=0;b.state.battle.rounds[0].enemyAction.attack=0;
 let out=dispatch(b.content,b.state,{type:'item',itemId:'HE01'});
 assert.equal(out.effects.some(e=>e.t==='rule'&&e.hook==='enemyDamage'&&e.id==='AR42'),false);
 out.state.hp=38;out.state.battle.current.attack=30;out.state.battle.rounds[1].enemyAction.attack=30;
 out=dispatch(b.content,out.state,{type:'item',itemId:'HE01'});
 assert.equal(out.effects.some(e=>e.t==='rule'&&e.hook==='enemyDamage'&&e.id==='AR42'),true);
 out.state.hp=38;out.state.battle.current.attack=30;out.state.battle.rounds[2].enemyAction.attack=30;
 out=dispatch(b.content,out.state,{type:'item',itemId:'HE01'});
 assert.equal(out.effects.some(e=>e.t==='rule'&&e.hook==='enemyDamage'&&e.id==='AR42'),false);
});
test('AR22 damage-item preparation on a non-attacking round does not spend the ward',()=>{
 const b=durableBattle('AR22');b.state.bag=['AT01','AT01','AT01'];
 b.state.battle.current.attack=0;b.state.battle.rounds[0].enemyAction.attack=0;
 let out=dispatch(b.content,b.state,{type:'item',itemId:'AT01'});
 assert.equal(out.effects.some(e=>e.t==='rule'&&e.hook==='enemyDamage'&&e.id==='AR22'),false);
 out.state.hp=40;out.state.battle.current.attack=30;out.state.battle.rounds[1].enemyAction.attack=30;
 out=dispatch(b.content,out.state,{type:'item',itemId:'AT01'});
 assert.equal(out.effects.some(e=>e.t==='rule'&&e.hook==='enemyDamage'&&e.id==='AR22'),true);
 out.state.hp=40;out.state.battle.current.attack=30;out.state.battle.rounds[2].enemyAction.attack=30;
 out=dispatch(b.content,out.state,{type:'item',itemId:'AT01'});
 assert.equal(out.effects.some(e=>e.t==='rule'&&e.hook==='enemyDamage'&&e.id==='AR22'),false);
});
test('AT47 snapshots the rounded HP payment, leaves at least one HP and clears temporary amount',()=>{
 for(const [hpBefore,payment] of [[5,2],[39,10]]){
  const b=durableBattle('SW01');b.state.hp=hpBefore;b.state.bag=['AT47'];
  b.state.battle.current.attack=0;b.state.battle.rounds[0].enemyAction.attack=0;
  const enemyBefore=b.state.battle.enemy.hp;
  const out=dispatch(b.content,b.state,{type:'item',itemId:'AT47'});
  assert.equal(out.state.hp,hpBefore-payment);
  assert.equal(enemyBefore-out.state.battle.enemy.hp,6+payment*2);
  assert.equal(out.state.flags['item.AT47.payment'],false);
 }
 const b=durableBattle('SW01');b.state.hp=1;b.state.bag=['AT47'];
 assert.throws(()=>dispatch(b.content,b.state,{type:'item',itemId:'AT47'}));
 assert.equal(b.state.hp,1);assert.deepEqual(b.state.bag,['AT47']);
});
test('SW42 rewards defeating an announced big move before it acts, not reflection after it acted',()=>{
 for(const reflect of [false,true]){
  const b=durableBattle('SW42');b.state.hp=40;b.state.bag=['AT08'];b.state.battle.enemy.hp=2;
  b.state.battle.current.kind='大技';b.state.battle.current.attack=20;
  b.state.battle.rounds[0].enemyAction.kind='大技';b.state.battle.rounds[0].enemyAction.attack=20;
  const out=dispatch(b.content,b.state,reflect?{type:'item',itemId:'AT08'}:{type:'attack'});
  assert.equal(out.effects.some(e=>e.t==='rule'&&e.id==='SW42'),!reflect);
 }
});
import { withScripts } from './fixtures/helpers.mjs';
test('AT27 copies capped actual direct damage including same-hit bonus but excludes extra hits and companions',()=>{
 for(const bonus of [0,4,40]){
  const b=durableBattle('SW01');b.state.bag=['AT27'];b.state.companions=['CP03'];
  b.state.battle.current.kind='反撃の隙';b.state.battle.current.attack=0;
  b.state.battle.rounds[0].enemyAction.kind='反撃の隙';b.state.battle.rounds[0].enemyAction.attack=0;
  const cc=withScripts(b.content,{equipment:{SW01:{rules:[
   {id:'copy-test-bonus',hook:'heroAttackDamage',when:{eq:[{ref:'battle.attackKind'},'attack']},effects:[{op:'addDamage',amount:bonus}]},
   {id:'copy-test-extra',hook:'heroHit',when:{eq:[{ref:'battle.attackKind'},'attack']},effects:[{op:'dealDamage',amount:7}]}
  ]}}});
  const before=b.state.battle.enemy.hp;
  let out=dispatch(cc,b.state,{type:'attack'});
  const direct=out.state.battle.rounds[0].attackDamageDealt;
  assert.equal(before-out.state.battle.enemy.hp,direct+7+6);
  out.state.battle.current.kind='通常攻撃';out.state.battle.current.attack=0;
  const beforeCopy=out.state.battle.enemy.hp;
  out=dispatch(cc,out.state,{type:'item',itemId:'AT27'});
  assert.equal(beforeCopy-out.state.battle.enemy.hp,Math.min(18,direct));
  assert.equal(out.effects.some(e=>e.t==='rule'&&e.id==='copy-test-extra'),false);
  assert.equal(out.effects.some(e=>e.t==='rule'&&e.id==='copy-test-bonus'),false);
 }
 const b=durableBattle('SW01');b.state.bag=['AT27'];b.state.battle.current.immune=true;
 let out=dispatch(b.content,b.state,{type:'attack'});
 assert.equal(out.state.battle.rounds[0].attackDamageDealt||0,0);
 out.state.battle.current.immune=false;
 const before=out.state.battle.enemy.hp;
 out=dispatch(b.content,out.state,{type:'item',itemId:'AT27'});
 assert.equal(before-out.state.battle.enemy.hp,0);
});
test('AR38 and AR48 remain available after preparation without an enemy hit, then consume once',()=>{
 for(const gid of ['AR38','AR48']){
  const b=durableBattle(gid);const sp=Object.values(c.spells).find(x=>x.kind==='attack');
  let out=dispatch(b.content,b.state,{type:'guard'});
  for(let trial=0;trial<3;trial++){
   const s=out.state;s.hp=40;s.mp=10;s.spells={learned:[sp.id],prepared:[sp.id]};
   const prev=s.battle.rounds[s.battle.round-2];
   prev.action={type:'attack'};prev.landed=true;prev.enemyAction.kind='大技';prev.enemyActed=true;
   s.battle.current.attack=trial===0?0:30;s.battle.rounds[s.battle.round-1].enemyAction.attack=s.battle.current.attack;
   out=dispatch(b.content,s,gid==='AR38'?{type:'spell',spellId:sp.id}:{type:'attack'});
   assert.equal(out.effects.some(e=>e.t==='rule'&&e.hook==='enemyDamage'&&e.id===gid),trial===1,`${gid} trial ${trial}`);
  }
 }
});
test('AT34 copies ceil(actual attack-spell damage / 2) capped at 16, with no extra/companion replay',()=>{
 const sp=Object.values(c.spells).find(x=>x.kind==='attack');
 for(const bonus of [1,40]){
  const b=durableBattle('SW01');b.state.bag=['AT34'];b.state.spells={learned:[sp.id],prepared:[sp.id]};b.state.companions=['CP03'];
  b.state.battle.current.kind='反撃の隙';b.state.battle.current.attack=0;b.state.battle.rounds[0].enemyAction.kind='反撃の隙';
  const cc=withScripts(b.content,{equipment:{SW01:{rules:[
   {id:'spell-copy-bonus',hook:'heroAttackDamage',when:{eq:[{ref:'battle.attackKind'},'spell']},effects:[{op:'addDamage',amount:bonus}]},
   {id:'spell-copy-extra',hook:'heroHit',when:{eq:[{ref:'battle.attackKind'},'spell']},effects:[{op:'dealDamage',amount:7}]}
  ]}}});
  const before=b.state.battle.enemy.hp;let out=dispatch(cc,b.state,{type:'spell',spellId:sp.id});
  const direct=out.state.battle.rounds[0].spellDamageDealt;
  assert.equal(before-out.state.battle.enemy.hp,direct+7+6);
  out.state.mp=0;out.state.battle.current.kind='通常攻撃';out.state.battle.current.attack=0;
  const beforeCopy=out.state.battle.enemy.hp;
  out=dispatch(cc,out.state,{type:'item',itemId:'AT34'});
  assert.equal(beforeCopy-out.state.battle.enemy.hp,Math.min(16,Math.ceil(direct/2)));
  assert.equal(out.state.mp,2);
  assert.equal(out.effects.some(e=>e.t==='rule'&&e.id==='spell-copy-extra'),false);
 }
 const b=durableBattle('SW01');b.state.bag=['AT34'];b.state.spells={learned:[sp.id],prepared:[sp.id]};b.state.battle.current.immune=true;
 let out=dispatch(b.content,b.state,{type:'spell',spellId:sp.id});
 assert.equal(out.state.battle.rounds[0].spellDamageDealt||0,0);
 out.state.battle.current.immune=false;out.state.mp=0;
 const before=out.state.battle.enemy.hp;out=dispatch(b.content,out.state,{type:'item',itemId:'AT34'});
 assert.equal(before-out.state.battle.enemy.hp,0);assert.equal(out.state.mp,2);
 const h=durableBattle('SW01');const heal=Object.values(c.spells).find(x=>x.kind==='heal');
 h.state.hp=10;h.state.bag=['AT34'];h.state.spells={learned:[heal.id],prepared:[heal.id]};
 out=dispatch(h.content,h.state,{type:'spell',spellId:heal.id});
 assert.throws(()=>dispatch(h.content,out.state,{type:'item',itemId:'AT34'}));
});
test('BD08/BD30 authored information expires after exactly 3/2 confirmed moves and never regenerates data',()=>{
 for(const [id,lifetime] of [['BD08',3],['BD30',2]]){
  let s=place(base,10,{bag:[id]});s=dispatch(c,s,{type:'useItem',itemId:id}).state;
  const kind=id==='BD08'?'squaresAhead':'sixOutcomes';
  const original=cl(s.reveals.find(r=>r.kind===kind).data);
  for(let n=1;n<=lifetime;n++){
   s=walk(c,place(s,s.pos),1).state;
   const reveal=s.reveals.find(r=>r.kind===kind);
   if(n<lifetime){assert.equal(reveal.remainingMoves,lifetime-n);assert.deepEqual(reveal.data,original);}
   else assert.equal(reveal,undefined);
  }
 }
});
function multihit(id,hits=3,raw=8){const b=durableBattle('SW01');b.state.hp=40;b.state.bag=[id];Object.assign(b.state.battle.current,{hits,rawDamage:raw,attack:0,kind:'通常攻撃'});Object.assign(b.state.battle.rounds[0].enemyAction,{hits,rawDamage:raw,attack:0,kind:'通常攻撃'});return b;}
test('AT13/16/25/26 preserve individual-hit versus cumulative limits on three hits',()=>{
 for(const [id,hpLoss] of [['AT13',16],['AT16',15],['AT25',16],['AT26',12]]){
  const b=multihit(id);const enemy=b.state.battle.enemy.hp;
  const out=dispatch(b.content,b.state,{type:'item',itemId:id});
  assert.equal(40-out.state.hp,hpLoss,id);
  if(id==='AT25')assert.equal(enemy-out.state.battle.enemy.hp,8);
  if(id==='AT16'){
   assert.equal(out.state.flags['item.AT16.reduced'],9);
   out.state.hp=40;const hit=dispatch(b.content,out.state,{type:'attack'});
   assert.ok(hit.effects.some(e=>e.t==='rule'&&e.id==='AT16-counter'));
  }
 }
});
test('AT03 reflects once per action, AT08 only the first direct hit, AT43 counts actual damaging hits',()=>{
 for(const [id,reflected] of [['AT03',4],['AT08',8]]){
  const b=multihit(id);const before=b.state.battle.enemy.hp;
  const out=dispatch(b.content,b.state,{type:'item',itemId:id});
  assert.equal(before-out.state.battle.enemy.hp,reflected,id);
 }
 const b=multihit('AT43');let out=dispatch(b.content,b.state,{type:'guard'});
 assert.equal(out.state.battle.rounds[0].hitsTaken,3);
 out.state.hp=40;const before=out.state.battle.enemy.hp;
 out=dispatch(b.content,out.state,{type:'item',itemId:'AT43'});
 assert.equal(before-out.state.battle.enemy.hp,22);
});
test('AT15 rejects multi-hit attacks and AT22 explodes before the second enemy action',()=>{
 const b=multihit('AT15');assert.throws(()=>dispatch(b.content,b.state,{type:'item',itemId:'AT15'}));
 const one=multihit('AT15',1);assert.equal(dispatch(one.content,one.state,{type:'item',itemId:'AT15'}).state.hp,40);
 const bomb=multihit('AT22',1,1);bomb.state.battle.enemy.hp=15;
 let out=dispatch(bomb.content,bomb.state,{type:'item',itemId:'AT22'});
 assert.equal(out.state.battle.enemy.hp,15);
 out=dispatch(bomb.content,out.state,{type:'guard'});
 assert.ok(out.effects.some(e=>e.t==='rule'&&e.id==='AT22-explode'));
 assert.equal(out.effects.some(e=>e.t==='enemyAct'),false);
});
test('AT32 subtracts at most twelve actual planned enemy healing across two actions',()=>{
 const b=durableBattle('SW01');b.state.bag=['AT32'];b.state.battle.enemy.hp=100;
 Object.assign(b.state.battle.current,{attack:0,heal:10});
 let out=dispatch(b.content,b.state,{type:'item',itemId:'AT32'});
 assert.equal(out.state.battle.enemy.hp,93);
 Object.assign(out.state.battle.current,{attack:0,heal:10});
 out=dispatch(b.content,out.state,{type:'guard'});
 assert.equal(out.state.battle.enemy.hp,101);
 assert.equal(out.state.battle.marks.some(m=>m.id==='AT32'),false);
});
test('AT39 cancels normal enemy self-healing, limits boss prevention to ten, otherwise deals ten',()=>{
 for(const [king,heal,expectedDelta] of [[false,20,0],[true,20,10],[false,0,-10]]){
  const b=durableBattle('SW01');b.state.bag=['AT39'];b.state.battle.enemy.hp=100;
  if(king)b.state.battle.kind='king';
  Object.assign(b.state.battle.current,{attack:0,heal});
  const out=dispatch(b.content,b.state,{type:'item',itemId:'AT39'});
  assert.equal(out.state.battle.enemy.hp,100+expectedDelta);
 }
});
test('SW33/AR06/AR18 react to an individual hit, not an aggregated multi-hit action',()=>{
 const sword=durableBattle('SW33');sword.state.mp=0;Object.assign(sword.state.battle.current,{hits:3,rawDamage:8,attack:0});
 let out=dispatch(sword.content,sword.state,{type:'guard'});
 assert.equal(out.state.mp,4); // first guarded hit lost four, not cumulative twelve
 const armor=durableBattle('AR18');armor.state.hp=21;Object.assign(armor.state.battle.current,{hits:2,rawDamage:11,attack:0});
 out=dispatch(armor.content,armor.state,{type:'attack'});
 assert.equal(out.state.hp,3); // 21 - 11 + 4 - 11: rescue between hits
 const thorn=durableBattle('AR06');Object.assign(thorn.state.battle.current,{hits:3,rawDamage:8,attack:0});
 out=dispatch(thorn.content,thorn.state,{type:'guard'});
 assert.equal(out.effects.filter(e=>e.t==='rule'&&e.id==='AR06'&&e.hook==='afterEnemyHit').length,1);
});
test('BD48 prediction uses raw die even after another permitted die adjustment changes its size group',()=>{
 let s=place(base,10,{bag:['BD48','BD01'],hp:20,mp:0});
 s=dispatch(c,s,{type:'useItem',itemId:'BD48',params:{prediction:'large'}}).state;
 s=rollDie(c,s,4).state;
 s=dispatch(c,s,{type:'useItem',itemId:'BD01',params:{delta:-1}}).state;
 const moved=dispatch(c,s,{type:'move'});
 assert.ok(moved.effects.some(e=>e.t==='mp'&&e.delta===6));
 assert.equal(moved.effects.some(e=>e.t==='hp'&&e.delta===12),false);
});
test('HE20 heals and flees atomically without battle rewards; forbidden fights do not consume it',()=>{
 const b=durableBattle('SW01');b.state.hp=5;b.state.mp=0;b.state.bag=['HE20'];
 const gold=b.state.gold;
 const out=dispatch(b.content,b.state,{type:'flee',itemId:'HE20'});
 assert.equal(out.state.hp,17);assert.equal(out.state.mp,3);assert.deepEqual(out.state.bag,[]);assert.equal(out.state.gold,gold);
 assert.equal(out.effects.some(e=>e.t==='rewards'),false);
 const forbidden=durableBattle('SW01');forbidden.state.battle.kind='optional';forbidden.state.bag=['HE20'];
 assert.throws(()=>dispatch(forbidden.content,forbidden.state,{type:'flee',itemId:'HE20'}));
 assert.deepEqual(forbidden.state.bag,['HE20']);
});
test('HE34 counts enemy actions, is usable once at victory, and cannot duplicate rewards',()=>{
 const b=durableBattle('SW01');let s=b.state;s.bag=['HE34','HE34'];
 for(let i=0;i<3;i++){s.hp=40;s=dispatch(b.content,s,{type:'guard'}).state;}
 s.battle.enemy.hp=1;s.hp=40;
 let out=dispatch(b.content,s,{type:'attack'});s=out.state;assert.equal(s.phase,'battleReward');
 const gold=s.gold;s.hp=1;s.mp=0;
 out=dispatch(b.content,s,{type:'useItem',itemId:'HE34'});
 assert.equal(out.state.hp,13);assert.equal(out.state.mp,3);assert.equal(out.state.gold,gold);
 assert.equal(out.effects.some(e=>e.t==='rewards'),false);
 assert.throws(()=>dispatch(b.content,out.state,{type:'useItem',itemId:'HE34'}));
});
test('HE38 counts only actual guard and companion-shield reductions, not gear or die, capped at eighteen',()=>{
 const b=durableBattle('AR41');b.state.bag=['HE38'];Object.assign(b.state.battle.current,{kind:'大技',rawDamage:20,attack:0});b.state.battle.rounds[0].enemyAction.kind='大技';b.state.battle.dieBonus={kind:'soften',amount:5,used:false};
 let out=dispatch(b.content,b.state,{type:'guard'});
 assert.equal(out.state.battle.rounds[0].guardShieldReduced,10);
 assert.equal(out.state.battle.rounds[0].reduced,20);
 out.state.hp=1;out.state.battle.current.attack=0;
 out=dispatch(b.content,out.state,{type:'item',itemId:'HE38'});assert.equal(out.state.hp,11);
 const multi=durableBattle('SW01');multi.state.bag=['HE38'];multi.state.companions=['CP01'];Object.assign(multi.state.battle.current,{kind:'大技',hits:3,rawDamage:20,attack:0});multi.state.battle.rounds[0].enemyAction.kind='大技';
 out=dispatch(multi.content,multi.state,{type:'guard'});assert.equal(out.state.battle.rounds[0].guardShieldReduced,45);
 out.state.hp=1;out.state.battle.current.attack=0;
 out=dispatch(multi.content,out.state,{type:'item',itemId:'HE38'});assert.equal(out.state.hp,19);
 const zero=durableBattle('SW01');zero.state.bag=['HE38'];out=dispatch(zero.content,zero.state,{type:'attack'});
 assert.throws(()=>dispatch(zero.content,out.state,{type:'item',itemId:'HE38'}));
});
test('AT20 links only actual current-round companion healing, capped at twelve without extra support',()=>{
 for(const amount of [4,15]){
  const b=durableBattle('SW01');b.state.hp=10;b.state.bag=['AT20'];b.state.companions=['CP02'];b.state.battle.current.attack=0;
  const cc={...b.content,companions:{...b.content.companions,CP02:{...b.content.companions.CP02,effect:{...b.content.companions.CP02.effect,healHp:amount}}}};
  const before=b.state.battle.enemy.hp;const out=dispatch(cc,b.state,{type:'item',itemId:'AT20'});
  assert.equal(before-out.state.battle.enemy.hp,5+Math.min(12,amount));
  assert.equal(out.effects.filter(e=>e.t==='companion'&&e.id==='CP02').length,1);
 }
 const b=durableBattle('SW01');b.state.hp=40;b.state.bag=['AT20'];b.state.companions=['CP02'];b.state.battle.current.attack=0;
 let out=dispatch(b.content,b.state,{type:'item',itemId:'AT20'});
 assert.equal(out.effects.some(e=>e.t==='rule'&&e.id==='AT20'),false);
 out.state.hp=10;out=dispatch(b.content,out.state,{type:'guard'});
 assert.equal(out.effects.some(e=>e.t==='rule'&&e.id==='AT20'),false);
});
test('SW19 half-HP crossing on a non-attacking round leaves its one hit ward available',()=>{
 const b=durableBattle('SW19');let s=b.state;
 for(let i=0;i<3;i++){
  s.hp=40;s.battle.enemy.hp=501;s.battle.current.attack=i===0?0:30;
  s.battle.rounds[s.battle.round-1].enemyAction.attack=s.battle.current.attack;
  const out=dispatch(b.content,s,{type:'attack'});
  assert.equal(out.effects.some(e=>e.t==='rule'&&e.hook==='enemyDamage'&&e.id==='SW19'),i===1);
  s=out.state;
 }
});

import {withSquare} from './fixtures/helpers.mjs';
test('seven real board-item definitions validate input and dispatch without sample overrides',()=>{
 const cases=[['BD03','B1-16',{pos:2}],['BD10',Object.values(c.events).find(e=>e.kind==='戦闘'&&e.refs.includes('EN01')).id,{pos:2}],['BD13','M1-42',{pos:2}],['BD15','F3-33',{pos:2}],['BD24',Object.values(c.events).find(e=>e.refs.includes('MB01')).id,{}],['BD32',Object.values(c.events).find(e=>e.kind==='罠').id,{pos:2}],['BD47',Object.values(c.events).find(e=>e.kind==='装備').id,{kind:'装備'}]];
 for(const [id,eventId,params] of cases){
  let s=withSquare(place(exampleRun(c),1),2,eventId);s.bag=[id];s.board.innPositions=[10];s.inns={10:{visited:false}};
  const before=JSON.stringify(s);const out=dispatch(c,s,{type:'useItem',itemId:id,params}).state;
  assert.equal(JSON.stringify(s),before,id+' input immutable');assert.equal(out.bag.includes(id),false,id+' consumed exactly once');
  if(id==='BD10')assert.equal(out.reservations.at(-1).pos,2);
  else if(id==='BD32')assert.equal(out.reservations.at(-1).slot,'targetTrapHalf');
  else assert.equal(out.reveals.at(-1).kind,id);
  if('pos' in params)assert.throws(()=>dispatch(c,s,{type:'useItem',itemId:id,params:{pos:100}}),id+' invalid position');
 }
});
test('HE16 counts the bag after consuming itself and preserves each threshold',()=>{
 for(const [left,heal] of [[0,21],[1,21],[2,16],[3,16],[4,10],[5,10]]){
  const s=use('HE16',{hp:1,bag:['HE16',...Array(left).fill('AT01')]});
  assert.equal(s.hp,1+heal,`remaining ${left}`);assert.equal(s.bag.length,left);
 }
});
test('HE28 authored delayed heal waits until the second subsequent hero turn and fires once',()=>{
 let s=durableBattle('SW01','EN03').state;s.bag=['HE28'];s.hp=25;
 let out=dispatch(c,s,{type:'item',itemId:'HE28'});assert.ok(!out.effects.some(e=>e.t==='hp'&&e.delta===24));
 out=dispatch(c,out.state,{type:'guard'});assert.ok(!out.effects.some(e=>e.t==='hp'&&e.delta===24));
 out.state.hp=1;out=dispatch(c,out.state,{type:'guard'});assert.ok(out.effects.some(e=>e.t==='hp'&&e.delta===24));
 out=dispatch(c,out.state,{type:'guard'});assert.ok(!out.effects.some(e=>e.t==='hp'&&e.delta===24));
});
test('HE29 uses actual prepared spell cost and rejects unprepared spells without consumption',()=>{
 const spells={...cl(base.spells),prepared:['SP01']};
 assert.equal(use('HE29',{hp:1,mp:0,spells},{spellId:'SP01'}).mp,4);
 assert.equal(use('HE29',{hp:1,mp:7,spells},{spellId:'SP01'}).mp,7);
 assert.equal(use('HE29',{hp:1,mp:7,spells},{spellId:'SP01'}).hp,5);
 assert.equal(use('HE29',{hp:1,mp:0,job:'JB02',spells},{spellId:'SP01'}).mp,2);
 assert.throws(()=>use('HE29',{hp:1,mp:0,spells},{spellId:'SP04'}));
});
test('AT23 actual definition guards while retaining the item history',()=>{
 const s=durableBattle('SW01').state;s.bag=['AT23'];const out=dispatch(c,s,{type:'item',itemId:'AT23'}).state;
 assert.equal(out.battle.rounds[0].guarded,true);assert.equal(out.battle.rounds[0].action.type,'item');assert.equal(out.battle.rounds[0].action.itemId,'AT23');
});
test('BD27 reserves only actually received ordinary rest HP and keeps the same amount',()=>{
 const inn=(hp)=>walk(c,place(base,base.board.innPositions[1]-1,{hp,mp:0,bag:['BD27']}),1).state;
 let s=inn(1),plain=dispatch(c,s,{type:'rest'}).state;
 let out=dispatch(c,s,{type:'rest',itemId:'BD27',params:{amount:12}}).state;
 assert.equal(out.hp,plain.hp-12);assert.equal(out.reservations.at(-1).withinMoves,3);assert.equal(out.reservations.at(-1).rules[0].effects.at(-1).delta,12);assert.deepEqual(out.bag,[]);
 s=inn(39);const before=JSON.stringify(s);assert.throws(()=>dispatch(c,s,{type:'rest',itemId:'BD27',params:{amount:2}}));assert.equal(JSON.stringify(s),before);
 assert.throws(()=>dispatch(c,s,{type:'rest',itemId:'BD27',params:{amount:0}}));
});
test('BD45 attaches only to the newly recruited companion and includes lantern automatic support',()=>{
 let s=walk(c,place(base,base.board.innPositions[1]-1,{hp:1,mp:0,bag:['BD45']}),1).state;
 s.companions=[];s.inns[s.pos].tavern.candidates=['CP04'];
 const recruited=dispatch(c,s,{type:'recruit',companionId:'CP04',itemId:'BD45'}).state;
 assert.deepEqual(recruited.bag,[]);assert.equal(recruited.reservations.at(-1).companionId,'CP04');assert.equal(recruited.reservations.at(-1).withinMoves,3);
 const b=startBattle(c,recruited,'EN01',{die:5});assert.equal(b.state.hp,9);assert.ok(!b.state.reservations.some(r=>r.slot==='companionAid'));
 assert.throws(()=>dispatch(c,recruited,{type:'recruit',companionId:'CP04',itemId:'BD45'}));
});
test('AT31 excludes one fake, then distinguishes real/fake and works without decoys',()=>{
 const s=durableBattle('SW01').state;s.bag=['AT31'];s.battle.current.attack=0;s.battle.targets=[{index:0,real:false},{index:1,real:false},{index:2,real:true}];
 assert.throws(()=>dispatch(c,s,{type:'item',itemId:'AT31',params:{target:0}}));
 const wrong=dispatch(c,s,{type:'item',itemId:'AT31',params:{target:1}}).state;assert.equal(wrong.battle.enemy.hp,1000);
 const good=dispatch(c,s,{type:'item',itemId:'AT31',params:{target:2}}).state;assert.equal(good.battle.enemy.hp,987);
 s.battle.targets=null;assert.equal(dispatch(c,s,{type:'item',itemId:'AT31'}).state.battle.enemy.hp,987);
});
test('AT44 next-turn selection hits only once and rejects duplicates; no-decoy bonus is seven',()=>{
 let s=durableBattle('SW01').state;s.bag=['AT44'];s.battle.current.attack=0;s=dispatch(c,s,{type:'item',itemId:'AT44'}).state;s.hp=40;s.battle.current.attack=0;s.battle.targets=[{index:0,real:false},{index:1,real:false},{index:2,real:true}];
 assert.throws(()=>dispatch(c,s,{type:'attack',targets:[2,2]}));
 const good=dispatch(c,s,{type:'attack',targets:[0,2]});assert.equal(good.effects.filter(e=>e.t==='hit'&&e.target==='enemy'&&e.amount>0).length,1);
 const wrong=dispatch(c,s,{type:'attack',targets:[0,1]});assert.equal(wrong.state.battle.enemy.hp,1000);
 s.battle.targets=null;const boosted=dispatch(c,s,{type:'attack'}).state;const plain=cl(s);delete plain.battle.flags.doubleTargetRound;assert.equal(dispatch(c,plain,{type:'attack'}).state.battle.enemy.hp-boosted.battle.enemy.hp,7);
});
test('AT12 ignores at most six explicitly tagged shell/shield reduction, never immunity or fake targets',()=>{
 function state(effects){let s=durableBattle('SW01').state;s.bag=['AT12'];s.battle.current.attack=0;s.battle.marks.push({id:'shell',hook:'heroAttackDamage',effects});return s;}
 for(const [effects,damage]of [[[{op:'subDamage',amount:8,reductionKind:'shell'}],8],[[{op:'subDamage',amount:8}],2],[[{op:'subDamage',amount:4,reductionKind:'shell'},{op:'reduceDamage',amount:4,reductionKind:'shield'}],8],[[{op:'subDamage',amount:4,reductionKind:'shield'}],10]]){
  const s=state(effects);assert.equal(dispatch(c,s,{type:'item',itemId:'AT12'}).state.battle.enemy.hp,1000-damage);
 }
 let s=state([]);s.battle.current.immune=true;assert.equal(dispatch(c,s,{type:'item',itemId:'AT12'}).state.battle.enemy.hp,1000);
 s=state([]);s.battle.targets=[{index:0,real:false},{index:1,real:true}];assert.equal(dispatch(c,s,{type:'item',itemId:'AT12',target:0}).state.battle.enemy.hp,1000);
});
import {enemyActionForecast} from '../src/engine/battle.js';
test('AT21 weakens only temporary defense up to ten, expires after next turn, and adds fixed six',()=>{
 let s=durableBattle('SW01','EN06').state;s.level=20;s.bag=['AT21'];s.battle.current.attack=0;
 s=dispatch(c,s,{type:'item',itemId:'AT21'}).state;assert.equal(s.battle.enemy.hp,994);
 for(const [defense,gain]of [[15,5],[30,10],[5,0]]){let a=cl(s);a.hp=78;a.battle.current.attack=0;a.battle.current.defense=defense;let b=cl(a);delete b.battle.flags.weakenDefenseUntil;assert.equal(dispatch(c,b,{type:'attack'}).state.battle.enemy.hp-dispatch(c,a,{type:'attack'}).state.battle.enemy.hp,gain);}
 s.hp=78;s.battle.current.attack=0;s=dispatch(c,s,{type:'guard'}).state;s.battle.current.attack=0;s.battle.current.defense=15;let plain=cl(s);delete plain.battle.flags.weakenDefenseUntil;assert.equal(dispatch(c,s,{type:'attack'}).state.battle.enemy.hp,dispatch(c,plain,{type:'attack'}).state.battle.enemy.hp);
});
test('AT30 mitigates its current first hit and recalculates conditional remaining previews without mutation',()=>{
 let s=durableBattle('SW01').state;s.bag=['AT30'];s.hp=40;s.battle.current.rawDamage=10;s.battle.dieBonus.used=true;
 s=dispatch(c,s,{type:'item',itemId:'AT30'}).state;assert.equal(s.hp,33);assert.equal(s.battle.flags.forecastUntilRound,3);
 const before=JSON.stringify(s),normal=enemyActionForecast(c,s,false),guard=enemyActionForecast(c,s,true);assert.equal(JSON.stringify(s),before);assert.equal(normal.length,2);assert.ok(guard.every((x,i)=>x.damage<=normal[i].damage));assert.ok(normal.every(x=>x.conditional));
});
function statusItem(id,statuses=[]){const s=durableBattle('SW01').state;s.bag=[id];s.hp=10;s.mp=1;s.battle.current.attack=0;s.battle.temporaryStatuses=statuses;return s;}
const status=(id,kinds)=>({id,kinds,amount:2,remainingTurns:4,createdRound:0,label:id});
test('HE26/32 clear a selected typed status, allow none, and reject ambiguous choices atomically',()=>{
 for(const [id,kind,heal]of [['HE26','turnEndHpLoss',8],['HE32','defenseDown',10]]){
  const empty=statusItem(id);assert.equal(dispatch(c,empty,{type:'item',itemId:id}).state.hp,10+heal);
  const s=statusItem(id,[status('a',[kind]),status('b',[kind])]);const before=JSON.stringify(s);assert.throws(()=>dispatch(c,s,{type:'item',itemId:id}));assert.equal(JSON.stringify(s),before);
  const out=dispatch(c,s,{type:'item',itemId:id,params:{statusId:'b'}}).state;assert.deepEqual(out.battle.temporaryStatuses.map(x=>x.id),['a']);
 }
});
test('HE46 counts a combined attack/defense status once and two distinct statuses twice',()=>{
 for(const [statuses,heal]of [[[],0],[[status('both',['attackDown','defenseDown'])],6],[[status('a',['attackDown']),status('d',['defenseDown'])],12]]){
  const out=dispatch(c,statusItem('HE46',statuses),{type:'item',itemId:'HE46'}).state;assert.equal(out.hp,10+heal);assert.equal(out.mp,5);assert.deepEqual(out.battle.temporaryStatuses,[]);
 }
});
test('AT19/48 prevent current enemy state losses but leave existing effects and later actions intact',()=>{
 for(const id of ['AT19','AT48']){let s=statusItem(id,[status('old',['attackDown'])]);s.mp=10;s.battle.marks.push({id:'enemy-test',hook:'beforeEnemyAction',effects:[{op:'enemyMpLoss',amount:7},{op:'applyTemporaryStatus',kind:'defenseDown',amount:2,turns:3}]});
  const out=dispatch(c,s,{type:'item',itemId:id}).state;assert.equal(out.mp,10);assert.ok(out.battle.temporaryStatuses.some(x=>x.id==='old'));assert.equal(out.battle.temporaryStatuses.some(x=>x.kinds.includes('defenseDown')),id==='AT19');
  out.battle.current.attack=0;assert.equal(dispatch(c,out,{type:'guard'}).state.mp,3);
 }
});
test('HE37 refunds actual enemy MP loss once and not beyond seven',()=>{
 let s=statusItem('HE37');s.mp=10;s.battle.marks.push({id:'drain',hook:'beforeEnemyAction',effects:[{op:'enemyMpLoss',amount:9}]});
 s=dispatch(c,s,{type:'item',itemId:'HE37'}).state;assert.equal(s.mp,8);s.battle.current.attack=0;s=dispatch(c,s,{type:'guard'}).state;assert.equal(s.mp,0);
});
test('all authored consumable enemy-damage marks run in the card stage after gear and small die',()=>{
 function walk(value,path){if(!value||typeof value!=='object')return;if(value.hook==='enemyDamage')assert.equal(value.stage,'card',path);for(const [k,v]of Object.entries(value))walk(v,`${path}.${k}`);}
 for(const [id,script]of Object.entries(c.scripts.items))walk(script,id);
});
test('AT30 first zero-damage hit consumes its reduction instead of deferring to the second hit',()=>{
 const s=durableBattle('SW01').state;s.bag=['AT30'];s.hp=40;s.battle.dieBonus.used=true;s.battle.current.rawDamage=0;s.battle.current.hits=2;
 s.battle.marks.push({id:'second-hit',hook:'enemyDamage',stage:'gear',when:{eq:[{ref:'battle.hitIndex'},2]},effects:[{op:'addDamage',amount:10}]});
 const out=dispatch(c,s,{type:'item',itemId:'AT30'});assert.deepEqual(out.effects.filter(e=>e.t==='hit'&&e.target==='hero').map(e=>e.amount),[0,10]);
});
