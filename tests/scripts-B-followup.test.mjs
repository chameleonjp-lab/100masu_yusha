// Route B event scripts, real engine traversal and source assertions.
// 1) every scripted B id is driven through the real engine (dispatch) in several fixture states;
// 2) hand-picked ids carry exact assertions read from the source prose (adventure-content.json).

import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dispatch, view } from '../src/engine/index.js';
import { EngineError } from '../src/engine/util.js';
import { cl, exampleRun, getContent, landOnEvent, place, withSquare, walk } from './fixtures/helpers.mjs';

const content = await getContent();
const base = exampleRun(content, 'B');
const FULL_BAG = ['HE01', 'HE02', 'BD01', 'AT02', 'AT03', 'HE03'];
const B_IDS = Array.from({length:5}, (_, i) => Object.keys(JSON.parse(readFileSync(new URL(`../data/scripts/events/B${i+1}.json`, import.meta.url))).events)).flat().sort();

// ---- helpers -----------------------------------------------------------------------------

const isInn = (id) => content.events[id].kind === '宿場';

/** Land on event `id` with the given die and state patch (gold/hp/mp/bag ...). Inns are landed on a real inn square. */
function land(id, { die = 5, patch = {} } = {}) {
  if (isInn(id)) {
    const p = base.board.innPositions[0];
    let t = withSquare(base, p, id);
    t = place(t, p - die, patch);
    return walk(content, t, die);
  }
  return landOnEvent(content, base, id, { pos: 10, die, patch });
}
const choose = (s, optionId, input) => dispatch(content, s, { type: 'chooseOption', optionId, ...(input !== undefined ? { input } : {}) });
const actionOf = (s, optionId) => view(content, s).actions.find((a) => a.type === 'chooseOption' && a.optionId === optionId);
const ownsGear = (s, id) => s.gear.some((g) => g.id === id);
const gearOf = (s, id) => s.gear.find((g) => g.id === id);
const goldFx = (effects) => effects.filter((e) => e.t === 'gold').map((e) => [e.delta, e.reason]);

/** Drive one state to all its terminal states; every illegal choice must be a disabled option reported by view(). */
function explore(s, trail, out, depth = 0) {
  assert.ok(depth < 10, `runaway at ${trail.join('>')}`);
  const stop = () => out.push({ trail, state: s });
  switch (s.phase) {
    case 'board': case 'battle': case 'bossOffer': case 'gate': case 'finished': return stop();
    case 'chest': {
      explore(dispatch(content, cl(s), { type: 'skipChest' }).state, [...trail, 'skipChest'], out, depth + 1);
      explore(dispatch(content, cl(s), { type: 'pickChest', index: 0 }).state, [...trail, 'pickChest'], out, depth + 1);
      return undefined;
    }
    case 'bagFull': {
      explore(dispatch(content, cl(s), { type: 'bagDecline' }).state, [...trail, 'bagDecline'], out, depth + 1);
      explore(dispatch(content, cl(s), { type: 'bagSwap', index: 0 }).state, [...trail, 'bagSwap'], out, depth + 1);
      return undefined;
    }
    case 'event': case 'inn': {
      if (s.prompt && s.prompt.kind === 'pickBagItem') return explore(dispatch(content, cl(s), { type: 'pickBagItem', index: 0 }).state, [...trail, 'pick0'], out, depth + 1);
      if (s.prompt && s.prompt.kind === 'choice') {
        for (const a of view(content, s).actions.filter((x) => x.type === 'chooseOption')) {
          const inputs = !a.input ? [undefined]
            : a.input.type === 'int' ? [...new Set([a.input.min, a.input.max])]
              : a.input.type === 'enum' ? a.input.values : [undefined];
          for (const input of inputs) {
            const step = `${a.optionId}${input !== undefined ? `(${input})` : ''}`;
            if (a.enabled === false) {
              assert.throws(() => dispatch(content, cl(s), { type: 'chooseOption', optionId: a.optionId, ...(input !== undefined ? { input } : {}) }),
                (e) => e instanceof EngineError && e.code === `option_${a.reason}`, `${trail.join('>')}>${step} disabled as ${a.reason}`);
              out.disabled = (out.disabled || []).concat(a.optionId);
            } else {
              const r = dispatch(content, cl(s), { type: 'chooseOption', optionId: a.optionId, ...(input !== undefined ? { input } : {}) });
              out.enabled = (out.enabled || []).concat(a.optionId);
              explore(r.state, [...trail, step], out, depth + 1);
            }
          }
        }
        return undefined;
      }
      if (s.phase === 'inn') {
        for (const a of view(content, s).actions.filter((x) => x.type === 'service')) {
          if (trail.includes(`svc:${a.serviceId}`)) continue;
          if (a.enabled === false) { out.disabled = (out.disabled || []).concat(a.serviceId); continue; }
          out.enabled = (out.enabled || []).concat(a.serviceId);
          explore(dispatch(content, cl(s), { type: 'service', serviceId: a.serviceId }).state, [...trail, `svc:${a.serviceId}`], out, depth + 1);
        }
        explore(dispatch(content, cl(s), { type: 'leaveInn' }).state, [...trail, 'leave'], out, depth + 1);
        return undefined;
      }
      throw new Error(`stuck in ${s.phase} at ${trail.join('>')}`);
    }
    default: throw new Error(`unexpected phase ${s.phase}`);
  }
}

