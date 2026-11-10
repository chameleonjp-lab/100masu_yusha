import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, view } from '../src/engine/index.js';
import { validateScripts } from '../src/content/validate.js';
import { coverage, isScripted } from '../src/content/index.js';
import { cl, exampleRun, fxOf, getContent, landOnEvent, place, withSquare } from './fixtures/helpers.mjs';

const content = await getContent();
const reload = (s) => JSON.parse(JSON.stringify(s)); // what a save/load round trip does to a run

const choose = (s, optionId, input) => dispatch(content, s, { type: 'chooseOption', optionId, ...(input !== undefined ? { input } : {}) });
const optionOf = (s, id) => view(content, s).actions.find((a) => a.type === 'chooseOption' && a.optionId === id);

test('M1-42: wage pays 150G once; lunch heals 7 and pays 0G; save/reload does not pay twice', () => {
  const base = exampleRun(content, 'M');
  // wage
  let r = landOnEvent(content, base, 'M1-42', { pos: 10, die: 3 });
  assert.equal(r.state.phase, 'event');
  assert.equal(r.state.prompt.kind, 'choice');
  const before = r.state.gold;
  const saved = reload(r.state); // closed the tab before choosing: the same options come back
  const w = choose(saved, 'wage');
  assert.equal(w.state.gold, before + 150);
  assert.equal(w.state.awards['10'], 150);
  assert.equal(w.state.phase, 'board');
  assert.deepEqual(fxOf(w.effects, 'gold').map((e) => [e.delta, e.reason]), [[150, 'award']]);
  // after the choice there is nothing left to claim and a reload changes nothing
  const again = reload(w.state);
  assert.throws(() => choose(again, 'wage'), /illegal_action/);
  assert.equal(again.gold, before + 150);
  // walking back onto the same square in the same run (state surgery) does not pay again
  const back = place(again, 9);
  const second = dispatch(content, dispatch(content, back, { type: 'roll' }, { rolls: [0.01] }).state, { type: 'move' });
  assert.equal(second.state.phase, 'event');
  const skipped = choose(second.state, 'wage');
  assert.equal(skipped.state.gold, before + 150);
  assert.ok(fxOf(skipped.effects, 'awardSkipped').length === 1);

  // lunch
  let l = landOnEvent(content, base, 'M1-42', { pos: 10, die: 3, patch: { hp: 20 } });
  const lunch = choose(l.state, 'lunch');
  assert.equal(lunch.state.hp, 27);
  assert.equal(lunch.state.gold, l.state.gold);
  assert.equal(lunch.state.awards['10'], undefined);
  assert.deepEqual(fxOf(lunch.effects, 'gold'), []);
});

test('opId replay is a no-op (same state object, no effects, no revision bump)', () => {
  const base = exampleRun(content, 'M');
  const r = landOnEvent(content, base, 'M1-42', { pos: 10, die: 3 });
  const w = dispatch(content, r.state, { type: 'chooseOption', optionId: 'wage', opId: 'op-wage' });
  const replay = dispatch(content, w.state, { type: 'chooseOption', optionId: 'wage', opId: 'op-wage' });
  assert.equal(replay.replay, true);
  assert.deepEqual(replay.effects, []);
  assert.equal(replay.state.gold, w.state.gold);
  assert.equal(replay.state.revision, w.state.revision);
  assert.equal(w.state.revision, r.state.revision + 1);
});

