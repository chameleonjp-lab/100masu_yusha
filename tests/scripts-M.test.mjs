// Route M (金貨の商人道) event scripts M1-01 ... M5-50.
// 1) every scripted M id is driven through the real engine (dispatch) in several fixture states;
// 2) hand-picked ids carry exact assertions read from the source prose (adventure-content.json).

import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dispatch, view } from '../src/engine/index.js';
import { EngineError } from '../src/engine/util.js';
import { cl, exampleRun, getContent, landOnEvent, place, withSquare, walk } from './fixtures/helpers.mjs';

const content = await getContent();
const base = exampleRun(content, 'M');
const FULL_BAG = ['HE01', 'HE02', 'BD01', 'AT02', 'AT03', 'HE03'];
const M_IDS = Object.keys(content.scripts.events).filter((id) => /^M[1-5]-\d\d$/.test(id)).sort();

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

// ---- 1. every scripted M event runs through the engine ---------------------------------------

test('route M: every written band has 50 events, each scripted or recorded in the needs file', () => {
  const needsPath = new URL('../data/scripts/events/_needs-M.md', import.meta.url);
  const needs = existsSync(needsPath) ? readFileSync(needsPath, 'utf8') : '';
  const needIds = new Set(needs.match(/\bM[1-5]-\d\d\b/g) || []);
  for (const b of [1, 2, 3, 4, 5]) {
    if (!existsSync(new URL(`../data/scripts/events/M${b}.json`, import.meta.url))) continue;
    const scripted = M_IDS.filter((id) => id.startsWith(`M${b}-`));
    const missing = Object.keys(content.events).filter((id) => id.startsWith(`M${b}-`) && !scripted.includes(id));
    assert.deepEqual(missing.filter((id) => !needIds.has(id)), [], `band ${b}: ids neither scripted nor in the needs file`);
    assert.equal(scripted.length + missing.length, 50);
  }
});

for (const id of M_IDS) {
  test(`${id} (${content.events[id].kind}) runs in every fixture state`, () => {
    const kind = content.events[id].kind;
    const sawEnabled = new Set();
    for (const [fname, patch] of Object.entries(FIXTURES)) {
      for (const die of [2, 5]) {
        const r = land(id, { die, patch });
        const s = r.state;
        if (kind === '戦闘') {
          assert.ok(['battle', 'bossOffer'].includes(s.phase), `${fname}: ${s.phase}`);
          continue;
        }
        if (kind === '宿場') assert.equal(s.phase, 'inn');
        const out = [];
        explore(s, [`${fname}/die${die}`], out);
        for (const o of out.enabled || []) sawEnabled.add(o);
        for (const t of out) assert.ok(['board', 'battle', 'bossOffer'].includes(t.state.phase), `${fname}: ended in ${t.state.phase}`);
        // never a soft lock: an event with options always offers at least one enabled option
        if (kind !== '宿場' && s.prompt && s.prompt.kind === 'choice') assert.ok((out.enabled || []).length > 0, `${fname}: no enabled option`);
        for (const t of out.filter((x) => x.state.phase === 'board')) {
          assert.ok(t.state.hp >= 1, 'hp stays positive');
          assert.ok(t.state.gold >= 0 && t.state.mp >= 0);
          assert.ok(t.state.bag.length <= 6);
        }
      }
    }
    const script = content.scripts.events[id];
    for (const o of script.options || []) assert.ok(sawEnabled.has(o.id), `option ${o.id} was never selectable in any fixture`);
  });
}

// ---- 2. hand-picked exact assertions ------------------------------------------------------------

