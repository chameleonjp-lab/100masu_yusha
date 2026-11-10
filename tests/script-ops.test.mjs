// Format primitives that the real sample data does not exercise yet, tested with fixture scripts
// (this is what data-conversion relies on when it converts the other 980 events / 133 items / 94 gear).

import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, view } from '../src/engine/index.js';
import { validateScripts } from '../src/content/validate.js';
import { cl, exampleRun, fxOf, getContent, landOnEvent, place, startBattle, walk, withScripts } from './fixtures/helpers.mjs';

const content = await getContent();
const base = exampleRun(content, 'M');
const A = (c, s, a, o) => dispatch(c, s, a, o);
const problemsOf = (c) => {
  const p = [];
  validateScripts(c, p);
  return p;
};

test('inn service with a nested choice and a full bag: bagFull swap returns to the inn, the service stays used', () => {
  const svc = { id: 'tea', label: '茶', effects: [{ op: 'choice', options: [{ id: 'hp', label: '体力', effects: [{ op: 'hp', delta: 4 }] }, { id: 'item', label: '品', effects: [{ op: 'giveItem', id: 'BD38' }] }] }] };
  const c = withScripts(content, { events: { 'H1-37': { inn: { services: [svc] } } } });
  assert.deepEqual(problemsOf(c).filter((p) => p.level === 'error'), []);
  let t = place(exampleRun(content, 'H'), 4, { bag: ['HE01', 'HE02', 'BD01', 'AT02', 'AT03', 'HE03'], hp: 10 });
  t.board.squares[4] = { position: 5, contentId: 'H1-37' };
  const at = walk(c, t, 1).state;
  assert.equal(at.phase, 'inn');
  const s1 = A(c, at, { type: 'service', serviceId: 'tea' }).state;
  assert.equal(s1.phase, 'inn');
  assert.equal(s1.prompt.kind, 'choice');
  assert.throws(() => A(c, s1, { type: 'leaveInn' }), /illegal_action/);
  assert.deepEqual(view(c, s1).actions.filter((a) => a.type === 'chooseOption').map((a) => a.optionId), ['hp', 'item']);
  const s2 = A(c, s1, { type: 'chooseOption', optionId: 'item' }).state;
  assert.equal(s2.phase, 'bagFull');
  const s3 = A(c, JSON.parse(JSON.stringify(s2)), { type: 'bagSwap', index: 0 }).state;
  assert.equal(s3.phase, 'inn');
  assert.ok(s3.bag.includes('BD38') && !s3.bag.includes('HE01'));
  assert.throws(() => A(c, s3, { type: 'service', serviceId: 'tea' }), /service_used/);
  assert.equal(A(c, s3, { type: 'leaveInn' }).state.phase, 'board');
});

test('chest: an item pick with a full bag can be declined (back to the chest) or swapped (taken recorded)', () => {
  const full = ['HE01', 'HE02', 'BD01', 'AT02', 'AT03', 'HE03'];
  const land = landOnEvent(content, base, 'M1-18', { pos: 5, die: 3, patch: { bag: full } });
  const afterEvent = A(content, land.state, { type: 'chooseOption', optionId: 'tie' }).state;
  assert.equal(afterEvent.phase, 'chest');
  const itemIdx = view(content, afterEvent).chest.candidates.findIndex((c) => c.type === 'item');
  assert.ok(itemIdx >= 0);
  const full1 = A(content, afterEvent, { type: 'pickChest', index: itemIdx }).state;
  assert.equal(full1.phase, 'bagFull');
  const declined = A(content, full1, { type: 'bagDecline' }).state;
  assert.equal(declined.phase, 'chest');
  assert.equal(declined.chests['5'].taken, null);
  const again = A(content, declined, { type: 'pickChest', index: itemIdx }).state;
  const swapped = A(content, again, { type: 'bagSwap', index: 2 }).state;
  assert.equal(swapped.phase, 'board');
  assert.equal(swapped.chests['5'].taken, view(content, afterEvent).chest.candidates[itemIdx].id);
  assert.equal(swapped.bag.length, 6);
  // skipping the whole chest is allowed too
  const skipped = A(content, afterEvent, { type: 'skipChest' }).state;
  assert.equal(skipped.phase, 'board');
  assert.throws(() => A(content, skipped, { type: 'pickChest', index: 0 }), /illegal_action/);
});

test('battle.onWin runs after the reward is settled; extraActions are the only way to use field-specific moves', () => {
  const ev = {
    onLand: [{ op: 'battle', enemy: 'EN09',
      extraActions: [{ id: 'sweep', label: '払う', when: { eq: [{ ref: 'battle.round' }, 1] },
        effects: [{ op: 'addMark', mark: { id: 'sweep', hook: 'enemyDamage', stage: 'gear', uses: 1, effects: [{ op: 'reduceDamage', amount: 4 }] } }] }],
      onWin: [{ op: 'giveItem', id: 'HE05' }] }],
  };
  const c = withScripts(content, { events: { 'M1-22': ev } });
  assert.deepEqual(problemsOf(c).filter((p) => p.level === 'error'), []);
  const r = landOnEvent(c, base, 'M1-22', { pos: 10, die: 5 });
  const v = view(c, r.state);
  assert.deepEqual(v.actions.filter((a) => a.type === 'extra').map((a) => a.id), ['sweep']);
  const s = A(c, r.state, { type: 'extra', id: 'sweep' }).state; // enemy hit 5 - 4 = 1
  assert.equal(s.hp, 39);
  assert.equal(s.battle.round, 2);
  assert.throws(() => A(c, s, { type: 'extra', id: 'sweep' }), /extra_not_now/);
  const near = JSON.parse(JSON.stringify(s));
  near.battle.enemy.hp = 1;
  const won = A(c, near, { type: 'attack' }, { rolls: [0.9, 0.9] }).state;
  assert.equal(won.phase, 'battleReward');
  assert.ok(!won.bag.includes('HE05'));
  const done = A(c, won, { type: 'continue' }).state;
  assert.equal(done.phase, 'board');
  assert.ok(done.bag.includes('HE05'));
});