const FIXTURES = {
  rich: { gold: 9000, hp: 20, mp: 3, bag: ['HE01', 'BD01'] },
  poor: { gold: 0, hp: 20, mp: 3, bag: ['HE01', 'BD01'] },
  fullBag: { gold: 9000, hp: 20, mp: 3, bag: FULL_BAG },
  edge: { gold: 0, hp: 1, mp: 0, bag: [] },
  topped: { gold: 9000, hp: 40, mp: 10, bag: ['AT02', 'AT03', 'HE03', 'BD02', 'BD01', 'AT01'] },
};


for (const id of B_IDS) {
 test(`${id}: every branch is executable or explicitly disabled`,()=>{
  for(const patch of Object.values(FIXTURES)) for(const die of [2,5]) {
   const {state}=land(id,{die,patch}); const out=[];
   explore(state,[id],out);
   assert.ok(out.length>0,id);
   for(const x of out) { assert.ok(x.state.hp>=1);assert.ok(x.state.gold>=0);assert.ok(x.state.bag.length<=6); }
  }
 });
}

test('B2 contains all 50 individually encoded entries, not sample-only coverage',()=>assert.equal(B_IDS.filter(id=>id.startsWith('B2-')).length,50));

const pick = (id, optionId, patch = {}, input) => choose(land(id, { patch: { gold: 5000, hp: 20, mp: 3, bag: [], ...patch } }).state, optionId, input).state;
test('B gold choices preserve exact amounts, costs, zero-reward alternatives and once-per-square awards', () => {
 const cases=[['B1-02','hand',180,19,3],['B1-03','other',0,20,3],['B1-05','pass',0,20,3],['B2-02','rope',240,18,3],['B2-04','check',420,17,3],['B3-02','glove',380,18,6],['B3-04','mark',0,24,3],['B3-05','pull',610,16,3],['B4-03','take',710,17,3],['B4-05','untie',600,20,1],['B5-02','untie',820,20,1],['B5-04','stairs',0,20,3],['B5-05','wrong',0,20,3],['B5-42','walk',950,16,3]];
 for(const [id,opt,g,h,m] of cases){const s=pick(id,opt);assert.deepEqual([s.gold,s.hp,s.mp],[5000+g,h,m],`${id}/${opt}`);}
 const first=pick('B1-01','complete');
 const again=landOnEvent(content,first,'B1-01',{pos:10,die:5});
 assert.equal(choose(again.state,'complete').state.gold,first.gold);
});
test('B paid gear caps and insufficient-resource alternatives are preserved',()=>{
 for(const [id,opt,gearId,cost] of [['B3-07','paid','AR22',1020],['B4-08','SW35','SW35',1760],['B4-08','SW36','SW36',1830],['B5-08','SW45','SW45',2390]]){
  const s=pick(id,opt);assert.equal(s.gold,5000-cost);assert.equal(s.gear.find(g=>g.id===gearId).paidGold,cost);
 }
 const poor=land('B4-05',{patch:{mp:0,gold:0}}).state;
 assert.equal(actionOf(poor,'untie').enabled,false);assert.equal(choose(poor,'cut').state.gold,600);
 const noMp=land('B5-07',{patch:{mp:0}}).state;assert.equal(actionOf(noMp,'back').enabled,false);assert.ok(ownsGear(choose(noMp,'front').state,'AR41'));
});
test('B die, HP, companion and bag eligibility are enforced before acquisition',()=>{
 for(const die of [1,2,3,4,5,6]){
  const s=land('B2-10',{die}).state;assert.equal(actionOf(s,'SW16').enabled,die<=3);assert.equal(actionOf(s,'SW17').enabled,die>=4);
  const t=land('B5-09',{die}).state;for(const [id,ds] of [['AR43',[1,6]],['AR44',[2,5]],['AR45',[3,4]]])assert.equal(actionOf(t,id).enabled,ds.includes(die));
 }
 for(const [hp,ok] of [[20,true],[21,false]])assert.equal(actionOf(land('B5-11',{patch:{hp}}).state,'AR48').enabled,ok);
 assert.equal(actionOf(land('B5-34',{patch:{companions:[]}}).state,'AT44').enabled,false);
 assert.equal(actionOf(land('B5-34',{patch:{companions:['CP01']}}).state,'AT44').enabled,true);
 const full=land('B3-46',{patch:{bag:['AT27',...FULL_BAG.slice(0,5)]}}).state;assert.equal(actionOf(full,'swap').enabled,false);
 assert.deepEqual(pick('B3-46','swap',{bag:['AT27']}).bag,['BD27','BD27']);
 assert.equal(actionOf(land('B5-32',{patch:{gold:1000,bag:FULL_BAG.slice(0,5)}}).state,'paid').enabled,false);
 assert.deepEqual(pick('B5-32','paid').bag,['BD42','BD42']);
});
test('B recovery thresholds, rounding and allocation follow the source',()=>{
 assert.equal(pick('B1-38','complete',{hp:21}).hp,31);
 assert.deepEqual([pick('B2-37','complete',{hp:20}).hp,pick('B2-37','complete',{hp:21}).mp],[28,7]);
 assert.deepEqual([pick('B3-37','juice',{mp:3}).mp,pick('B5-37','hold',{mp:3}).mp,pick('B5-37','hold',{mp:5}).mp],[7,5,7]);
 for(let n=0;n<=3;n++){const s=pick('B4-37','drops',{hp:20,mp:0},n);assert.deepEqual([s.hp,s.mp],[20+3*n,2*(3-n)]);}
 assert.deepEqual(pick('B2-35','complete').bag,['HE15','AT15']);
 assert.deepEqual(pick('B4-35','complete').bag,['HE35','BD35']);
});
test('B trap floors preserve resources and AT02 bypasses every typed B trap',()=>{
 assert.equal(pick('B1-48','crawl',{hp:1}).hp,1);assert.equal(pick('B5-50','mist',{mp:1}).mp,0);
 for(const id of B_IDS.filter(id=>content.events[id].kind==='罠')){
  const s=land(id,{patch:{hp:1,mp:0,gold:0,bag:['AT02']}}).state;
  const done=dispatch(content,s,{type:'useItem',itemId:'AT02'}).state;
  assert.deepEqual([done.hp,done.mp,done.gold,done.bag],[1,0,0,[]],id);
 }
});
test('B battle starts preserve source costs and approved EN12 encounter patch',()=>{
 const weak=pick('B1-29','remove'),normal=pick('B1-29','keep');assert.equal(weak.hp,18);assert.equal(weak.battle.enemy.hp,normal.battle.enemy.hp-4);
 const answer=choose(land('B3-26',{die:2,patch:{mp:1}}).state,'answer',5).state;
 const wrong=choose(land('B3-26',{die:2,patch:{mp:1}}).state,'answer',1).state;
 assert.equal(answer.battle.enemy.hp,wrong.battle.enemy.hp-5);assert.equal(wrong.mp,0);
 assert.equal(land('B4-27').state.battle.enemyId,'EN12');assert.equal(content.events['B4-27'].patched,true);
 const donated=pick('B5-22','donate');assert.equal(donated.gold,4900);assert.equal(donated.battle.enemyId,'EN08');
});
test('B2-24 delayed water occurs only at the chosen turn and once',()=>{
 for(const [opt,trigger] of [['short',2],['long',3]]){
  let s=pick('B2-24',opt,{hp:40});const initial=s.battle.enemy.hp;
  for(let n=1;n<=4;n++){
   s=dispatch(content,s,{type:'guard'}).state;
   assert.equal(s.battle.enemy.hp,initial-(n>=trigger?5:0),`${opt} turn ${n}`);
  }
 }
});