test('M1-48: 60G or hp-3 (floor 1); without the money the hp option still works', () => {
  const base = exampleRun(content, 'M');
  let r = landOnEvent(content, base, 'M1-48', { pos: 10, die: 3 });
  assert.equal(optionOf(r.state, 'hire').enabled, true);
  assert.equal(optionOf(r.state, 'hire').afterGold, 140);
  const hire = choose(r.state, 'hire');
  assert.equal(hire.state.gold, 140);
  assert.equal(hire.state.hp, 40);

  r = landOnEvent(content, base, 'M1-48', { pos: 10, die: 3, patch: { gold: 59 } });
  const hireOpt = optionOf(r.state, 'hire');
  assert.equal(hireOpt.enabled, false);
  assert.equal(hireOpt.reason, 'insufficientGold');
  assert.equal(hireOpt.shortfall, 1);
  assert.throws(() => choose(r.state, 'hire'), /option_insufficientGold/);
  const push = choose(r.state, 'push');
  assert.equal(push.state.hp, 37);
  assert.equal(push.state.gold, 59);
  assert.equal(fxOf(push.effects, 'hp')[0].trapLoss, true);

  r = landOnEvent(content, base, 'M1-48', { pos: 10, die: 3, patch: { hp: 2 } });
  assert.equal(choose(r.state, 'push').state.hp, 1);
  r = landOnEvent(content, base, 'M1-48', { pos: 10, die: 3, patch: { hp: 1 } });
  assert.equal(choose(r.state, 'push').state.hp, 1);
});

test('B2-48: stone costs 2 (die 1-3) or 4 (die 4-6) hp with floor 1; pole costs 100G; the card (AT02) makes it free', () => {
  const base = exampleRun(content, 'B');
  const low = landOnEvent(content, base, 'B2-48', { pos: 23, die: 3 });
  assert.equal(choose(low.state, 'stone').state.hp, 38);
  const high = landOnEvent(content, base, 'B2-48', { pos: 23, die: 5 });
  assert.equal(choose(high.state, 'stone').state.hp, 36);
  const frail = landOnEvent(content, base, 'B2-48', { pos: 23, die: 6, patch: { hp: 3 } });
  assert.equal(choose(frail.state, 'stone').state.hp, 1);
  assert.equal(choose(high.state, 'pole').state.gold, 100);
  const poor = landOnEvent(content, base, 'B2-48', { pos: 23, die: 4, patch: { gold: 99 } });
  assert.equal(optionOf(poor.state, 'pole').enabled, false);

  // the card: offered in the trap, no loss, consumed, the square is resolved
  const carded = landOnEvent(content, base, 'B2-48', { pos: 23, die: 5, patch: { bag: ['AT02', 'HE01'] } });
  const card = view(content, carded.state).actions.find((a) => a.type === 'useItem' && a.itemId === 'AT02');
  assert.equal(card.enabled, true);
  const used = dispatch(content, carded.state, { type: 'useItem', itemId: 'AT02' });
  assert.equal(used.state.hp, 40);
  assert.equal(used.state.gold, 200);
  assert.deepEqual(used.state.bag, ['HE01']);
  assert.equal(used.state.phase, 'board');
  assert.ok(fxOf(used.effects, 'trapAvoided').length === 1);
});

test('F5-13: SW50 for 3000G is only possible with 3000G (2999 fails); the inspection is free of gold and costs 2 hp', () => {
  const base = exampleRun(content, 'F');
  const poor = landOnEvent(content, base, 'F5-13', { pos: 90, die: 3, patch: { gold: 2999 } });
  const buyOpt = optionOf(poor.state, 'buy');
  assert.equal(buyOpt.enabled, false);
  assert.equal(buyOpt.shortfall, 1);
  assert.throws(() => choose(poor.state, 'buy'), /option_insufficientGold/);
  const inspect = choose(poor.state, 'inspect');
  assert.equal(inspect.state.hp, 38);
  assert.equal(inspect.state.gold, 2999);
  const sw42 = inspect.state.gear.find((g) => g.id === 'SW42');
  assert.ok(sw42);
  assert.equal(sw42.paidGold, null);
  assert.ok(!inspect.state.gear.some((g) => g.id === 'SW50'));

  const rich = landOnEvent(content, base, 'F5-13', { pos: 90, die: 3, patch: { gold: 3000 } });
  assert.equal(optionOf(rich.state, 'buy').enabled, true);
  const bought = choose(rich.state, 'buy');
  assert.equal(bought.state.gold, 0);
  const sw50 = bought.state.gear.find((g) => g.id === 'SW50');
  assert.equal(sw50.paidGold, 3000);
  assert.ok(bought.state.discovered.gear.includes('SW50'));

  // paying cash for gear you already own is blocked, the free option stays available
  const owned = landOnEvent(content, base, 'F5-13', { pos: 90, die: 3, patch: { gold: 3000, gear: [...base.gear, { iid: 'g9', id: 'SW50', paidGold: null, from: 'drop' }] } });
  assert.equal(optionOf(owned.state, 'buy').enabled, false);
  assert.equal(optionOf(owned.state, 'buy').reason, 'alreadyOwned');
  assert.equal(optionOf(owned.state, 'inspect').enabled, true);
});