test('reservations: nextBattle with withinMoves, thisMove with move.* refs, and the one-per-key rule', () => {
  const items = {
    BD10: { uses: [{ where: ['board'], effects: [{ op: 'reserve', slot: 'nextBattle', filter: 'normal', withinMoves: 1, unique: 'BD10', label: 'BD10',
      rules: [{ id: 'mark', hook: 'heroAttackDamage', when: { eq: [{ ref: 'battle.attackKind' }, 'attack'] }, uses: 1, effects: [{ op: 'addDamage', amount: 6 }] }] }] }] },
    BD07: { uses: [{ where: ['board'], effects: [{ op: 'reserve', slot: 'thisMove', rules: [{ when: { lte: [{ ref: 'move.steps' }, 2] }, effects: [{ op: 'hp', delta: 7 }] }] }] }] },
  };
  const c = withScripts(content, { items, events: { 'M1-22': { onLand: [{ op: 'battle', enemy: 'EN09' }] } } });
  assert.deepEqual(problemsOf(c).filter((p) => p.level === 'error'), []);
  // BD10: used one move before the battle square -> the first attack gets +6
  let t = place(base, 8, { bag: ['BD10', 'BD10'] });
  t.board.squares[9] = { position: 10, contentId: 'M1-22' };
  let s = A(c, t, { type: 'useItem', itemId: 'BD10' }).state;
  assert.throws(() => A(c, s, { type: 'useItem', itemId: 'BD10' }), /already_reserved/);
  s = walk(c, s, 2).state;
  assert.equal(s.phase, 'battle');
  assert.equal(s.battle.marks.length, 1);
  assert.equal(s.reservations.length, 0);
  const hit = A(c, tweakHp(s), { type: 'attack' });
  assert.equal(hit.state.battle.enemy.hp, 100 - (5 + 6)); // 7-2 plus the booked +6; die 2 only softens
  // the battle is two moves away: the booking (within 1 move) has lapsed
  t = place(base, 12, { bag: ['BD10'] });
  t.board.squares[15] = { position: 16, contentId: 'M1-22' };
  s = A(c, t, { type: 'useItem', itemId: 'BD10' }).state;
  s = A(c, walk(c, s, 1).state, { type: 'skipUnscripted' }).state; // square 13 (unscripted)
  assert.equal(s.reservations.length, 1);
  const lapsed = walk(c, s, 3);
  assert.equal(lapsed.state.phase, 'battle');
  assert.equal(lapsed.state.battle.marks.length, 0);
  assert.ok(fxOf(lapsed.effects, 'reservationExpired').length === 1);
  // BD07-like: only moves of 1-2 steps heal
  const h = place(base, 10, { bag: ['BD07', 'BD07'], hp: 20 });
  const used = A(c, h, { type: 'useItem', itemId: 'BD07' }).state;
  assert.equal(used.reservations.length, 1);
  assert.equal(walk(c, used, 5).state.hp, 20);
  assert.equal(walk(c, used, 2).state.hp, 27);
  const next = walk(c, used, 2).state;
  assert.equal(next.reservations.length, 0); // one move only
});
function tweakHp(s) {
  const t = cl(s);
  t.battle.enemy.hp = 100;
  t.battle.enemy.maxHp = 100;
  return t;
}

test('validator rules: unwired items/hooks warn, battle must be last, award mismatch is an error, custom must exist', () => {
  const bad = withScripts(content, {
    events: {
      'M1-02': { onLand: [{ op: 'battle', enemy: 'EN09' }, { op: 'hp', delta: 1 }] },
      'M1-03': { onLand: [{ op: 'custom', id: 'no.such.handler' }] },
      'M1-04': { onLand: [{ op: 'awardGold', amount: 100 }] },
    },
    items: { HE03: { uses: [{ where: ['restConfirm'], effects: [{ op: 'hp', delta: 1 }] }] } },
    equipment: { SW02: { rules: [{ hook: 'restConfirm', effects: [] }, { hook: 'bogus', effects: [] }] } },
  });
  const p = problemsOf(bad);
  const has = (level, code, text) => p.some((x) => x.level === level && x.code === code && (!text || x.message.includes(text)));
  assert.ok(has('error', 'script-battle', 'last'));
  assert.ok(has('error', 'script-custom'));
  assert.ok(has('error', 'script-award'));
  assert.ok(has('warn', 'script-where-unwired'));
  assert.ok(has('warn', 'script-hook-unwired'));
  assert.ok(has('error', 'script-hook'));
  // the custom registry works when the handler exists
  const ok = withScripts(content, { events: { 'M1-02': { onLand: [{ op: 'custom', id: 'example.noop', args: { a: 1 } }] } } });
  assert.deepEqual(problemsOf(ok).filter((x) => x.level === 'error'), []);
  const r = landOnEvent(ok, base, 'M1-02', { pos: 10, die: 3 });
  assert.equal(fxOf(r.effects, 'custom')[0].id, 'example.noop');
  void startBattle;
});