test('B1-25 height bonus and landing loss apply only to the first-turn normal attack',()=>{
 const high=pick('B1-25','climb',{hp:40}),low=pick('B1-25','wait',{hp:40});
 const a=dispatch(content,high,{type:'attack'}).state,b=dispatch(content,low,{type:'attack'}).state;
 assert.equal(a.battle.enemy.hp,b.battle.enemy.hp-3);assert.equal(a.hp,b.hp-1);
 const guarded=dispatch(content,high,{type:'guard'}).state,plainGuard=dispatch(content,low,{type:'guard'}).state;
 assert.equal(guarded.hp,plainGuard.hp);
 const later=dispatch(content,guarded,{type:'attack'}).state,laterPlain=dispatch(content,plainGuard,{type:'attack'}).state;
 assert.equal(later.battle.enemy.hp,laterPlain.battle.enemy.hp);assert.equal(later.hp,laterPlain.hp);
});
test('B1-27 water heals 3; mud subtracts at most 3 from one direct hit only',()=>{
 const mud=pick('B1-27','reverse'),plain=pick('B1-27','stop');assert.equal(mud.hp,plain.hp+3);
 const a=dispatch(content,mud,{type:'attack'}).state,b=dispatch(content,plain,{type:'attack'}).state;
 assert.equal(a.battle.enemy.hp,b.battle.enemy.hp+3);
 const a2=dispatch(content,a,{type:'attack'}).state,b2=dispatch(content,b,{type:'attack'}).state;
 assert.equal(a2.battle.enemy.hp,b2.battle.enemy.hp+3);
});
test('B2-27 dry board retaliates after the first positive loss only',()=>{
 let dry=pick('B2-27','dry',{hp:40}),wet=pick('B2-27','wet',{hp:40});
 dry=dispatch(content,dry,{type:'guard'}).state;wet=dispatch(content,wet,{type:'guard'}).state;
 assert.equal(dry.battle.enemy.hp,wet.battle.enemy.hp-3);assert.equal(dry.hp,wet.hp);
 dry=dispatch(content,dry,{type:'guard'}).state;wet=dispatch(content,wet,{type:'guard'}).state;
 assert.equal(dry.battle.enemy.hp,wet.battle.enemy.hp-3);
});
test('B2-19 first-turn item keeps its ordinary consumption and prevents that enemy hit',()=>{
 const s=land('B2-19',{die:5,patch:{hp:20,bag:['HE01']}}).state;
 const done=dispatch(content,s,{type:'item',itemId:'HE01'}).state;
 assert.equal(done.bag.length,0);assert.equal(done.battle.rounds[0].hpLost,0);
});