test('B3-26: a correct total of 7 shaves 5 off the enemy hp (min 1); a wrong one costs 2 mp (min 0)', () => {
  const base = exampleRun(content, 'B');
  const land = landOnEvent(content, base, 'B3-26', { pos: 50, die: 3 });
  assert.equal(land.state.turn.die, 3);
  const good = choose(land.state, 'answer', 4);
  assert.equal(good.state.phase, 'battle');
  assert.equal(good.state.battle.enemy.hp, content.enemies.EN05.maxHp - 5);
  assert.equal(good.state.mp, land.state.mp);
  const bad = choose(land.state, 'answer', 5);
  assert.equal(bad.state.battle.enemy.hp, content.enemies.EN05.maxHp);
  assert.equal(bad.state.mp, land.state.mp - 2);
  const empty = landOnEvent(content, base, 'B3-26', { pos: 50, die: 3, patch: { mp: 1 } });
  assert.equal(choose(empty.state, 'answer', 1).state.mp, 0);
  assert.throws(() => choose(land.state, 'answer', 9), /option_inputInvalid/);
  assert.throws(() => choose(land.state, 'answer'), /option_inputInvalid/);
});

test('B2-02: both options pay 240G once; the rope costs 2 hp and reveals the next normal battle enemy', () => {
  const base = exampleRun(content, 'B');
  const wait = landOnEvent(content, base, 'B2-02', { pos: 23, die: 3 });
  const w = choose(wait.state, 'wait');
  assert.equal(w.state.gold, 440);
  assert.equal(w.state.reveals.length, 0);
  const rope = landOnEvent(content, base, 'B2-02', { pos: 23, die: 3 });
  const r = choose(rope.state, 'rope');
  assert.equal(r.state.gold, 440);
  assert.equal(r.state.hp, 38);
  const rev = r.state.reveals[0];
  assert.equal(rev.kind, 'nextBattleEnemy');
  assert.equal(rev.data.battles.length, 1);
  assert.match(rev.data.battles[0].enemyId, /^(EN|MB)/);
});

test('B2-43: blowing the whistle starts a normal battle (flee allowed, no reward); returning it heals 3 mp', () => {
  const base = exampleRun(content, 'B');
  const r = landOnEvent(content, base, 'B2-43', { pos: 23, die: 3, patch: { mp: 4 } });
  const rel = choose(r.state, 'release');
  assert.equal(rel.state.mp, 7);
  assert.equal(rel.state.phase, 'board');
  const blow = choose(r.state, 'blow');
  assert.equal(blow.state.phase, 'battle');
  assert.equal(blow.state.battle.enemyId, 'EN03');
  const fled = dispatch(content, blow.state, { type: 'flee' });
  assert.equal(fled.state.phase, 'board');
  assert.equal(fled.state.gold, 200);
  assert.equal(fled.state.xp, r.state.xp);
  assert.deepEqual(fxOf(fled.effects, 'rewards'), []);
});