test('every M trap (罠): AT02 ends it without loss; every cost/loss is marked trapLoss', () => {
  const traps = M_IDS.filter((id) => content.events[id].kind === '罠');
  assert.ok(traps.length > 0);
  for (const id of traps) {
    const r = land(id, { patch: { gold: 9000, hp: 20, bag: ['AT02'] } });
    assert.equal(r.state.phase, 'event', id);
    const used = dispatch(content, r.state, { type: 'useItem', itemId: 'AT02' });
    assert.equal(used.state.phase, 'board', id);
    assert.equal(used.state.hp, 20, id);
    assert.equal(used.state.gold, 9000, id);
    // taking any option marks hp losses as trapLoss
    for (const a of view(content, r.state).actions.filter((x) => x.type === 'chooseOption' && x.enabled)) {
      const w = choose(cl(r.state), a.optionId);
      for (const e of w.effects.filter((x) => x.t === 'hp' && x.delta < 0)) assert.ok(e.trapLoss, `${id}/${a.optionId} hp loss not trapLoss`);
    }
  }
});

// ---- band 1 ----

test('M1 gold events pay the source amount once (M1-01 100G, M1-04 180G, M1-16 280G, M1-13 250G)', () => {
  for (const [id, amt] of [['M1-01', 100], ['M1-04', 180], ['M1-16', 280], ['M1-13', 250]]) {
    const r = land(id, { patch: { gold: 50 } });
    assert.equal(r.state.phase, 'event');
    const only = view(content, r.state).actions.filter((a) => a.type === 'chooseOption');
    assert.equal(only.length, 1);
    const w = choose(r.state, only[0].optionId);
    assert.equal(w.state.gold, 50 + amt, id);
    assert.deepEqual(goldFx(w.effects), [[amt, 'award']]);
    assert.equal(w.state.hp, r.state.hp);
  }
});

test('M1-17/18/20/21 give the named gear for free (no paidGold); M1-19 chooses sword or armor', () => {
  for (const [id, gid] of [['M1-17', 'SW02'], ['M1-18', 'AR03'], ['M1-20', 'SW08'], ['M1-21', 'AR09']]) {
    const r = land(id);
    const o = view(content, r.state).actions.find((a) => a.type === 'chooseOption');
    const w = choose(r.state, o.optionId);
    assert.ok(ownsGear(w.state, gid), id);
    assert.equal(gearOf(w.state, gid).paidGold, null);
    assert.equal(w.state.gold, r.state.gold);
  }
  const r = land('M1-19');
  assert.deepEqual(view(content, r.state).actions.filter((a) => a.type === 'chooseOption').map((a) => a.optionId).sort(), ['armor', 'sword']);
  const a = choose(r.state, 'armor').state;
  assert.ok(ownsGear(a, 'AR05') && !ownsGear(a, 'SW05'));
  const b = choose(r.state, 'sword').state;
  assert.ok(ownsGear(b, 'SW05') && !ownsGear(b, 'AR05'));
});

test('M1 battles use the enemy in the text (M1-22 EN01, M1-23 EN02, M1-24 EN09 patched)', () => {
  for (const [id, en] of [['M1-22', 'EN01'], ['M1-23', 'EN02'], ['M1-24', 'EN09'], ['M1-25', 'EN02'], ['M1-26', 'EN01'], ['M1-27', 'EN02']]) {
    const r = land(id);
    assert.equal(r.state.phase, 'battle', id);
    assert.equal(r.state.battle.enemyId, en, id);
  }
});

test('M1 item gifts: the named item enters the bag; a full bag asks for swap or decline', () => {
  for (const [id, it] of [['M1-28', 'AT01'], ['M1-29', 'BD02'], ['M1-30', 'HE03'], ['M1-31', 'BD06'], ['M1-32', 'AT07'], ['M1-33', 'HE09']]) {
    const r = land(id, { patch: { bag: [] } });
    const o = view(content, r.state).actions.find((a) => a.type === 'chooseOption');
    const w = choose(r.state, o.optionId);
    assert.deepEqual(w.state.bag, [it], id);
    const f = choose(land(id, { patch: { bag: FULL_BAG } }).state, o.optionId);
    assert.equal(f.state.phase, 'bagFull', id);
  }
});

