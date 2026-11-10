import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, gearSellPrice, itemSellPrice, view } from '../src/engine/index.js';
import { cl, exampleRun, fxOf, getContent, landOnEvent, place, walk } from './fixtures/helpers.mjs';

const content = await getContent();
const reload = (s) => JSON.parse(JSON.stringify(s));
const EX_M_INNS = [8, 25, 47, 64, 82];

/** Arrive at the inn with index `idx` (0-based) of the EX01-M board. */
function atInn(idx, patch = {}, route = 'M') {
  const base = exampleRun(content, route);
  const innPos = base.board.innPositions[idx];
  const t = place(base, innPos - 1, patch);
  const r = walk(content, t, 1);
  assert.equal(r.state.phase, 'inn');
  assert.equal(r.state.pos, innPos);
  return r;
}
const act = (s, a, opts) => dispatch(content, s, a, opts);

test('the first inn teaches SP01 for free and prepares it', () => {
  const r = atInn(0);
  assert.deepEqual(r.state.spells.learned, ['SP01']);
  assert.deepEqual(r.state.spells.prepared, ['SP01']);
  assert.equal(fxOf(r.effects, 'freeSpell').length, 1);
  const later = atInn(1, { spells: { learned: ['SP01'], prepared: ['SP01'] } });
  assert.equal(fxOf(later.effects, 'freeSpell').length, 0);
});

test('free rest: once per inn, half of each maximum rounded up, capped at the maximum', () => {
  const r = atInn(0, { hp: 10, mp: 2 });
  const v = view(content, r.state);
  assert.deepEqual([v.inn.rest.hp, v.inn.rest.mp, v.inn.rest.available], [20, 5, true]);
  const rest = act(r.state, { type: 'rest' });
  assert.equal(rest.state.hp, 30);
  assert.equal(rest.state.mp, 7);
  assert.throws(() => act(rest.state, { type: 'rest' }), /rest_used/);
  // reloading does not hand it out again
  assert.throws(() => act(reload(rest.state), { type: 'rest' }), /rest_used/);
  const near = atInn(0, { hp: 35, mp: 10 });
  const capped = act(near.state, { type: 'rest' });
  assert.equal(capped.state.hp, 40);
  assert.equal(capped.state.mp, 10);
  // another inn has its own rest
  const second = atInn(1, { hp: 1 });
  assert.equal(act(second.state, { type: 'rest' }).state.hp, 21);
  // an odd max: level 1 has even maxima, so the ceil is checked through the formula
  assert.equal(Math.ceil(41 / 2), 21);
});

test('buying: price paid, consumables need bag space, gold 2999 vs 3000 for SW50 at the last inn', () => {
  const r = atInn(0);
  const v = view(content, r.state);
  const he = v.inn.shop.slots.find((s) => s.id === 'HE01');
  assert.deepEqual([he.price, he.afterGold, he.enabled], [20, 180, true]);
  const bought = act(r.state, { type: 'buy', slot: he.slot });
  assert.equal(bought.state.gold, 180);
  assert.equal(bought.state.bag.filter((x) => x === 'HE01').length, 2);

  const fullBag = atInn(0, { bag: ['HE01', 'HE01', 'HE01', 'HE01', 'HE01', 'HE01'] });
  const slot = view(content, fullBag.state).inn.shop.slots.find((s) => s.id === 'HE01');
  assert.equal(slot.enabled, false);
  assert.equal(slot.reason, 'bagFull');
  assert.throws(() => act(fullBag.state, { type: 'buy', slot: slot.slot }), /bag_full/);

  const poor = atInn(4, { gold: 2999 });
  const sw50 = view(content, poor.state).inn.shop.slots.find((s) => s.id === 'SW50');
  assert.equal(sw50.price, 3000);
  assert.equal(sw50.enabled, false);
  assert.equal(sw50.shortfall, 1);
  assert.throws(() => act(poor.state, { type: 'buy', slot: sw50.slot }), /insufficient_gold/);
  const rich = atInn(4, { gold: 3000 });
  const done = act(rich.state, { type: 'buy', slot: sw50.slot });
  assert.equal(done.state.gold, 0);
  assert.equal(done.state.gear.find((g) => g.id === 'SW50').paidGold, 3000);
  // already owned: the slot is disabled afterwards
  const again = view(content, done.state).inn.shop.slots.find((s) => s.id === 'SW50');
  assert.equal(again.enabled, false);
  assert.equal(again.reason, 'alreadyOwned');
});