test('equipment events: free vs paid, paidGold provenance recorded', () => {
  const base = exampleRun(content, 'F');
  let r = landOnEvent(content, base, 'F2-20', { pos: 30, die: 2 });
  assert.equal(optionOf(r.state, 'paid').enabled, true);
  const paid = choose(r.state, 'paid');
  assert.equal(paid.state.gold, 20);
  assert.equal(paid.state.gear.find((g) => g.id === 'AR20').paidGold, 180);
  const poor = landOnEvent(content, base, 'F2-20', { pos: 30, die: 2, patch: { gold: 179 } });
  assert.equal(optionOf(poor.state, 'paid').enabled, false);
  assert.ok(choose(poor.state, 'plain').state.gear.some((g) => g.id === 'AR12'));
  r = landOnEvent(content, base, 'H3-46', { pos: 50, die: 2 });
  assert.equal(choose(r.state, 'pass').state.gear.length, 2);
  const heel = choose(landOnEvent(content, base, 'H3-46', { pos: 50, die: 2, patch: { mp: 0 } }).state, 'heel');
  assert.equal(heel.state.mp, 6);
  assert.equal(heel.state.hp, 38);
  const mallet = choose(r.state, 'mallet');
  assert.equal(mallet.state.gear.find((g) => g.id === 'SW29').paidGold, 80);
  r = landOnEvent(content, base, 'M3-44', { pos: 50, die: 2 });
  const sw27 = choose(r.state, 'buy');
  assert.equal(sw27.state.gold, 0 === 1 ? 0 : 200 - 420 < 0 ? 200 : 0);
});

test('item events: free vs paid; swapping an item needs the item and room for both results', () => {
  const base = exampleRun(content, 'B');
  const r = landOnEvent(content, base, 'B3-32', { pos: 50, die: 2 });
  assert.deepEqual(choose(r.state, 'free').state.bag, ['HE01', 'BD01', 'BD21']);
  assert.deepEqual(choose(r.state, 'paid').state.bag, ['HE01', 'BD01', 'BD22']);
  assert.equal(choose(r.state, 'paid').state.gold, 117);
  const sw = landOnEvent(content, base, 'B3-46', { pos: 50, die: 2 });
  assert.equal(optionOf(sw.state, 'swap').enabled, false);
  assert.equal(optionOf(sw.state, 'swap').reason, 'missingItem');
  const has = landOnEvent(content, base, 'B3-46', { pos: 50, die: 2, patch: { bag: ['AT27', 'HE01'] } });
  const done = choose(has.state, 'swap');
  assert.deepEqual(done.state.bag, ['HE01', 'BD27', 'BD27']);
});

test('bag full (6): an event item offers swap or decline; the choice keeps the rest of the effects and the pending prompt survives a reload', () => {
  const base = exampleRun(content, 'B');
  const full = ['HE01', 'HE02', 'BD01', 'AT01', 'AT02', 'AT03'];
  const r = landOnEvent(content, base, 'B3-32', { pos: 50, die: 2, patch: { bag: full } });
  const got = choose(r.state, 'free');
  assert.equal(got.state.phase, 'bagFull');
  assert.equal(got.state.prompt.itemId, 'BD21');
  assert.equal(got.state.bag.length, 6);
  const v = view(content, got.state);
  assert.deepEqual(v.actions.filter((a) => a.type === 'bagSwap').length, 6);
  const reloaded = reload(got.state);
  const swapped = dispatch(content, reloaded, { type: 'bagSwap', index: 5 });
  assert.equal(swapped.state.bag.length, 6);
  assert.ok(swapped.state.bag.includes('BD21'));
  assert.ok(!swapped.state.bag.includes('AT03'));
  assert.equal(swapped.state.phase, 'board');
  const declined = dispatch(content, reloaded, { type: 'bagDecline' });
  assert.deepEqual(declined.state.bag, full);
  assert.equal(declined.state.phase, 'board');
  // purchases are not offered a swap at all: the buy action is simply disabled (see facilities tests)
});

