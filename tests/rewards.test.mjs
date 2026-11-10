import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRunToMeta, createMeta, dispatch, view } from '../src/engine/index.js';
import { cl, exampleRun, fxOf, getContent, place, startBattle, walk } from './fixtures/helpers.mjs';

const content = await getContent();
const base = exampleRun(content, 'M');
const A = (c, s, a, o) => dispatch(c, s, a, o);
const reload = (s) => JSON.parse(JSON.stringify(s));
const tweak = (s, fn) => {
  const t = cl(s);
  fn(t);
  return t;
};

/** Win an EN01 fight with the given reward rolls: [gearHit, itemHit, (gearKind, gearPick), (itemClass, itemPick)]. */
function winEN01(rolls, patch = {}) {
  const b = startBattle(content, base, 'EN01', { die: 2, patch });
  const s = tweak(b.state, (x) => { x.battle.enemy.hp = 1; });
  return { ...b, result: A(b.content, s, { type: 'attack' }, { rolls }), before: s };
}

test('EN01 gold 120 / xp 8 are paid exactly once; gear 12% and item 26% are rolled separately, in that order', () => {
  // gear only: 0.05 < 12%, 0.80 >= 26%
  let w = winEN01([0.05, 0.8, 0.3, 0.0]);
  let r = w.result;
  assert.equal(r.state.phase, 'battleReward');
  assert.equal(r.state.gold, 320);
  assert.equal(r.state.xp, w.before.xp + 8);
  assert.equal(r.state.reward.gear.id, 'SW02');
  assert.ok(r.state.gear.some((g) => g.id === 'SW02'));
  assert.deepEqual(r.state.bag, ['HE01', 'BD01']);
  assert.equal(r.state.reward.item.hit, false);
  assert.equal(fxOf(r.effects, 'rewards').length, 1);
  // item only (reversed): the first draw misses gear, the second hits the item
  w = winEN01([0.8, 0.05, 0.1, 0.0]);
  r = w.result;
  assert.equal(r.state.reward.gear.hit, false);
  assert.equal(r.state.reward.item.cls, '戦闘用');
  assert.equal(r.state.reward.item.id, 'AT01');
  assert.deepEqual(r.state.bag, ['HE01', 'BD01', 'AT01']);
  assert.equal(r.state.gear.length, 2);
  // both
  w = winEN01([0.05, 0.05, 0.9, 0.0, 0.1, 0.5]);
  r = w.result;
  assert.equal(r.state.reward.gear.kind, '防具');
  assert.equal(r.state.reward.gear.id, 'AR02');
  assert.equal(r.state.reward.item.cls, '戦闘用');
  assert.equal(r.state.bag.length, 3);
  assert.equal(r.state.gold, 320);
  // neither
  w = winEN01([0.8, 0.8]);
  r = w.result;
  assert.deepEqual([r.state.reward.gear.hit, r.state.reward.item.hit], [false, false]);
  assert.equal(r.state.gold, 320);
  assert.equal(r.state.gear.length, 2);
  assert.deepEqual(r.state.bag, ['HE01', 'BD01']);
  // continue returns to the board and nothing is paid twice
  const c = A(w.content, r.state, { type: 'continue' });
  assert.equal(c.state.phase, 'board');
  assert.equal(c.state.gold, 320);
  assert.equal(c.state.battle, null);
  assert.equal(c.state.reward, null);
});