test('B1-13 first guard nullifies the hit and reflects 3 once; later guard is ordinary',()=>{
 let s=land('B1-13',{die:5,patch:{hp:40}}).state;
 assert.equal(s.phase,'battle');const before=s.battle.enemy.hp;
 s=dispatch(content,s,{type:'guard'}).state;
 assert.equal(s.hp,40);assert.equal(s.battle.enemy.hp,before-3);
 s=dispatch(content,s,{type:'guard'}).state;
 assert.ok(s.hp<40);assert.equal(s.battle.enemy.hp,before-3);
});
test('B1-30 first guard reserves +4 for next normal attack, not a permanent bonus',()=>{
 let s=land('B1-30',{die:5,patch:{hp:40}}).state;assert.equal(s.phase,'battle');
 s=dispatch(content,s,{type:'guard'}).state;
 assert.equal(s.battle.marks.filter(m=>m.id==='cross-line').length,1);
 s=dispatch(content,s,{type:'attack'}).state;
 assert.equal(s.battle.marks.filter(m=>m.id==='cross-line').length,0);
});
test('B2-26 guarding the first windup adds ongoing normal-hit protection afterward',()=>{
 let s=land('B2-26',{die:5,patch:{hp:40}}).state;assert.equal(s.phase,'battle');
 assert.equal(s.battle.marks.filter(m=>m.id==='weight-removed').length,0);
 s=dispatch(content,s,{type:'guard'}).state;
 assert.equal(s.battle.marks.filter(m=>m.id==='weight-removed').length,0);
 s=dispatch(content,s,{type:'guard'}).state;
 assert.equal(s.battle.marks.filter(m=>m.id==='weight-removed').length,1);
 const other=land('B2-26',{die:5,patch:{hp:40}}).state;
 const attacked=dispatch(content,other,{type:'attack'}).state;
 assert.equal(attacked.battle.marks.filter(m=>m.id==='weight-removed').length,0);
});