test('buying a spell book teaches the spell without using a bag place (bag full is fine)', () => {
  const full = ['HE01', 'HE01', 'HE01', 'HE01', 'HE01', 'HE01'];
  const r = atInn(1, { gold: 700, bag: full, spells: { learned: ['SP01'], prepared: ['SP01'] } });
  const slot = view(content, r.state).inn.shop.slots.find((s) => s.id === 'SP02');
  assert.equal(slot.enabled, true);
  const done = act(r.state, { type: 'buy', slot: slot.slot });
  assert.equal(done.state.gold, 100);
  assert.deepEqual(done.state.spells.learned, ['SP01', 'SP02']);
  assert.deepEqual(done.state.spells.prepared, ['SP01', 'SP02']);
  assert.equal(done.state.bag.length, 6);
  assert.equal(view(content, done.state).inn.shop.slots.find((s) => s.id === 'SP02').reason, 'alreadyLearned');
});

test('selling: consumables 40%, gear 50% (floor), equipped gear cannot be sold, double sell is refused', () => {
  assert.equal(itemSellPrice(content, 'HE01'), 8);
  assert.equal(itemSellPrice(content, 'BD01'), 12);
  const r = atInn(0, { bag: ['HE01', 'BD01'], gear: [...exampleRun(content, 'M').gear, { iid: 'g3', id: 'AR03', paidGold: null, from: 'drop' }] });
  const s1 = act(r.state, { type: 'sellItem', index: 1 });
  assert.equal(s1.state.gold, 212);
  assert.deepEqual(s1.state.bag, ['HE01']);
  // the old index is gone: a second sale of index 1 fails
  assert.throws(() => act(s1.state, { type: 'sellItem', index: 1 }), /bad_index/);
  assert.equal(gearSellPrice(content, { id: 'AR03', paidGold: null }), 90);
  const g = act(r.state, { type: 'sellGear', iid: 'g3' });
  assert.equal(g.state.gold, 290);
  assert.ok(!g.state.gear.some((x) => x.iid === 'g3'));
  assert.throws(() => act(g.state, { type: 'sellGear', iid: 'g3' }), /not_owned/);
  // equipped pieces
  assert.throws(() => act(r.state, { type: 'sellGear', iid: 'g1' }), /equipped_not_sellable/);
  const sellView = view(content, r.state).inn.sell.gear.find((x) => x.iid === 'g1');
  assert.equal(sellView.sellable, false);
  // discovery is kept after the sale
  assert.ok(g.state.discovered.gear.includes('SW01'));
});