test('gear drops prefer unowned pieces; when every piece of the rolled kind is owned it says so and the item roll still works', () => {
  const band1Swords = content.gearPool[1]['剣'];
  const nineOwned = band1Swords.slice(0, 9).map((id, i) => ({ iid: `x${i}`, id, paidGold: null, from: 'drop' }));
  const gear = [{ iid: 'g1', id: 'SW01', paidGold: null, from: 'start' }, { iid: 'g2', id: 'AR01', paidGold: null, from: 'start' }, ...nineOwned.filter((g) => g.id !== 'SW01')];
  const w = winEN01([0.05, 0.8, 0.3, 0.99], { gear });
  assert.equal(w.result.state.reward.gear.id, band1Swords[9]); // the only unowned sword, whatever the pick roll
  const all = band1Swords.map((id, i) => ({ iid: `y${i}`, id, paidGold: null, from: 'drop' }));
  const allOwned = winEN01([0.05, 0.05, 0.3, 0.0, 0.1, 0.0], { gear: [...all, { iid: 'g2', id: 'AR01', paidGold: null, from: 'start' }], equipped: { sword: 'y0', armor: 'g2' } });
  const rw = allOwned.result.state.reward;
  assert.equal(rw.gear.alreadyOwned, true);
  assert.equal(rw.gear.id, null);
  assert.equal(rw.item.id, 'AT01'); // the consumable slot is not lost
  assert.equal(view(allOwned.content, allOwned.result.state).reward.gear.alreadyOwned, true);
});

test('a full bag turns an item drop into swap / decline; gold, xp and gear are already settled and survive a reload', () => {
  const full = ['HE01', 'HE02', 'BD01', 'AT02', 'AT03', 'HE03'];
  const w = winEN01([0.05, 0.05, 0.3, 0.0, 0.1, 0.0], { bag: full });
  const s = w.result.state;
  assert.equal(s.phase, 'bagFull');
  assert.equal(s.gold, 320);
  assert.ok(s.gear.some((g) => g.id === 'SW02'));
  assert.equal(s.prompt.itemId, 'AT01');
  assert.equal(s.reward.itemState, 'prompt');
  const saved = reload(s);
  assert.throws(() => A(w.content, saved, { type: 'attack' }), /illegal_action/);
  assert.throws(() => A(w.content, saved, { type: 'continue' }), /illegal_action/);
  const swapped = A(w.content, saved, { type: 'bagSwap', index: 3 });
  assert.equal(swapped.state.phase, 'battleReward');
  assert.equal(swapped.state.bag.length, 6);
  assert.ok(swapped.state.bag.includes('AT01') && !swapped.state.bag.includes('AT02'));
  assert.equal(swapped.state.gold, 320);
  const declined = A(w.content, saved, { type: 'bagDecline' });
  assert.deepEqual(declined.state.bag, full);
  assert.equal(declined.state.phase, 'battleReward');
  assert.equal(declined.state.gold, 320);
  const done = A(w.content, declined.state, { type: 'continue' });
  assert.equal(done.state.phase, 'board');
});

test('xp from a win can level the hero up (carry over, several levels at once)', () => {
  const w = winEN01([0.8, 0.8], { xp: 8 }); // +2 squares walked on the way in -> 10, +8 for the win
  assert.equal(w.result.state.xp, 18);
  assert.equal(w.result.state.level, 2);
  assert.equal(fxOf(w.result.effects, 'levelUp')[0].to, 2);
});