test('M1 recovery squares: hp/mp amounts from the text, capped by the maximum', () => {
  const cases = [['M1-34', 20, 3, 25, 3], ['M1-35', 20, 3, 20, 6], ['M1-36', 20, 3, 26, 3], ['M1-37', 20, 3, 22, 5]];
  for (const [id, hp0, mp0, hp1, mp1] of cases) {
    const r = land(id, { patch: { hp: hp0, mp: mp0 } });
    assert.equal(r.state.phase, 'board', id);
    assert.equal(r.state.hp, hp1, id);
    assert.equal(r.state.mp, mp1, id);
  }
  assert.equal(land('M1-34', { patch: { hp: 38 } }).state.hp, 40); // capped at max hp
});

test('M1-38..41 are inns with the common services only', () => {
  for (const id of ['M1-38', 'M1-39', 'M1-40', 'M1-41']) {
    const r = land(id);
    assert.equal(r.state.phase, 'inn', id);
    assert.deepEqual(view(content, r.state).actions.filter((a) => a.type === 'service'), []);
  }
});

test('M1-42 choices; M1-43 red/white; M1-44 carrot/herb; M1-45 rest/demo', () => {
  let r = land('M1-42', { patch: { gold: 100, hp: 20 } });
  assert.equal(choose(r.state, 'wage').state.gold, 250);
  const l = choose(r.state, 'lunch').state;
  assert.equal(l.hp, 27); assert.equal(l.gold, 100);
  r = land('M1-43', { patch: { bag: [] } });
  assert.deepEqual(choose(r.state, 'red').state.bag, ['AT04']);
  assert.deepEqual(choose(r.state, 'white').state.bag, ['HE04']);
  r = land('M1-44', { patch: { hp: 20, mp: 3 } });
  const c = choose(r.state, 'carrot').state; assert.equal(c.hp, 26); assert.equal(c.mp, 3);
  const h = choose(r.state, 'herb').state; assert.equal(h.mp, 7); assert.equal(h.hp, 20);
  r = land('M1-45', { patch: { hp: 20, bag: [] } });
  assert.equal(choose(r.state, 'rest').state.hp, 24);
  const d = choose(r.state, 'demo').state; assert.deepEqual(d.bag, ['BD08']); assert.equal(d.hp, 20);
});

test('M1-46: helping costs 2 hp (floor 1) and pays 240G; passing changes nothing', () => {
  let r = land('M1-46', { patch: { hp: 20, gold: 10 } });
  let w = choose(r.state, 'help');
  assert.equal(w.state.hp, 18); assert.equal(w.state.gold, 250);
  assert.deepEqual(goldFx(w.effects), [[240, 'award']]);
  r = land('M1-46', { patch: { hp: 1, gold: 10 } });
  w = choose(r.state, 'help');
  assert.equal(w.state.hp, 1); assert.equal(w.state.gold, 250);
  const p = choose(r.state, 'pass').state;
  assert.equal(p.hp, 1); assert.equal(p.gold, 10);
});

test('M1-47: 70G for hp+5 mp+2; unaffordable is disabled and passing is free', () => {
  let r = land('M1-47', { patch: { gold: 70, hp: 20, mp: 3 } });
  let w = choose(r.state, 'drink').state;
  assert.equal(w.gold, 0); assert.equal(w.hp, 25); assert.equal(w.mp, 5);
  r = land('M1-47', { patch: { gold: 69, hp: 20, mp: 3 } });
  assert.equal(actionOf(r.state, 'drink').enabled, false);
  assert.equal(actionOf(r.state, 'drink').reason, 'insufficientGold');
  assert.throws(() => choose(r.state, 'drink'), /option_insufficientGold/);
  w = choose(r.state, 'pass').state;
  assert.equal(w.gold, 69); assert.equal(w.hp, 20);
});