test('B3 hook-only encounters expose the specified battle or pre-battle choices',()=>{
 for(const id of ['B3-13','B3-24','B3-28'])assert.equal(land(id).state.phase,'battle',id);
 for(const [id,opt] of [['B3-18','same'],['B3-18','reverse'],['B3-20','wheel'],['B3-20','split'],['B3-22','enemy'],['B3-22','feet']])assert.equal(pick(id,opt).phase,'battle',`${id}/${opt}`);
 assert.equal(land('B3-30').state.phase,'bossOffer');
});
test('B first scenario conversions expose their source choices',()=>{
 for(const id of ['B1-12','B1-14','B1-15','B1-18','B1-22','B1-23','B1-28','B2-12','B2-16'])assert.equal(land(id).state.phase,'battle',id);
 assert.equal(pick('B1-20','quiet').battle.current.attack,0);
});
test('B1-16 guards both hits; no guard records exactly two hits and four HP',()=>{
 const s=land('B1-16',{die:5,patch:{hp:40}}).state;
 const g=dispatch(content,s,{type:'guard'}).state;assert.equal(g.hp,40);
 const a=dispatch(content,s,{type:'attack'}).state;assert.equal(a.hp,36);assert.equal(a.battle.rounds[0].hitsTaken,2);
});
test('B1-17 threshold potato announcement is preventable with the authored attack choice',()=>{
 let s=land('B1-17',{die:5,patch:{hp:40}}).state;s.battle.enemy.hp=Math.floor(s.battle.enemy.maxHp/2);
 s=dispatch(content,s,{type:'guard'}).state;assert.equal(s.battle.current.scenarioId,'potato');
 const prevented=dispatch(content,s,{type:'attack',choiceId:'potato'}).state;assert.equal(prevented.battle.rounds[1].enemyHealed,0);
 const allowed=dispatch(content,s,{type:'guard'}).state;assert.equal(allowed.battle.rounds[1].enemyHealed,4);
});
test('B1-21 breaking mud reduces defense persistently without falsely landing a hit',()=>{
 const s=land('B1-21',{die:5,patch:{hp:40}}).state;
 const a=dispatch(content,s,{type:'attack',choiceId:'back'}).state;
 assert.equal(a.battle.scenarioDefense,-2);assert.equal(a.battle.rounds[0].landed,false);assert.equal(a.battle.dieBonus.used,false);
 assert.equal(a.battle.current.defense,Math.max(0,content.enemies.EN02.phases[0].actions[1].defense-2));
});
test('B2-18 distant normal attack misses without boost consumption; magic and items remain available',()=>{
 const s=pick('B2-18','untie',{hp:40,bag:['AT01']});
 const a=dispatch(content,s,{type:'attack',choiceId:'attack'}).state;assert.equal(a.hp,40);assert.equal(a.battle.rounds[0].landed,false);assert.equal(a.battle.dieBonus.used,false);
 const i=dispatch(content,s,{type:'item',itemId:'AT01'}).state;assert.equal(i.bag.length,0);assert.equal(i.hp,40);assert.ok(i.battle.enemy.hp<s.battle.enemy.hp);
});
test('B2-25 open heals four without attacking; closed starts four HP lower',()=>{
 const opened=pick('B2-25','open',{hp:40}),closed=pick('B2-25','close',{hp:40});assert.equal(closed.battle.enemy.hp,opened.battle.enemy.hp-4);
 opened.battle.enemy.hp-=6;const done=dispatch(content,opened,{type:'guard'}).state;assert.equal(done.hp,40);assert.equal(done.battle.rounds[0].enemyHealed,4);
});
test('B2-26 weight response applies to the named windup, not the first ordinary attack',()=>{
 let s=land('B2-26',{patch:{hp:80}}).state;
 assert.notEqual(s.battle.current.name,'振りかぶる');
 s=dispatch(content,s,{type:'guard'}).state;
 assert.equal(s.battle.current.name,'振りかぶる');
 assert.equal(s.battle.marks.some(x=>x.id==='weight-removed'),false);
 s=dispatch(content,s,{type:'guard'}).state;
 assert.equal(s.battle.marks.some(x=>x.id==='weight-removed'),true);
});
test('B2-13 closed gate reflects three and prevents the first enemy damage',()=>{
 let s=choose(land('B2-13',{patch:{hp:40}}).state,'close').state;const hp=s.hp,e=s.battle.enemy.hp;
 s=dispatch(content,s,{type:'guard'}).state;
 assert.equal(s.hp,hp);assert.equal(s.battle.enemy.hp,e-3);
});
test('B2-14 rope attacks deal no hero hit and retain only the other bag',()=>{
 const s=land('B2-14',{patch:{hp:40}}).state;s.battle.enemy.hp-=5;
 const right=dispatch(content,s,{type:'attack',choiceId:'right'}).state;
 assert.equal(right.hp,s.hp-3);assert.equal(right.battle.enemy.hp,s.battle.enemy.hp);
 const left=dispatch(content,s,{type:'attack',choiceId:'left'}).state;
 assert.equal(left.hp,s.hp);assert.equal(left.battle.enemy.hp,s.battle.enemy.hp+3);
});
test('B2-22 stone has no immediate damage and drops the basket only at second turn end',()=>{
 let s=land('B2-22',{patch:{hp:80}}).state;const hp=s.battle.enemy.hp;
 s=dispatch(content,s,{type:'attack',choiceId:'stone'}).state;assert.equal(s.battle.enemy.hp,hp);
 s=dispatch(content,s,{type:'guard'}).state;assert.equal(s.battle.enemy.hp,hp-6);
});
test('B2-15 oil heals only twice and tipping it stops even the current turn heal',()=>{
 const s=land('B2-15',{patch:{hp:80}}).state;s.battle.enemy.hp-=9;
 const tipped=dispatch(content,s,{type:'attack',choiceId:'plate'}).state;
 assert.equal(tipped.battle.enemy.hp,s.battle.enemy.hp);
 let keep=dispatch(content,s,{type:'guard'}).state;assert.equal(keep.battle.enemy.hp,s.battle.enemy.hp+3);
 keep=dispatch(content,keep,{type:'guard'}).state;assert.equal(keep.battle.enemy.hp,s.battle.enemy.hp+6);
 keep=dispatch(content,keep,{type:'guard'}).state;assert.equal(keep.battle.enemy.hp,s.battle.enemy.hp+6);
});
test('B2-20 clearing pearl deals no damage and removes its future attack choices',()=>{
 const s=land('B2-20',{patch:{hp:80}}).state,e=s.battle.enemy.hp;
 const out=dispatch(content,s,{type:'attack',choiceId:'pearl'}).state;
 assert.equal(out.battle.enemy.hp,e);assert.equal(out.battle.flags['scenario:bubbles-cleared'],true);
 assert.doesNotThrow(()=>dispatch(content,out,{type:'attack'}));
});
test('B2-17 guarded suction fails; unguarded heals only actual HP loss',()=>{
 const s=land('B2-17',{patch:{hp:80}}).state;s.battle.enemy.hp=1;s.battle.enemy.maxHp=100;
 const guard=dispatch(content,s,{type:'guard'}).state;assert.equal(guard.hp,s.hp);assert.equal(guard.battle.enemy.hp,1);
 s.bag=['HE01'];s.hp=20;
 const item=dispatch(content,s,{type:'item',itemId:'HE01'}).state;
 assert.equal(item.battle.enemy.hp,1+item.battle.rounds[0].hpLost);
});
test('B2-21 fish replaces the first big tell with the enemy normal action',()=>{
 let s=choose(land('B2-21',{patch:{hp:80}}).state,'fish').state;
 const normal=s.battle.current.attack;s=dispatch(content,s,{type:'guard'}).state;
 assert.equal(s.battle.current.kind,'通常攻撃');assert.equal(s.battle.current.attack,normal);
});
test('B2-28 ice prevents the first attack and restores MP only on the next guarded action',()=>{
 let s=land('B2-28',{patch:{hp:80,mp:0}}).state;const hp=s.hp;
 s=dispatch(content,s,{type:'attack',choiceId:'ice'}).state;assert.equal(s.hp,hp);assert.equal(s.mp,0);
 s=dispatch(content,s,{type:'guard'}).state;assert.equal(s.mp,3);
 s=dispatch(content,s,{type:'guard'}).state;assert.equal(s.mp,3);
});
test('B2-20 three direct body hits exhaust the bubbles without uninitialized counter errors',()=>{
 let s=land('B2-20',{patch:{hp:80}}).state;s.battle.enemy.hp=100;s.battle.enemy.maxHp=100;
 for(let n=1;n<=3;n++){s=dispatch(content,s,{type:'attack',choiceId:'body'}).state;assert.equal(s.battle.flags['scenario:bubble-hits'],n);}
 assert.equal(s.battle.flags['scenario:bubbles-cleared'],true);
 assert.doesNotThrow(()=>dispatch(content,s,{type:'attack'}));
});