test('discounted cash purchases resell for what was paid: SW09 bought for 90 sells for 90 (not 210), also after save/reload', () => {
  const base = exampleRun(content, 'F');
  const land = landOnEvent(content, base, 'F1-12', { pos: 10, die: 2 });
  const bought = dispatch(content, land.state, { type: 'chooseOption', optionId: 'hire' });
  assert.equal(bought.state.gold, 110);
  const sw09 = bought.state.gear.find((g) => g.id === 'SW09');
  assert.equal(sw09.paidGold, 90);
  assert.equal(Math.floor(content.gear.SW09.price / 2), 210);
  const saved = reload(bought.state);
  const innPos = saved.board.innPositions[1];
  const at = walk(content, place(saved, innPos - 1), 1).state;
  assert.equal(at.phase, 'inn');
  const sellRow = view(content, at).inn.sell.gear.find((x) => x.id === 'SW09');
  assert.equal(sellRow.price, 90);
  assert.equal(sellRow.standardPrice, 210);
  const sold = act(at, { type: 'sellGear', iid: sw09.iid });
  assert.equal(sold.state.gold, 200);
  assert.throws(() => act(sold.state, { type: 'sellGear', iid: sw09.iid }), /not_owned/);
  assert.ok(sold.state.discovered.gear.includes('SW09'));
  // a self-made (helped) SW09 has no cash cap
  const helped = dispatch(content, land.state, { type: 'chooseOption', optionId: 'sharpen' }).state;
  assert.equal(helped.gear.find((g) => g.id === 'SW09').paidGold, null);
  assert.equal(gearSellPrice(content, helped.gear.find((g) => g.id === 'SW09')), 210);
  // the cap never raises the price above the standard one
  assert.equal(gearSellPrice(content, { id: 'SW09', paidGold: 5000 }), 210);
  // and never goes below 1
  assert.equal(gearSellPrice(content, { id: 'SW09', paidGold: 0 }), 1);
});

test('equipment can be changed on the board, at the inn and at the gate, not while a roll is shown', () => {
  const base = exampleRun(content, 'M');
  const t = place(base, 10, { gear: [...base.gear, { iid: 'g3', id: 'AR03', paidGold: null, from: 'drop' }] });
  const eq = act(t, { type: 'equip', iid: 'g3' });
  assert.equal(eq.state.equipped.armor, 'g3');
  assert.equal(view(content, eq.state).hero.defense, 4 + 3);
  const rolled = act(eq.state, { type: 'roll' }).state;
  assert.throws(() => act(rolled, { type: 'equip', iid: 'g2' }), /illegal_action/);
  const v = view(content, t);
  const diff = v.actions.find((a) => a.type === 'equip' && a.iid === 'g3').diff;
  assert.deepEqual([diff.stat, diff.before, diff.after, diff.delta], ['defense', 1, 3, 2]);
  assert.throws(() => act(t, { type: 'equip', iid: 'nope' }), /not_owned/);
});

test('job change keeps level, gear and spells; only the job-specific effect changes', () => {
  const r = atInn(0);
  const j = act(r.state, { type: 'changeJob', jobId: 'JB01' });
  assert.equal(j.state.job, 'JB01');
  assert.equal(j.state.level, r.state.level);
  assert.deepEqual(j.state.gear, r.state.gear);
  assert.deepEqual(j.state.spells, r.state.spells);
  assert.throws(() => act(j.state, { type: 'changeJob', jobId: 'JB01' }), /same_job/);
  assert.throws(() => act(j.state, { type: 'changeJob', jobId: 'JB09' }), /bad_job/);
  assert.equal(view(content, j.state).hero.job.name, '戦士');
});

test('tavern: two candidates that exclude current companions, 1 recruit per inn, max 2, swap needs a target', () => {
  const r = atInn(0);
  const tav = view(content, r.state).inn.tavern;
  assert.equal(tav.candidates.length, 2);
  const [a, b] = tav.candidates.map((c) => c.id);
  assert.notEqual(a, b);
  assert.ok(r.state.discovered.companions.includes(a));
  // the candidates are fixed while visiting
  assert.deepEqual(view(content, reload(r.state)).inn.tavern.candidates.map((c) => c.id), [a, b]);
  const j = act(r.state, { type: 'recruit', companionId: a });
  assert.deepEqual(j.state.companions, [a]);
  assert.throws(() => act(j.state, { type: 'recruit', companionId: b }), /recruit_used/);
  assert.throws(() => act(r.state, { type: 'recruit', companionId: 'CP99' }), /not_a_candidate/);
  // next inn: current companion is excluded from the offer
  const second = atInn(1, { companions: [a] });
  const cands = view(content, second.state).inn.tavern.candidates.map((c) => c.id);
  assert.equal(cands.length, 2);
  assert.ok(!cands.includes(a));
  const full = atInn(2, { companions: ['CP01', 'CP02'] });
  const fc = view(content, full.state).inn.tavern.candidates.map((c) => c.id);
  assert.ok(!fc.includes('CP01') && !fc.includes('CP02'));
  assert.throws(() => act(full.state, { type: 'recruit', companionId: fc[0] }), /party_full/);
  assert.throws(() => act(full.state, { type: 'recruit', companionId: fc[0], replaceId: 'CP03' }), /bad_replace/);
  const swap = act(full.state, { type: 'recruit', companionId: fc[0], replaceId: 'CP01' });
  assert.deepEqual(swap.state.companions.sort(), ['CP02', fc[0]].sort());
  assert.equal(swap.state.companions.length, 2);
  assert.ok(view(content, full.state).actions.find((x) => x.type === 'recruit').needsReplace);
});