test('demon king: victory is recorded first; with a full bag the reward waits, survives reload, pays once and finishes the run once', () => {
  const full = ['HE01', 'HE02', 'BD01', 'AT02', 'AT03', 'HE03'];
  const lv20 = { level: 20, xp: 912, hp: 78, mp: 48, bag: full };
  const gate = walk(content, place(base, 99, lv20), 1).state;
  let king = A(content, gate, { type: 'challengeKing' }).state;
  king = tweak(king, (x) => { x.battle.enemy.hp = 24; });
  // DK01: gear 75%, item 65%: gear miss, item hit, class roll 0.1 -> 戦闘用, pick 0
  const win = A(content, king, { type: 'attack' }, { rolls: [0.9, 0.1, 0.1, 0.0] });
  const s = win.state;
  assert.equal(s.phase, 'bagFull');
  assert.deepEqual(s.victory, { enemyId: 'DK01', rolls: 1, battleId: s.victory.battleId, pos: 100 });
  assert.equal(s.result, null); // the run is not finished until the reward is settled
  assert.equal(s.gold, 1200);
  assert.equal(s.xp, king.xp + 100);
  const rewardBefore = cl(s.reward);
  // closing the tab here and coming back: same prompt, nothing re-rolled, nothing paid again
  const back = reload(s);
  assert.deepEqual(back.reward, rewardBefore);
  assert.throws(() => A(content, back, { type: 'challengeKing' }), /illegal_action/);
  assert.throws(() => A(content, back, { type: 'attack' }), /illegal_action/);
  const swap = A(content, back, { type: 'bagSwap', index: 0 });
  assert.equal(swap.state.phase, 'battleReward');
  assert.equal(swap.state.gold, 1200);
  assert.deepEqual(swap.state.reward.item, { ...rewardBefore.item, id: rewardBefore.item.id, cls: rewardBefore.item.cls, hit: true });
  const fin = A(content, swap.state, { type: 'continue' });
  assert.equal(fin.state.phase, 'finished');
  assert.equal(fin.state.gold, 1200);
  assert.equal(fin.state.result.defeated, true);
  assert.equal(fin.state.result.endedBy, 'victory');
  assert.equal(fxOf(fin.effects, 'runFinished').length, 1);
  assert.throws(() => A(content, fin.state, { type: 'continue' }), /illegal_action/);
  assert.throws(() => A(content, fin.state, { type: 'roll' }), /illegal_action/);
  // meta (dex + bests) is updated once, and recording the same run twice changes nothing
  const m1 = applyRunToMeta(createMeta(), fin.state);
  assert.equal(m1.recorded, true);
  assert.equal(m1.newBest, true);
  assert.ok(m1.meta.dex.enemies.includes('DK01'));
  const m2 = applyRunToMeta(m1.meta, fin.state);
  assert.equal(m2.recorded, false);
  assert.equal(m2.newBest, false);
  assert.deepEqual(m2.meta, m1.meta);
});

test('demon king without a full bag: reward settled at once, then continue ends the run as a victory', () => {
  const gate = walk(content, place(base, 99, { level: 20, xp: 912, hp: 78, mp: 48 }), 1).state;
  let king = tweak(A(content, gate, { type: 'challengeKing' }).state, (x) => { x.battle.enemy.hp = 24; });
  const win = A(content, king, { type: 'attack' }, { rolls: [0.9, 0.9] });
  assert.equal(win.state.phase, 'battleReward');
  assert.equal(win.state.victory.enemyId, 'DK01');
  assert.equal(win.state.result, null);
  const fin = A(content, win.state, { type: 'continue' });
  assert.equal(fin.state.result.defeated, true);
  assert.equal(fin.state.result.furthest, 100);
});

