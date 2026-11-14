// Route F event scripts, real engine traversal and source assertions.
// 1) every scripted M id is driven through the real engine (dispatch) in several fixture states;
// 2) hand-picked ids carry exact assertions read from the source prose (adventure-content.json).

import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dispatch, view } from '../src/engine/index.js';
import { EngineError } from '../src/engine/util.js';
import { cl, exampleRun, getContent, landOnEvent, place, withSquare, walk } from './fixtures/helpers.mjs';

const content = await getContent();
const base = exampleRun(content, 'F');
const FULL_BAG = ['HE01', 'HE02', 'BD01', 'AT02', 'AT03', 'HE03'];
const F_IDS = Object.keys(content.scripts.events).filter((id) => /^F[1-5]-\d\d$/.test(id)).sort();

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


for (const id of F_IDS) {
 test(`${id}: every branch is executable or explicitly disabled`,()=>{
  for(const patch of Object.values(FIXTURES)) for(const die of [2,5]) {
   const {state}=land(id,{die,patch}); const out=[];
   explore(state,[id],out);
   assert.ok(out.length>0,id);
   for(const x of out) { assert.ok(x.state.hp>=1);assert.ok(x.state.gold>=0);assert.ok(x.state.bag.length<=6); }
  }
 });
}
test('F1 exact source effects: alternatives, paid caps, gifts and trap floors',()=>{
 const pick=(id,opt,patch={})=>choose(land(id,{patch:{gold:1000,hp:20,mp:1,bag:[],...patch}}).state,opt).state;
 assert.equal(pick('F1-01','complete').gold,1180);
 assert.equal(pick('F1-07','rope').gear.some(g=>g.id==='SW02'),true);
 assert.equal(pick('F1-07','rope').gear.some(g=>g.id==='SW03'),false);
 assert.equal(pick('F1-09','help').hp,18);
 assert.equal(pick('F1-10','buy').gold,720);
 assert.equal(pick('F1-18','polish').hp,19);
 assert.equal(pick('F1-35','bread').hp,26);
 assert.equal(pick('F1-35','tea').mp,4);
 assert.equal(pick('F1-42','market').gold,1140);
 assert.equal(pick('F1-42','fence').gold,1000);
 assert.equal(pick('F1-44','white').hp,17);
 assert.equal(pick('F1-48','push',{hp:1}).hp,1);
 assert.equal(pick('F1-50','look',{mp:1}).mp,0);
});
test('F3救護席: 半分以下だけ一度、F4袋詰め: 満杯だけ一度',()=>{
 for(const [id,serviceId,patch,delta] of [['F3-40','rest',{hp:1},6],['F4-41','bag',{hp:1,bag:FULL_BAG},5]]){
  const s=land(id,{patch}).state;
  const t=dispatch(content,s,{type:'service',serviceId}).state;
  assert.equal(t.hp,1+delta);
  assert.equal(view(content,t).actions.find(a=>a.serviceId===serviceId).enabled,false);
 }
 const healthy=land('F3-40',{patch:{hp:999}}).state;
 assert.equal(view(content,healthy).actions.find(a=>a.serviceId==='rest').enabled,false);
 const empty=land('F4-41',{patch:{hp:1,bag:[]}}).state;
 assert.equal(view(content,empty).actions.find(a=>a.serviceId==='bag').enabled,false);
});
test('F2/F3/F4/F5 costs, conditional alternatives and gear paid caps',()=>{
 const pick=(id,opt,patch={})=>choose(land(id,{patch:{gold:9000,hp:20,mp:1,bag:[],...patch}}).state,opt).state;
 for(const [id,opt,gid,price] of [['F2-20','paid','AR20',180],['F3-17','hire','AR26',220],['F4-10','buy','SW37',1890],['F5-13','buy','SW50',3000]]){
  const s=pick(id,opt); assert.equal(s.gold,9000-price);assert.equal(gearOf(s,gid).paidGold,price);
 }
 assert.equal(pick('F3-33','attack',{bag:['HE23']}).bag.includes('AT24'),true);
 assert.equal(pick('F3-33','attack',{bag:['HE23']}).bag.includes('HE23'),false);
 assert.equal(pick('F5-44','repair',{bag:['AT46']}).gold,9520);
 assert.equal(pick('F5-44','rest').gold,9000);
 for(const id of ['F3-50','F5-50']) {const s=pick(id,id==='F3-50'?'back':'peek',{hp:1,mp:0});assert.equal(s.hp,1);assert.equal(s.mp,0);}
});
test('F5-22 valve only reduces the first dive, not a later first guarded dive',()=>{
 const replay=(guardFirst)=>{
  let s=exampleRun(content,'F');Object.assign(s,{level:20,hp:50,bag:['HE01'],companions:[],equipped:{sword:null,armor:null}});
  s=landOnEvent(content,s,'F5-22',{pos:90,die:4}).state;s=choose(s,'valve').state;
  const rounds=[];
  for(const action of [{type:'guard'},guardFirst?{type:'guard'}:{type:'item',itemId:'HE01'},{type:'guard'},{type:'guard'},{type:'guard'}]){
   s.hp=100;const r=dispatch(content,s,action);rounds.push(r.effects.filter(e=>e.t==='rule'&&e.id==='valve'));s=r.state;
  }
  return rounds;
 };
 assert.equal(replay(false).flat().length,0);
 const yes=replay(true);assert.equal(yes[1].length,1);assert.equal(yes[4].length,0);
});