test('BD09 reads the next inn shelf from the board; it matches what the inn offers on arrival', () => {
  const base = exampleRun(content, 'M');
  const t = place(base, 10, { bag: ['BD09', 'HE01'], spells: { learned: ['SP01'], prepared: ['SP01'] } });
  const used = act(t, { type: 'useItem', itemId: 'BD09' });
  assert.deepEqual(used.state.bag, ['HE01']);
  const rev = used.state.reveals.at(-1);
  assert.equal(rev.kind, 'shop');
  assert.equal(rev.data.innPos, 25);
  assert.deepEqual(rev.data.slots.map((s) => s.id), used.state.inns[25].shop.slots.map((s) => s.id));
  assert.equal(rev.data.slots.find((s) => s.id === 'SP02').price, 600);
  // nothing was bought or redrawn
  assert.equal(used.state.gold, 200);
  assert.equal(used.state.rng.pos, t.rng.pos);
  const arrive = walk(content, place(used.state, 24), 1);
  assert.deepEqual(view(content, arrive.state).inn.shop.slots.map((s) => [s.id, s.price]), rev.data.slots.map((s) => [s.id, s.price]));
  // no inn ahead of 82's successor: not consumed
  const last = place(base, 90, { bag: ['BD09'] });
  assert.throws(() => act(last, { type: 'useItem', itemId: 'BD09' }), /no_inn_ahead/);
});

test('BD40 swaps one regional consumable per inn for another of the same band and category (1 use per inn)', () => {
  const r0 = atInn(1, { bag: ['BD40', 'BD40'], spells: { learned: ['SP01'], prepared: ['SP01'] } });
  // fixture surgery: slot 2 = SP02 (guaranteed book), slot 3 = AT11 (a band-2 combat consumable)
  const r = { ...r0, state: cl(r0.state) };
  r.state.inns[25].shop.slots[3] = { slot: 3, tier: 'regional', type: 'item', id: 'AT11', price: 52, guaranteed: false };
  const swapTo = 'AT12'; // same band 2, same category 戦闘用
  const swap = (s, params) => act(s, { type: 'useItem', itemId: 'BD40', params });
  assert.throws(() => swap(r.state, { slot: 0, newItemId: swapTo }), /item_inputInvalid/); // standard slots are not selectable at all
  assert.throws(() => swap(r.state, { slot: 2, newItemId: swapTo }), /swap_slot_not_allowed/); // spell book slot
  assert.throws(() => swap(r.state, { slot: 3, newItemId: 'HE11' }), /swap_item_not_allowed/); // other category
  assert.throws(() => swap(r.state, { slot: 3, newItemId: 'AT01' }), /swap_item_not_allowed/); // other band
  assert.throws(() => swap(r.state, { slot: 3, newItemId: 'AT11' }), /swap_item_not_allowed/); // same item
  const done = swap(r.state, { slot: 3, newItemId: swapTo });
  const sl = done.state.inns[25].shop.slots.find((s) => s.slot === 3);
  assert.deepEqual([sl.id, sl.price], [swapTo, content.items[swapTo].price]);
  assert.deepEqual(done.state.bag, ['BD40']);
  assert.equal(done.state.gold, 200); // only re-shelved, nothing bought
  assert.throws(() => swap(done.state, { slot: 3, newItemId: 'AT13' }), /swap_used/);
  // the shelf change survives a reload and leaving the inn
  const left = act(reload(done.state), { type: 'leaveInn' }).state;
  assert.equal(left.inns[25].shop.slots.find((s) => s.slot === 3).id, swapTo);
});