test('M1-18 then the chest on square 5: AR03 is paid once; reloading before the chest pick resumes with the same candidates', () => {
  const base = exampleRun(content, 'M');
  const r = landOnEvent(content, base, 'M1-18', { pos: 5, die: 3 });
  assert.equal(r.state.pos, 5);
  assert.equal(r.state.phase, 'event');
  const t = base.board.squares[4].treasure;
  const got = choose(r.state, 'tie');
  assert.equal(got.state.phase, 'chest');
  assert.equal(got.state.gear.filter((g) => g.id === 'AR03').length, 1);
  const reloaded = reload(got.state);
  const v = view(content, reloaded);
  assert.equal(v.chest.candidates.length, 2);
  assert.deepEqual(v.chest.candidates.map((c) => c.id), t.candidateIds.slice(0, 2));
  const pick = dispatch(content, reloaded, { type: 'pickChest', index: 1 });
  assert.equal(pick.state.phase, 'board');
  assert.equal(pick.state.gear.filter((g) => g.id === 'AR03').length, 1);
  assert.equal(pick.state.bag.filter((x) => x === t.candidateIds[1]).length, 1);
  assert.equal(pick.state.chests['5'].taken, t.candidateIds[1]);
  // the other candidate cannot be taken afterwards
  assert.throws(() => dispatch(content, pick.state, { type: 'pickChest', index: 0 }), /illegal_action/);
});

test('chest: bard sees 3 candidates; owned gear / learned spells are replaced by fallbacks without duplicates', () => {
  const base = exampleRun(content, 'M');
  let t = withSquare(base, 5, 'M1-18', { candidateIds: ['AR01', 'SW01', 'AT06'], fallbackItemIds: ['AT04', 'HE10', 'AT01'] });
  t = place(t, 3, { job: 'JB03' });
  const r = dispatch(content, dispatch(content, t, { type: 'roll' }, { rolls: [(2 - 0.5) / 6] }).state, { type: 'move' });
  const got = choose(r.state, 'tie');
  const v = view(content, got.state);
  assert.equal(v.chest.choices, 3);
  // AR01 and SW01 are owned: replaced by AT04 and HE10, AT06 stays
  assert.deepEqual(v.chest.candidates.map((c) => c.id), ['AT04', 'HE10', 'AT06']);
  assert.equal(new Set(v.chest.candidates.map((c) => c.id)).size, 3);
  const t2 = place(withSquare(base, 5, 'M1-18', { candidateIds: ['AR01', 'SW01', 'AT06'], fallbackItemIds: ['AT04', 'HE10', 'AT01'] }), 3);
  const r2 = dispatch(content, dispatch(content, t2, { type: 'roll' }, { rolls: [(2 - 0.5) / 6] }).state, { type: 'move' });
  const v2 = view(content, choose(r2.state, 'tie').state);
  assert.equal(v2.chest.choices, 2);
  assert.deepEqual(v2.chest.candidates.map((c) => c.id), ['AT04', 'HE10']);
});

test('H4-25 (recovery): heals 7 when hurt; at full hp it hands out HE37 instead', () => {
  const base = exampleRun(content, 'H');
  const hurt = landOnEvent(content, base, 'H4-25', { pos: 70, die: 2, patch: { hp: 30 } });
  assert.equal(hurt.state.hp, 37);
  assert.equal(hurt.state.phase, 'board');
  const fine = landOnEvent(content, base, 'H4-25', { pos: 70, die: 2 });
  assert.deepEqual(fine.state.bag, ['HE01', 'BD01', 'HE37']);
  assert.equal(fine.state.hp, 40);
});