test('M1 traps: 荷運び needs 60G, 自分で押す costs 3 hp (floor 1); 綿毛 2 hp; 銅皿 80G or 4 hp', () => {
  let r = land('M1-48', { patch: { gold: 59, hp: 20 } });
  assert.equal(actionOf(r.state, 'hire').enabled, false);
  assert.equal(choose(r.state, 'push').state.hp, 17);
  r = land('M1-48', { patch: { gold: 60, hp: 20 } });
  let w = choose(r.state, 'hire').state; assert.equal(w.gold, 0); assert.equal(w.hp, 20);
  assert.equal(choose(land('M1-48', { patch: { hp: 2 } }).state, 'push').state.hp, 1);
  assert.equal(choose(land('M1-49', { patch: { hp: 20 } }).state, 'pull').state.hp, 18);
  assert.equal(choose(land('M1-49', { patch: { hp: 2 } }).state, 'pull').state.hp, 1);
  r = land('M1-50', { patch: { gold: 79, hp: 20 } });
  assert.equal(actionOf(r.state, 'mat').enabled, false);
  assert.equal(choose(r.state, 'catch').state.hp, 16);
  r = land('M1-50', { patch: { gold: 100, hp: 20 } });
  w = choose(r.state, 'mat').state; assert.equal(w.gold, 20); assert.equal(w.hp, 20);
});

// ---- band 2 ----

test('M2 gold events pay the source amount (M2-01 220, M2-04 290, M2-11 340, M2-15 360, M2-16 330)', () => {
  for (const [id, amt] of [['M2-01', 220], ['M2-04', 290], ['M2-11', 340], ['M2-15', 360], ['M2-16', 330]]) {
    const r = land(id, { patch: { gold: 10 } });
    const only = view(content, r.state).actions.filter((a) => a.type === 'chooseOption');
    assert.equal(only.length, 1, id);
    const w = choose(r.state, only[0].optionId);
    assert.equal(w.state.gold, 10 + amt, id);
    assert.deepEqual(goldFx(w.effects), [[amt, 'award']]);
  }
});

test('M2 gear gifts: SW11 / AR12 / SW17 / AR19 free; M2-19 SW14 or AR14; M2-42 260G or AR16', () => {
  for (const [id, gid] of [['M2-17', 'SW11'], ['M2-18', 'AR12'], ['M2-20', 'SW17'], ['M2-21', 'AR19']]) {
    const r = land(id);
    const o = view(content, r.state).actions.find((a) => a.type === 'chooseOption');
    const w = choose(r.state, o.optionId).state;
    assert.ok(ownsGear(w, gid), id);
    assert.equal(gearOf(w, gid).paidGold, null);
  }
  const r = land('M2-19');
  assert.ok(ownsGear(choose(r.state, 'sword').state, 'SW14') && !ownsGear(choose(r.state, 'sword').state, 'AR14'));
  assert.ok(ownsGear(choose(r.state, 'armor').state, 'AR14') && !ownsGear(choose(r.state, 'armor').state, 'SW14'));
  const c = land('M2-42', { patch: { gold: 40 } });
  const gold = choose(c.state, 'gold');
  assert.equal(gold.state.gold, 300); assert.ok(!ownsGear(gold.state, 'AR16'));
  assert.deepEqual(goldFx(gold.effects), [[260, 'award']]);
  const armor = choose(c.state, 'armor').state;
  assert.ok(ownsGear(armor, 'AR16')); assert.equal(armor.gold, 40);
});

test('M2 battles: EN03 (22/24/26) and EN04 (23/25/27)', () => {
  for (const [id, en] of [['M2-22', 'EN03'], ['M2-23', 'EN04'], ['M2-24', 'EN03'], ['M2-25', 'EN04'], ['M2-26', 'EN03'], ['M2-27', 'EN04']]) {
    const r = land(id);
    assert.equal(r.state.phase, 'battle', id);
    assert.equal(r.state.battle.enemyId, en, id);
  }
});

test('M2 item gifts: BD11 HE12 AT13 BD15 HE16 AT19 enter the bag', () => {
  for (const [id, it] of [['M2-28', 'BD11'], ['M2-29', 'HE12'], ['M2-30', 'AT13'], ['M2-31', 'BD15'], ['M2-32', 'HE16'], ['M2-33', 'AT19']]) {
    const r = land(id, { patch: { bag: [] } });
    const o = view(content, r.state).actions.find((a) => a.type === 'chooseOption');
    assert.deepEqual(choose(r.state, o.optionId).state.bag, [it], id);
  }
});