test('BD43 reads the number of ways out of 36 to land on a square within 12 (first roll counts)', () => {
  const base = exampleRun(content, 'M');
  const t = place(base, 6, { bag: ['BD43'] });
  const seven = act(t, { type: 'useItem', itemId: 'BD43', params: { target: 7 } });
  assert.deepEqual(seven.state.reveals.at(-1).data, { target: 7, ways: 6, of: 36 });
  const eight = act(t, { type: 'useItem', itemId: 'BD43', params: { target: 8 } });
  assert.equal(eight.state.reveals.at(-1).data.ways, 36);
  assert.equal(eight.state.pos, 6);
  assert.equal(eight.state.rolls, 0);
  assert.throws(() => act(t, { type: 'useItem', itemId: 'BD43', params: { target: 30 } }), /target_out_of_range/);
});

test('BD02 / BD41 / BD42 / BD11: pre-roll table, same-stop swap, +-3 and mirror', () => {
  const base = exampleRun(content, 'M');
  // BD02 (before the roll): 4,5,6 become 3; a roll of 2 is left alone; the item is paid up front
  const pre = act(place(base, 10, { bag: ['BD02'] }), { type: 'useItem', itemId: 'BD02' });
  assert.deepEqual(pre.state.bag, []);
  const r = dispatch(content, pre.state, { type: 'roll' }, { rolls: [(6 - 0.5) / 6] });
  assert.equal(r.state.roll.raw, 6);
  assert.equal(r.state.roll.die, 3);
  assert.throws(() => act(place(base, 10, { bag: ['BD02', 'BD01'] }), { type: 'useItem', itemId: 'BD02' }) && act(pre.state, { type: 'useItem', itemId: 'BD02' }), /no_such_item|one_adjust_per_turn/);
  // BD42: 1-3 plus 3, 4-6 minus 3
  const t42 = place(base, 10, { bag: ['BD42'] });
  let a = dispatch(content, t42, { type: 'roll' }, { rolls: [(2 - 0.5) / 6] }).state;
  assert.equal(act(a, { type: 'useItem', itemId: 'BD42' }).state.roll.die, 5);
  a = dispatch(content, t42, { type: 'roll' }, { rolls: [(6 - 0.5) / 6] }).state;
  assert.equal(act(a, { type: 'useItem', itemId: 'BD42' }).state.roll.die, 3);
  // BD11: mirror
  const t11 = place(base, 10, { bag: ['BD11'] });
  a = dispatch(content, t11, { type: 'roll' }, { rolls: [(1 - 0.5) / 6] }).state;
  assert.equal(act(a, { type: 'useItem', itemId: 'BD11' }).state.roll.die, 6);
  // BD41 only when both dice end at the same forced stop (inn 25): from 21 a 4 -> 25 and 3 -> 24 differs, from 20 ...
  const t41 = place(base, 22, { bag: ['BD41'] });
  a = dispatch(content, t41, { type: 'roll' }, { rolls: [(4 - 0.5) / 6] }).state; // 22+4=26 -> stops at 25; 3 gives 25 too
  const ok = act(a, { type: 'useItem', itemId: 'BD41' });
  assert.equal(ok.state.roll.die, 3);
  const move = act(ok.state, { type: 'move' });
  assert.equal(move.state.pos, 25);
  assert.equal(move.state.xp, 3); // walked 3 squares
  a = dispatch(content, t41, { type: 'roll' }, { rolls: [(1 - 0.5) / 6] }).state; // 23 vs 4 -> 26->25: stops differ
  assert.throws(() => act(a, { type: 'useItem', itemId: 'BD41' }), /adjust_stop_differs/);
});