test('H1-37 inn: the wash (hp+2) and the free rest are separate one-time actions', () => {
  const base = exampleRun(content, 'H');
  let t = withSquare(base, 5, 'H1-37');
  t = place(t, 4, { hp: 10 });
  const arrive = dispatch(content, dispatch(content, t, { type: 'roll' }, { rolls: [0.01] }).state, { type: 'move' });
  assert.equal(arrive.state.phase, 'inn');
  const v = view(content, arrive.state);
  assert.equal(v.inn.services.length, 1);
  const wash = dispatch(content, arrive.state, { type: 'service', serviceId: 'wash' });
  assert.equal(wash.state.hp, 12);
  assert.throws(() => dispatch(content, wash.state, { type: 'service', serviceId: 'wash' }), /service_used/);
  const rest = dispatch(content, wash.state, { type: 'rest' });
  assert.equal(rest.state.hp, 32); // +ceil(40/2)
  assert.equal(rest.state.mp, 10);
  assert.throws(() => dispatch(content, rest.state, { type: 'rest' }), /rest_used/);
  // reload: neither can be taken again
  const again = reload(rest.state);
  assert.throws(() => dispatch(content, again, { type: 'service', serviceId: 'wash' }), /service_used/);
});

test('unscripted events are visible as unscripted: the engine never invents a behaviour for them', () => {
  const base = exampleRun(content, 'M');
  const id = 'M1-02';
  assert.equal(isScripted(content, 'event', id), false);
  const r = landOnEvent(content, base, id, { pos: 10, die: 3 });
  const v = view(content, r.state);
  assert.equal(v.event.unscripted, true);
  assert.deepEqual(v.actions.map((a) => a.type), ['skipUnscripted']);
  assert.deepEqual(r.state.unscripted, [id]);
  assert.ok(fxOf(r.effects, 'unscripted').length === 1);
  assert.equal(r.state.gold, 200);
  const cov = coverage(content);
  assert.equal(cov.events.total, 1000);
  assert.ok(cov.events.unscripted.includes(id));
  assert.ok(!cov.events.unscripted.includes('M1-42'));
  assert.ok(cov.items.unscripted.includes('HE03'));
  assert.ok(cov.equipment.unscripted.includes('SW02'));
  assert.equal(cov.complete, false);
});

test('unscripted items cannot be used and say so', () => {
  const base = exampleRun(content, 'M');
  const t = place(base, 10, { bag: ['HE03', 'HE01'] });
  const acts = view(content, t).actions.filter((a) => a.type === 'useItem');
  assert.equal(acts.find((a) => a.itemId === 'HE03').reason, 'unscripted');
  assert.throws(() => dispatch(content, t, { type: 'useItem', itemId: 'HE03' }), /item_unscripted/);
});

test('script validation catches an award that does not match the event, unknown ops/refs and a bare event', () => {
  const copy = { ...content, scripts: { ...content.scripts, events: { ...content.scripts.events } } };
  copy.scripts.events['M1-02'] = { id: 'M1-02', options: [{ id: 'a', label: 'x', effects: [{ op: 'awardGold', amount: 250 }, { op: 'nope' }, { op: 'hp', delta: { ref: 'bogus' } }] }] };
  copy.scripts.events['M1-03'] = { id: 'M1-03' };
  const problems = [];
  validateScripts(copy, problems);
  const codes = problems.filter((p) => p.level === 'error').map((p) => p.code);
  assert.ok(codes.includes('script-award'));
  assert.ok(codes.includes('script-op'));
  assert.ok(codes.includes('script-ref'));
  assert.ok(codes.includes('script-empty'));
});

test('dispatch never mutates its input and illegal actions leave the state untouched', () => {
  const base = exampleRun(content, 'M');
  const frozen = cl(base);
  assert.throws(() => dispatch(content, base, { type: 'move' }), /illegal_action/);
  assert.throws(() => dispatch(content, base, { type: 'buy', slot: 0 }), /illegal_action/);
  assert.throws(() => dispatch(content, base, { type: 'nonsense' }), /unknown_action/);
  dispatch(content, base, { type: 'roll' });
  assert.deepEqual(base, frozen);
});