test('M2 recovery squares: 34 hp+8, 35 mp+4, 36 hp+7 mp+1, 37 hp+3 mp+3', () => {
  for (const [id, hp1, mp1] of [['M2-34', 28, 3], ['M2-35', 20, 7], ['M2-36', 27, 4], ['M2-37', 23, 6]]) {
    const s = land(id, { patch: { hp: 20, mp: 3 } }).state;
    assert.equal(s.phase, 'board');
    assert.equal(s.hp, hp1, id); assert.equal(s.mp, mp1, id);
  }
});

test('M2-43/44/47 choices and M2-46 purchase (73G, HE20; unaffordable or declined changes nothing)', () => {
  let r = land('M2-43', { patch: { hp: 20, mp: 3 } });
  assert.equal(choose(r.state, 'dango').state.hp, 28);
  assert.equal(choose(r.state, 'tea').state.mp, 8);
  r = land('M2-44', { patch: { bag: [] } });
  assert.deepEqual(choose(r.state, 'red').state.bag, ['AT18']);
  assert.deepEqual(choose(r.state, 'blue').state.bag, ['BD18']);
  r = land('M2-47', { patch: { hp: 20, mp: 3 } });
  assert.equal(choose(r.state, 'bench').state.hp, 29);
  const s = choose(r.state, 'song').state; assert.equal(s.hp, 23); assert.equal(s.mp, 7);
  r = land('M2-46', { patch: { gold: 73, bag: [] } });
  const b = choose(r.state, 'buy').state; assert.equal(b.gold, 0); assert.deepEqual(b.bag, ['HE20']);
  r = land('M2-46', { patch: { gold: 72, bag: [] } });
  assert.equal(actionOf(r.state, 'buy').reason, 'insufficientGold');
  const n = choose(r.state, 'return').state; assert.equal(n.gold, 72); assert.deepEqual(n.bag, []);
});

test('M2-45: help costs 3 hp (floor 1) and pays 350G; the flag changes nothing', () => {
  let r = land('M2-45', { patch: { hp: 20, gold: 0 } });
  let w = choose(r.state, 'help'); assert.equal(w.state.hp, 17); assert.equal(w.state.gold, 350);
  assert.deepEqual(goldFx(w.effects), [[350, 'award']]);
  r = land('M2-45', { patch: { hp: 2, gold: 0 } });
  assert.equal(choose(r.state, 'help').state.hp, 1);
  w = choose(r.state, 'flag').state; assert.equal(w.hp, 2); assert.equal(w.gold, 0);
});

test('M2 traps: 48 hp-3; 49 boat 90G or untie hp-4; 50 board 100G or rail hp-3 (all floor 1, all trapLoss)', () => {
  assert.equal(choose(land('M2-48', { patch: { hp: 20 } }).state, 'wait').state.hp, 17);
  assert.equal(choose(land('M2-48', { patch: { hp: 3 } }).state, 'wait').state.hp, 1);
  let r = land('M2-49', { patch: { gold: 89, hp: 20 } });
  assert.equal(actionOf(r.state, 'boat').enabled, false);
  assert.equal(choose(r.state, 'untie').state.hp, 16);
  assert.equal(choose(land('M2-49', { patch: { gold: 90, hp: 20 } }).state, 'boat').state.gold, 0);
  r = land('M2-50', { patch: { gold: 99, hp: 20 } });
  assert.equal(actionOf(r.state, 'board').enabled, false);
  const w = choose(r.state, 'rail'); assert.equal(w.state.hp, 17);
  assert.ok(w.effects.some((e) => e.t === 'hp' && e.trapLoss));
  assert.equal(choose(land('M2-50', { patch: { gold: 100, hp: 20 } }).state, 'board').state.gold, 0);
});
