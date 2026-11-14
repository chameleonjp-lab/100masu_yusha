import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../src/engine/index.js';
import { getContent, exampleRun, landOnEvent, withScripts } from './fixtures/helpers.mjs';
const base = await getContent();
function setup(info) {
 const c=withScripts(base,{events:{'F1-39':{inn:{services:[{id:'info',label:'確認',effects:[{op:'reveal',info}]}]}}}});
 const run=exampleRun(c,'F'); const s=landOnEvent(c,run,'F1-39',{pos:run.board.innPositions[0],die:1}).state;
 return {c,s};
}
test('next gear reveal stops at current band and reports no scheduled gear',()=>{
 const {c,s}=setup('nextGearInBand');
 for(let p=s.pos+1;p<=21;p++)s.board.squares[p-1].contentId='F1-01';
 s.board.squares[20].contentId=Object.values(c.events).find(e=>e.kind==='装備').id;
 const r=dispatch(c,s,{type:'service',serviceId:'info'}).state;
 assert.equal(r.reveals.at(-1).data.square,null);
 s.board.squares[19].contentId=s.board.squares[20].contentId;
 const r2=dispatch(c,s,{type:'service',serviceId:'info'}).state;
 assert.equal(r2.reveals.at(-1).data.square.pos,20);
 assert.deepEqual(r2.rng,s.rng);assert.deepEqual(r2.gear,s.gear);
});
test('sword comparison exposes owned swords only, with current base attack and original effects',()=>{
 const {c,s}=setup('ownedSwordComparison');
 s.gear=[{iid:'a',id:'SW01'},{iid:'b',id:'SW02'},{iid:'c',id:'AR01'}];
 const r=dispatch(c,s,{type:'service',serviceId:'info'}).state;
 const d=r.reveals.at(-1).data;
 assert.equal(d.maxSelected,2);assert.deepEqual(d.swords.map(x=>x.id),['SW01','SW02']);
 assert.equal(d.swords[1].normalAttack,c.levelTable[s.level-1].attack+c.gear.SW02.baseStat);
 assert.equal(d.swords[1].effect,c.gear.SW02.effect);
 assert.deepEqual(r.gear,s.gear);assert.deepEqual(r.rng,s.rng);
});
for (const [info,kind] of [['nextTrapInBand','罠'],['nextItemInBand','道具'],['nextBattleInBand','戦闘']]) {
 test(`${info} reveals only the first matching square in this band`,()=>{
  const {c,s}=setup(info);
  for(let p=s.pos+1;p<=21;p++)s.board.squares[p-1].contentId='F1-01';
  const id=kind==='戦闘'?'M1-22':Object.values(c.events).find(e=>e.kind===kind).id;
  s.board.squares[19].contentId=id;
  const r=dispatch(c,s,{type:'service',serviceId:'info'}).state;
  assert.equal(r.reveals.at(-1).data.square.pos,20);
  assert.equal(r.reveals.at(-1).data.square.kind,kind);
  assert.deepEqual(r.rng,s.rng);
  s.board.squares[19].contentId='F1-01';s.board.squares[20].contentId=id;
  assert.equal(dispatch(c,s,{type:'service',serviceId:'info'}).state.reveals.at(-1).data.square,null);
 });
}
test('armor comparison and king hint retain the original readable conditions',()=>{
 const {c,s}=setup('ownedArmorComparison');
 const d=dispatch(c,s,{type:'service',serviceId:'info'}).state.reveals.at(-1).data;
 assert.equal(d.maxSelected,2);assert.equal(d.armor.length,1);
 assert.equal(d.armor[0].effect,c.gear[d.armor[0].id].effect);
 const hint=setup('kingPhaseHint');
 assert.equal(dispatch(hint.c,hint.s,{type:'service',serviceId:'info'}).state.reveals.at(-1).data.text,'魔王の体力が半分以下になると、次の予告から戦い方が変わる');
});
test('remaining traps excludes current square and castle',()=>{
 const {c,s}=setup('remainingTraps');
 const expected=s.board.squares.filter(q=>q.position>s.pos&&q.position<100&&c.events[q.contentId]?.kind==='罠').length;
 const d=dispatch(c,s,{type:'service',serviceId:'info'}).state.reveals.at(-1).data;
 assert.equal(d.count,expected);
});
