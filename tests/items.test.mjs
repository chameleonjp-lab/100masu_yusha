import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, itemStatus, view } from '../src/engine/index.js';
import { cl, exampleRun, getContent, place, rollDie, startBattle, walk } from './fixtures/helpers.mjs';

const content = await getContent();
const base = exampleRun(content, 'M');
const A = (c, s, a, o) => dispatch(c, s, a, o);
const atInn = (patch) => walk(content, place(base, base.board.innPositions[1] - 1, patch), 1).state;

test('HE01 heals 12 up to the maximum, usable in battle (as the hero action), at an inn and at the gate, not on the board', () => {
  const inn = atInn({ hp: 20, bag: ['HE01', 'HE01'] });
  const used = A(content, inn, { type: 'useItem', itemId: 'HE01' });
  assert.equal(used.state.hp, 32);
  assert.deepEqual(used.state.bag, ['HE01']);
  assert.equal(A(content, atInn({ hp: 35, bag: ['HE01'] }), { type: 'useItem', itemId: 'HE01' }).state.hp, 40);
  assert.throws(() => A(content, place(base, 10, { hp: 20 }), { type: 'useItem', itemId: 'HE01' }), /item_notNow/);
  const b = startBattle(content, base, 'EN09', { die: 5, patch: { hp: 20 } });
  const r = A(b.content, b.state, { type: 'item', itemId: 'HE01' });
  assert.equal(r.state.hp, 32 - 5);
  assert.equal(r.state.battle.round, 2); // the enemy acted: using an item is the hero's action
  const gate = walk(content, place(base, 99, { hp: 20 }), 1).state;
  assert.equal(A(content, gate, { type: 'useItem', itemId: 'HE01' }).state.hp, 32);
});

test('HE02 is refused (and not consumed) at full mana; HE11 restores whichever side is lower, asks on a tie, refuses when both are full', () => {
  const full = atInn({ bag: ['HE02'] });
  const st = itemStatus(content, full, 'HE02', {});
  assert.equal(st.enabled, false);
  assert.equal(st.reason, 'mpFull');
  assert.throws(() => A(content, full, { type: 'useItem', itemId: 'HE02' }), /item_mpFull/);
  assert.equal(A(content, atInn({ mp: 2, bag: ['HE02'] }), { type: 'useItem', itemId: 'HE02' }).state.mp, 7);

  const he11 = (patch, params) => A(content, atInn({ bag: ['HE11'], ...patch }), { type: 'useItem', itemId: 'HE11', params });
  const lowHp = he11({ hp: 10 });
  assert.equal(lowHp.state.hp, 10 + Math.min(18, Math.ceil(40 / 3)));
  assert.equal(lowHp.state.mp, 10);
  const lowMp = he11({ mp: 2 });
  assert.equal(lowMp.state.mp, 2 + Math.min(8, Math.ceil(10 / 3)));
  const tieHp = he11({ hp: 20, mp: 5 }, { which: 'hp' });
  assert.equal(tieHp.state.hp, 20 + 14);
  assert.equal(tieHp.state.mp, 5);
  const tieMp = he11({ hp: 20, mp: 5 }, { which: 'mp' });
  assert.equal(tieMp.state.mp, 9);
  assert.throws(() => he11({}), /item_nothingToRestore/);
  assert.equal(itemStatus(content, atInn({ bag: ['HE11'], hp: 20, mp: 5 }), 'HE11', {}).enabled, false); // a tie without a choice is not valid input yet
});

test('BD49 at the gate: the right order halves nothing but takes 10 off the first hit of the demon king, once per gate', () => {
  const gate = walk(content, place(base, 99, { bag: ['BD49', 'BD49'] }), 4).state; // die 4: boost, no soften
  assert.equal(gate.phase, 'gate');
  assert.throws(() => A(content, gate, { type: 'useItem', itemId: 'BD49', params: { order: ['sword', 'shield', 'staff'] } }).state && A(content, gate, { type: 'useItem', itemId: 'BD49' }), /item_inputInvalid/);
  const right = A(content, gate, { type: 'useItem', itemId: 'BD49', params: { order: ['sword', 'staff', 'shield'] } }).state;
  assert.equal(right.reservations.length, 1);
  assert.deepEqual(right.bag, ['BD49']);
  assert.throws(() => A(content, right, { type: 'useItem', itemId: 'BD49', params: { order: ['sword', 'staff', 'shield'] } }), /item_used/);
  const king = A(content, right, { type: 'challengeKing' }).state;
  assert.equal(king.battle.marks.length, 1);
  assert.equal(king.reservations.length, 0);
  const hit = A(content, king, { type: 'attack' });
  assert.equal(hit.state.hp, 40 - (42 - 5 - 10));
  assert.equal(hit.state.battle.marks.length, 0);
  // a wrong answer: the item is spent, there is no guard, and the gate counts as used
  const wrong = A(content, gate, { type: 'useItem', itemId: 'BD49', params: { order: ['shield', 'staff', 'sword'] } }).state;
  assert.equal(wrong.reservations.length, 0);
  assert.deepEqual(wrong.bag, ['BD49']);
  assert.throws(() => A(content, wrong, { type: 'useItem', itemId: 'BD49', params: { order: ['sword', 'staff', 'shield'] } }), /item_used/);
  // a reservation made for the king does not leak into a normal battle
  const b = startBattle(content, base, 'EN09', { die: 4 });
  assert.equal(b.state.battle.marks.length, 0);
});

