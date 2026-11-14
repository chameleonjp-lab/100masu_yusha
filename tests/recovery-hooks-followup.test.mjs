import test from 'node:test';import assert from 'node:assert/strict';
import {dispatch,maxHpOf} from '../src/engine/index.js';
import {getContent,exampleRun,startBattle,withScripts} from './fixtures/helpers.mjs';
const base=await getContent();
test('item healing hook uses actual capped recovery, and rule healing does not recurse',()=>{
 const c=withScripts(base,{items:{HE01:{uses:[{where:['battle'],effects:[{op:'hp',delta:5}]}]}},equipment:{AR01:{rules:[{hook:'itemHeal',effects:[{op:'addDamage',amount:3}]},{hook:'hpRestored',effects:[{op:'mp',delta:{ref:'battle.restoredHp'}}]}]}}});
 const s=startBattle(c,exampleRun(c),'EN01').state;s.hp=maxHpOf(c,s)-2;s.mp=0;s.bag=['HE01'];
 const r=dispatch(c,s,{type:'item',itemId:'HE01'});
 assert.ok(r.effects.some(e=>e.t==='hp'&&e.delta===2));assert.ok(r.effects.some(e=>e.t==='mp'&&e.delta===2));
});
test('itemHeal changes intended HP and mpRestored uses actual MP without recursive rule heals',()=>{
 const c=withScripts(base,{items:{HE01:{uses:[{where:['battle'],effects:[{op:'hp',delta:5},{op:'mp',delta:20}]}]}},equipment:{AR01:{rules:[{hook:'itemHeal',effects:[{op:'addDamage',amount:3}]},{hook:'mpRestored',effects:[{op:'hp',delta:{ref:'battle.restoredMp'}}]},{hook:'hpRestored',effects:[{op:'hp',delta:1}]}]}}});
 const s=startBattle(c,exampleRun(c),'EN01').state;s.hp=1;s.mp=0;s.bag=['HE01'];const r=dispatch(c,s,{type:'item',itemId:'HE01'});const hp=r.effects.filter(e=>e.t==='hp');assert.equal(hp[0].delta,8);assert.equal(hp[1].delta,1);assert.equal(r.effects.filter(e=>e.t==='rule'&&e.hook==='hpRestored').length,1);assert.equal(r.effects.filter(e=>e.t==='rule'&&e.hook==='mpRestored').length,1);
});
test('spell history is actual HP and afterHeroAction MP snapshot precedes refunds',()=>{
 const c=withScripts(base,{equipment:{AR01:{rules:[{hook:'hpRestored',effects:[{op:'mp',delta:3}]},{hook:'afterHeroAction',when:{and:[{gt:[{ref:'battle.spellCostPaid'},0]},{eq:[{ref:'battle.spellMpAfter'},0]}]},effects:[{op:'hp',delta:1}]}]},SW01:{rules:[{hook:'heroAttackDamage',when:{gt:[{ref:'battle.spellHpRestored',offset:-1},0]},effects:[{op:'addDamage',amount:6}]}]}}});
 const s=startBattle(c,exampleRun(c),'EN01').state;const spell=Object.values(c.spells).find(x=>x.kind==='heal');s.spells.learned.push(spell.id);s.spells.prepared=[spell.id];s.mp=spell.mpCost;s.hp=maxHpOf(c,s)-2;let r=dispatch(c,s,{type:'spell',spellId:spell.id});assert.equal(r.state.battle.rounds[0].spellHpRestored,2);assert.equal(r.state.battle.rounds[0].action.spellMpAfter,0);assert.ok(r.effects.some(e=>e.t==='rule'&&e.hook==='afterHeroAction'));r=dispatch(c,r.state,{type:'attack'});assert.ok(r.effects.some(e=>e.t==='rule'&&e.hook==='heroAttackDamage'));
});
test('zero actual restoration and non-battle item do not emit restoration hooks',()=>{
 const c=withScripts(base,{items:{HE01:{uses:[{where:['battle','board'],effects:[{op:'hp',delta:5},{op:'mp',delta:0}]}]}},equipment:{AR01:{rules:[{hook:'hpRestored',effects:[{op:'mp',delta:3}]},{hook:'mpRestored',effects:[{op:'hp',delta:3}]}]}}});
 let s=startBattle(c,exampleRun(c),'EN01').state;s.hp=maxHpOf(c,s);s.bag=['HE01'];let r=dispatch(c,s,{type:'item',itemId:'HE01'});assert.equal(r.effects.filter(e=>e.t==='rule'&&['hpRestored','mpRestored'].includes(e.hook)).length,0);
 s=exampleRun(c);s.hp=1;s.bag=['HE01'];r=dispatch(c,s,{type:'useItem',itemId:'HE01'});assert.equal(r.state.hp,6);assert.equal(r.effects.filter(e=>e.t==='rule').length,0);
});
test('real HE33 refund does not suppress AT42 when paid MP reached zero',()=>{
 const c=base;let s=exampleRun(c);s.level=20;s=startBattle(c,s,'EN08').state;s.hp=50;s.bag=['HE33','AT42'];const sp=Object.values(c.spells).find(x=>x.kind==='heal');s.spells.learned.push(sp.id);s.spells.prepared=[sp.id];s.mp=sp.mpCost;
 s=dispatch(c,s,{type:'item',itemId:'HE33'}).state;s=dispatch(c,s,{type:'item',itemId:'AT42'}).state;s.hp=20;
 const r=dispatch(c,s,{type:'spell',spellId:sp.id});assert.equal(r.state.battle.rounds[2].action.spellMpAfter,0);assert.ok(r.effects.some(e=>e.t==='rule'&&e.id==='HE33'));assert.ok(r.effects.some(e=>e.t==='rule'&&e.id==='AT42'));assert.ok(r.effects.some(e=>e.t==='mp'&&e.delta>0));assert.ok(r.effects.some(e=>e.t==='hit'&&e.target==='enemy'&&e.amount===18));
});
test('direct damage history excludes separate rule hits and supports previous-round refs',()=>{
 const c=withScripts(base,{equipment:{SW01:{rules:[{hook:'heroHit',effects:[{op:'dealDamage',amount:3}],limit:{perBattle:1}}]}},items:{AT01:{uses:[{where:['battle'],effects:[{op:'dealDamage',amount:{ref:'battle.attackDamageDealt',offset:-1}}]}]}}});
 let s=startBattle(c,exampleRun(c),'EN08').state;s.battle.enemy.hp=100;s.battle.enemy.maxHp=100;s.hp=100;s.bag=['AT01'];let r=dispatch(c,s,{type:'attack'});const hits=r.effects.filter(e=>e.t==='hit'&&e.target==='enemy');assert.equal(hits.length,2);assert.equal(r.state.battle.rounds[0].attackDamageDealt,hits[0].amount);assert.equal(r.state.battle.rounds[0].spellDamageDealt,0);s=r.state;s.hp=100;r=dispatch(c,s,{type:'item',itemId:'AT01'});assert.equal(r.effects.find(e=>e.t==='hit'&&e.target==='enemy').amount,hits[0].amount);
});
test('reveal stores move lifetime and filters six outcomes by maximum position',()=>{
 const c=withScripts(base,{items:{BD01:{uses:[{where:['board'],effects:[{op:'reveal',info:'sixOutcomes',maxPos:99,expires:{moves:2}}]}]}}});let s=exampleRun(c);s.pos=98;s.bag=['BD01'];const r=dispatch(c,s,{type:'useItem',itemId:'BD01'});assert.equal(r.state.reveals.at(-1).remainingMoves,2);assert.ok(r.state.reveals.at(-1).data.outcomes.every(x=>x.to<=99));
});
test('old round records without new counters gain finite direct-damage totals',()=>{
 let s=startBattle(base,exampleRun(base),'EN08').state;s.hp=100;delete s.battle.rounds[0].attackDamageDealt;const r=dispatch(base,s,{type:'attack'});assert.ok(Number.isFinite(r.state.battle.rounds[0].attackDamageDealt));
});
test('spellHit history distinguishes a real zero-damage spell hit from no hit',()=>{
 const c=withScripts(base,{equipment:{SW01:{rules:[{hook:'heroAttackDamage',effects:[{op:'capDamage',amount:0}]}]}},items:{AT01:{uses:[{where:['battle'],requires:[{when:{ref:'battle.spellHit',offset:-1}}],effects:[{op:'mp',delta:1}]}]}}});let s=startBattle(c,exampleRun(c),'EN08').state;s.hp=100;s.mp=10;s.bag=['AT01'];s.spells.learned=['SP01'];s.spells.prepared=['SP01'];let r=dispatch(c,s,{type:'spell',spellId:'SP01'});assert.equal(r.state.battle.rounds[0].spellDamageDealt,0);s=r.state;s.hp=100;r=dispatch(c,s,{type:'item',itemId:'AT01'});assert.ok(r.effects.some(e=>e.t==='mp'&&e.delta===1));
});
