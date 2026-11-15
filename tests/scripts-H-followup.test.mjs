// Route F event scripts, real engine traversal and source assertions.
// 1) every scripted M id is driven through the real engine (dispatch) in several fixture states;
// 2) hand-picked ids carry exact assertions read from the source prose (adventure-content.json).

import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dispatch, view, maxMpOf } from '../src/engine/index.js';
import { EngineError } from '../src/engine/util.js';
import { cl, exampleRun, getContent, landOnEvent, place, withSquare, walk } from './fixtures/helpers.mjs';

const content = await getContent();
const base = exampleRun(content, 'H');
const FULL_BAG = ['HE01', 'HE02', 'BD01', 'AT02', 'AT03', 'HE03'];
const H_IDS = Object.keys(content.scripts.events).filter((id) => /^H[1-5]-\d\d$/.test(id)).sort();

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


for (const id of H_IDS) {
 test(`${id}: every branch is executable or explicitly disabled`,()=>{
  for(const patch of Object.values(FIXTURES)) for(const die of [2,5]) {
   const {state}=land(id,{die,patch}); const out=[];
   explore(state,[id],out);
   assert.ok(out.length>0,id);
   for(const x of out) { assert.ok(x.state.hp>=1);assert.ok(x.state.gold>=0);assert.ok(x.state.bag.length<=6); }
  }
 });
}
test('H arrival-state conditions are checked before gifts or healing',()=>{
 const pick=(id,opt,patch={})=>choose(land(id,{patch:{gold:100,hp:1,mp:0,bag:[],companions:[],...patch}}).state,opt).state;
 const empty=pick('H1-24','help');assert.deepEqual(empty.bag,['HE06','BD07']);
 const nonempty=pick('H1-24','help',{bag:['HE01']});assert.deepEqual(nonempty.bag,['HE01','HE06']);
 const half=pick('H1-27','rest');assert.equal(half.hp,5);assert.equal(half.mp,2);
 const h2empty=pick('H2-22','help');assert.deepEqual(h2empty.bag,['BD15','HE16']);
 assert.equal(pick('H3-27','feet',{hp:4}).hp,13);
 assert.equal(pick('H3-27','feet',{hp:5}).hp,12);
 assert.deepEqual(pick('H4-19','help').bag,['BD34','HE34']);
 assert.deepEqual(pick('H5-24','help').bag,['HE47','BD47']);
 assert.equal(pick('H5-28','blue').hp,1); // missing MP >6: all warmth goes to MP
 assert.equal(pick('H5-28','blue').mp,6);
 const full=land('H5-28',{patch:{hp:1,mp:maxMpOf(content,base)}}).state;
 const warmed=choose(full,'blue').state;assert.equal(warmed.hp,7);
});
test('H restricted alternate gifts remain disabled when their conditions are false',()=>{
 for(const [id,opt,patch] of [['H1-17','board',{mp:0}],['H2-18','companion',{companions:[]}],['H3-19','heal',{hp:999}],['H4-18','board',{companions:[]}],['H5-19','attack',{companions:[]}],['H5-47','companion',{companions:[]}]]){
  const s=land(id,{patch}).state;assert.equal(actionOf(s,opt).enabled,false,`${id}/${opt}`);
 }
});
test('H2-41 recovery exchange cannot consume a battle item and pays only once',()=>{
 let s=land('H2-41',{patch:{hp:1,mp:0,bag:['AT01','HE01']}}).state;
 s=dispatch(content,s,{type:'service',serviceId:'exchange'}).state;
 assert.equal(view(content,s).actions.some(a=>a.optionId==='AT01'),false);
 assert.equal(actionOf(s,'HE02').enabled,false);
 s=choose(s,'HE01').state;
 assert.deepEqual(s.bag,['AT01']);assert.equal(s.hp,6);assert.equal(s.mp,5);
 assert.equal(view(content,s).actions.find(a=>a.serviceId==='exchange').enabled,false);
});
test('H3-34 uses resource proportions; H5-38 uses absolute missing points',()=>{
 for(const [id,patch] of [['H3-34',{hp:1,mp:999}],['H5-38',{hp:1,mp:999}]]){
  let s=land(id,{patch}).state;
  if(id==='H5-38')s=dispatch(content,s,{type:'service',serviceId:'extra'}).state;
  assert.equal(actionOf(s,'hp').enabled,true);assert.equal(actionOf(s,'mp').enabled,false);
 }
});
test('H trap costs clamp HP, enforce sufficient MP, and respect even arrival die',()=>{
 let s=land('H1-50',{patch:{hp:1,mp:0}}).state;
 assert.equal(actionOf(s,'smoke').enabled,false);assert.equal(choose(s,'around').state.hp,1);
 for(const [die,loss] of [[2,2],[5,5]]){
  s=land('H4-50',{die,patch:{hp:20}}).state;assert.equal(choose(s,'search').state.hp,20-loss);
 }
 s=land('H5-50',{patch:{hp:1,mp:3}}).state;assert.equal(actionOf(s,'magic').enabled,false);assert.equal(choose(s,'support').state.hp,1);
});
test('H5 combat benefits: first enemy action cap, first guard absorption, attack spell hit trigger',()=>{
 const start=(id)=>{
  let b=exampleRun(content,'H');Object.assign(b,{level:1,hp:200,mp:30,bag:[],companions:[],equipped:{sword:null,armor:null}});
  return choose(landOnEvent(content,b,id,{pos:90,die:4}).state,'fight').state;
 };
 let s=start('H5-09');let r=dispatch(content,s,{type:'guard'});
 assert.ok(r.effects.filter(e=>e.t==='hit'&&e.target==='hero').reduce((a,e)=>a+e.amount,0)<=6);
 s=start('H5-12');r=dispatch(content,s,{type:'guard'});
 assert.equal(r.effects.filter(e=>e.t==='rule'&&e.id==='saddle').length,1);
 s=r.state;s.hp=200;r=dispatch(content,s,{type:'guard'});
 assert.equal(r.effects.filter(e=>e.t==='rule'&&e.id==='saddle').length,0);
 s=start('H5-13');r=dispatch(content,s,{type:'guard'});assert.equal(r.state.mp,Math.min(maxMpOf(content,s),s.mp+3));
});
test('H3 battle preparation reduces initial enemy HP and spell discount is attack-only',()=>{
 let s=land('H3-11').state;s=choose(s,'fight').state;
 assert.equal(s.battle.enemy.hp,s.battle.enemy.maxHp-4);
 const rule=content.scripts.events['H3-13'].options[0].effects[0].rules[0];
 assert.deepEqual(rule.when.and[1],{eq:[{ref:'battle.spellKind'},'attack']});
});