test('BD50: a correct sum books heal 18 / mana 6 for arriving on the next stop within 6 moves; a wrong sum only spends the item', () => {
  const t = place(base, 41, { bag: ['BD50', 'BD50'], hp: 20, mp: 2 }); // next stop: inn 47, distance 6
  const wrong = A(content, t, { type: 'useItem', itemId: 'BD50', params: { nums: [1, 2] } }).state;
  assert.equal(wrong.reservations.length, 0);
  assert.deepEqual(wrong.bag, ['BD50']);
  assert.throws(() => A(content, t, { type: 'useItem', itemId: 'BD50', params: { nums: [3, 3] } }), /item_inputInvalid/); // distinct numbers only
  const ok = A(content, t, { type: 'useItem', itemId: 'BD50', params: { nums: [2, 4] } }).state;
  assert.equal(ok.reservations.length, 1);
  assert.equal(ok.reservations[0].pos, 47);
  const arrive = walk(content, ok, 6);
  assert.equal(arrive.state.pos, 47);
  assert.equal(arrive.state.hp, 38);
  assert.equal(arrive.state.mp, 8);
  assert.equal(arrive.state.reservations.length, 0);
  // the answer does not change the roll, the target or the roll count
  assert.equal(arrive.state.rolls, 1);
  // too close (distance < 3): not usable
  assert.throws(() => A(content, place(base, 45, { bag: ['BD50'] }), { type: 'useItem', itemId: 'BD50', params: { nums: [1, 1] } }), /item_(notNow|inputInvalid)/);
  // not reaching it in time: the booking lapses after 6 moves (distance 15 needs more than 6 rolls of 1)
  let s = A(content, place(base, 32, { bag: ['BD50'], hp: 20 }), { type: 'useItem', itemId: 'BD50', params: { nums: [6, 5, 4] } }).state;
  assert.equal(s.reservations.length, 1);
  const settle = (st) => {
    let x = st;
    for (let k = 0; k < 4 && x.phase !== 'board'; k++) x = A(content, x, x.phase === 'chest' ? { type: 'skipChest' } : { type: 'skipUnscripted' }).state;
    return x;
  };
  for (let i = 0; i < 6; i++) {
    s = settle(walk(content, s, 1).state);
    assert.equal(s.reservations.length, 1, `still booked after move ${i + 1}`);
  }
  const lapsed = walk(content, s, 1);
  assert.ok(lapsed.state.pos > 38);
  assert.equal(lapsed.state.reservations.length, 0);
  assert.ok(lapsed.effects.some((e) => e.t === 'reservationExpired'));
  assert.equal(lapsed.state.hp, 20);
});

test('item use outside its place is refused without consuming it (BD01 on the board, AT02 at an inn)', () => {
  const t = place(base, 10, { bag: ['BD01'] });
  assert.throws(() => A(content, t, { type: 'useItem', itemId: 'BD01', params: { delta: 1 } }), /item_notNow/);
  assert.deepEqual(t.bag, ['BD01']);
  const inn = atInn({ bag: ['AT02'] });
  assert.throws(() => A(content, inn, { type: 'useItem', itemId: 'AT02' }), /item_notNow/);
  // the action list says why
  const a = view(content, inn).actions.find((x) => x.type === 'useItem' && x.itemId === 'AT02');
  assert.equal(a.enabled, false);
  assert.equal(a.reason, 'notNow');
});

test('AT items work from the bag only in battle; a held-back die-adjust item cannot be used twice in a turn', () => {
  const t = place(base, 10, { bag: ['BD01', 'BD11'] });
  const rolled = rollDie(content, t, 3).state;
  const once = A(content, rolled, { type: 'useItem', itemId: 'BD11' }).state;
  assert.equal(once.roll.die, 4);
  assert.throws(() => A(content, once, { type: 'useItem', itemId: 'BD01', params: { delta: 1 } }), /one_adjust_per_turn/);
  const moved = A(content, once, { type: 'move' }).state;
  assert.equal(moved.pos, 14);
  assert.deepEqual(moved.bag, ['BD01']);
  void cl;
});