test('one retry per run: the battle-start snapshot comes back (items and mp used in battle restored, hp/mp = max(start, ceil(max/2)))', () => {
  const b = startBattle(content, base, 'EN09', { die: 3, patch: { hp: 6, mp: 4, bag: ['HE02', 'AT01'], gear: [...base.gear, { iid: 'g3', id: 'AR03', paidGold: null, from: 'drop' }] } });
  const c = b.content;
  let s = tweak(b.state, (x) => { x.battle.enemy.hp = 40; x.battle.enemy.maxHp = 40; });
  s = A(c, s, { type: 'item', itemId: 'HE02' }).state; // mp 9; the 5-damage hit is softened to 1 -> hp 5
  assert.equal(s.mp, 9);
  assert.equal(s.hp, 5);
  s = A(c, s, { type: 'item', itemId: 'AT01' }).state;
  s = A(c, s, { type: 'guard' }).state;
  assert.deepEqual(s.bag, []);
  const lost = A(c, s, { type: 'attack' }); // round 4: 草束 hits 5, hp 5 -> 0
  assert.equal(lost.state.phase, 'retryOffer');
  assert.equal(lost.state.retry.stage, 'offer');
  assert.deepEqual(fxOf(lost.effects, 'rewards'), []);
  assert.equal(lost.state.retry.used, false);
  // no equipment changes while the offer is shown, none of the battle actions either
  assert.throws(() => A(c, lost.state, { type: 'equip', iid: 'g1' }), /illegal_action/);
  assert.throws(() => A(c, lost.state, { type: 'attack' }), /illegal_action/);
  const saved = reload(lost.state);
  const acc = A(c, saved, { type: 'retry' });
  const r = acc.state;
  assert.equal(r.retry.used, true);
  assert.equal(r.retry.stage, 'prep');
  assert.deepEqual(r.bag, ['HE02', 'AT01']);
  assert.equal(r.mp, 5); // max(start 4, ceil(10/2))
  assert.equal(r.hp, 20); // max(start 6, ceil(40/2))
  assert.equal(r.battle.enemy.hp, 13);
  assert.equal(r.battle.round, 1);
  assert.equal(r.battle.rounds.length, 1);
  assert.equal(r.battle.stage, 'prep');
  // prep: gear and spells can be re-chosen; the fight starts only with resumeBattle (still the same enemy and die bonus)
  const prep = A(c, r, { type: 'equip', iid: 'g3' });
  assert.equal(prep.state.equipped.armor, 'g3');
  assert.throws(() => A(c, r, { type: 'equip', iid: 'g2' }), /already_equipped/);
  const resumed = A(c, reload(r), { type: 'resumeBattle' });
  assert.equal(resumed.state.phase, 'battle');
  assert.equal(resumed.state.battle.stage, 'fight');
  assert.equal(resumed.state.battle.enemyId, 'EN09');
  assert.equal(resumed.state.battle.dieBonus.die, 3);
  // second defeat ends the run
  let t = tweak(resumed.state, (x) => { x.hp = 1; });
  t = A(c, t, { type: 'attack' }).state;
  assert.equal(t.phase, 'finished');
  assert.equal(t.result.endedBy, 'lost');
  assert.equal(t.result.defeated, false);
  assert.equal(t.result.furthest, 10);
  assert.throws(() => A(c, t, { type: 'retry' }), /illegal_action/);
});

test('declining the retry ends the run; a restored fight can be won and the game goes on', () => {
  const b = startBattle(content, base, 'EN09', { die: 5, patch: { hp: 1 } });
  const lost = A(b.content, b.state, { type: 'attack' });
  assert.equal(lost.state.phase, 'retryOffer');
  const dec = A(b.content, lost.state, { type: 'declineRetry' });
  assert.equal(dec.state.phase, 'finished');
  assert.equal(dec.state.result.endedBy, 'declined');
  // accept and win
  const acc = A(b.content, lost.state, { type: 'retry' }).state;
  assert.equal(acc.hp, 20);
  const fight = A(b.content, acc, { type: 'resumeBattle' }).state;
  const won = A(b.content, tweak(fight, (x) => { x.battle.enemy.hp = 1; }), { type: 'attack' }, { rolls: [0.9, 0.9] });
  assert.equal(won.state.phase, 'battleReward');
  assert.equal(A(b.content, won.state, { type: 'continue' }).state.phase, 'board');
});

test('a pre-battle use at the gate stays consumed after a retry; only items spent during the fight come back', () => {
  const gate = walk(content, place(base, 99, { hp: 2, bag: ['HE01', 'HE01'] }), 1).state;
  const used = A(content, gate, { type: 'useItem', itemId: 'HE01' }).state;
  assert.equal(used.hp, 14);
  assert.deepEqual(used.bag, ['HE01']);
  const king = A(content, used, { type: 'challengeKing' }).state;
  const lost = A(content, king, { type: 'attack' }); // 王の剣 42-5 = 37, softened 6 -> 31
  assert.equal(lost.state.phase, 'retryOffer');
  const r = A(content, lost.state, { type: 'retry' }).state;
  assert.deepEqual(r.bag, ['HE01']);
  assert.equal(r.hp, 20); // max(start 14, ceil(40/2))
  assert.equal(r.battle.kind, 'king');
});
