// More format primitives, driven by the real item/gear texts (AT05, AT08, HE28, HE47, HE48, AT09, BD08, AR06 ...).

import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, view } from '../src/engine/index.js';
import { validateScripts } from '../src/content/validate.js';
import { cl, exampleRun, fxOf, getContent, place, startBattle, walk, withScripts } from './fixtures/helpers.mjs';

const content = await getContent();
const base = exampleRun(content, 'M');
const A = (c, s, a, o) => dispatch(c, s, a, o);
const noErrors = (c) => {
  const p = [];
  validateScripts(c, p);
  assert.deepEqual(p.filter((x) => x.level === 'error'), []);
};
const tweak = (s, fn) => {
  const t = cl(s);
  fn(t);
  return t;
};

test('AT05-like: damage now, and a guard next turn takes 4 more off the first hit; choosing anything else cancels the guard bonus', () => {
  const items = { AT05: { uses: [{ where: ['battle'], unique: 'AT05', effects: [
    { op: 'dealDamage', amount: 4 },
    { op: 'addMark', mark: { id: 'AT05', hook: 'enemyDamage', unique: 'AT05', expires: { heroTurns: 1 }, uses: 1,
      when: { and: [{ eq: [{ ref: 'battle.heroAction' }, 'guard'] }, { gt: [{ ref: 'battle.damage' }, 0] }] },
      cancelWhen: { ne: [{ ref: 'battle.heroAction' }, 'guard'] },
      effects: [{ op: 'reduceDamage', amount: 4 }] } }] }] } };
  const c = withScripts(content, { items });
  noErrors(c);
  const b = startBattle(c, base, 'EN03', { die: 5, patch: { bag: ['AT05'] } });
  const hpBig = tweak(b.state, (x) => { x.battle.enemy.hp = 100; x.battle.enemy.maxHp = 100; });
  const r1 = A(c, hpBig, { type: 'item', itemId: 'AT05' }); // round 1: EN03 通常 hit 10
  assert.equal(r1.state.battle.enemy.hp, 96);
  assert.equal(r1.state.hp, 30);
  assert.equal(r1.state.battle.marks.length, 1);
  const g = A(c, r1.state, { type: 'guard' }); // round 2: 大技 22-5 = 17 -> guard 9 -> -4 = 5
  assert.equal(r1.state.hp - g.state.hp, 5);
  assert.equal(g.state.battle.marks.length, 0);
  const other = A(c, r1.state, { type: 'attack' }); // not a guard: the bonus is cancelled, the full 17 lands
  assert.equal(other.state.battle.marks.length, 0);
  assert.equal(r1.state.hp - other.state.hp, 17);
});

test('HE28-like: nothing now, the heal arrives at the start of the second hero turn after use (marks that create marks)', () => {
  const items = { HE28: { uses: [{ where: ['battle'], effects: [
    { op: 'addMark', mark: { id: 'a', hook: 'heroTurnStart', uses: 1, effects: [
      { op: 'addMark', mark: { id: 'b', hook: 'heroTurnStart', uses: 1, effects: [{ op: 'hp', delta: 24 }] } }] } }] }] } };
  const c = withScripts(content, { items });
  const b = startBattle(c, base, 'EN03', { die: 5, patch: { bag: ['HE28'], hp: 25 } });
  const r1 = A(c, tweak(b.state, (x) => { x.battle.enemy.hp = 100; x.battle.enemy.maxHp = 100; }), { type: 'item', itemId: 'HE28' });
  const hp1 = r1.state.hp; // round 1 hit taken
  const r2 = A(c, r1.state, { type: 'guard' }); // round 2 start: mark a fires and sets b; no heal yet
  assert.ok(r2.state.hp <= hp1);
  const r3 = A(c, r2.state, { type: 'guard' }); // round 3 start: +24
  assert.ok(fxOf(r3.effects, 'hp').some((e) => e.delta === 24));
});

test('AT08-like: reflects the hp actually lost in the first hit, at most 12, not when the hero falls', () => {
  const items = { AT08: { uses: [{ where: ['battle'], effects: [
    { op: 'addMark', mark: { id: 'AT08', hook: 'afterEnemyAction', uses: 1, expires: { enemyActions: 1 },
      when: { and: [{ gt: [{ ref: 'battle.hpLost' }, 0] }, { gt: [{ ref: 'hp' }, 0] }] },
      effects: [{ op: 'dealDamage', amount: { min: [12, { ref: 'battle.hpLost' }] } }] } }] }] } };
  const c = withScripts(content, { items });
  const b = startBattle(c, base, 'EN09', { die: 5, patch: { bag: ['AT08'] } });
  const s = tweak(b.state, (x) => { x.battle.enemy.hp = 100; x.battle.enemy.maxHp = 100; });
  const r = A(c, s, { type: 'item', itemId: 'AT08' });
  assert.equal(r.state.battle.enemy.hp, 95); // hero lost 5
  const dying = A(c, tweak(s, (x) => { x.hp = 3; }), { type: 'item', itemId: 'AT08' });
  assert.equal(dying.state.phase, 'retryOffer');
  assert.equal(dying.state.battle.enemy.hp, 100); // no reflect from a fallen hero
});

test('HE47-like: an item chosen from the bag is consumed through an expression id; itemCategory gates it', () => {
  const items = { HE47: { uses: [{ where: ['inn'],
    inputs: [{ id: 'partner', type: 'string' }],
    requires: [{ when: { eq: [{ ref: 'itemCategory', id: { ref: 'var.partner' } }, '回復用'] }, reason: 'notNow' }, { when: { gt: [{ ref: 'itemCount', id: 'HE02' }, 0] }, reason: 'missingItem' }],
    effects: [{ op: 'loseItem', id: { ref: 'var.partner' } }, { op: 'hp', delta: 28 }, { op: 'mp', delta: 12 }] }] } };
  const c = withScripts(content, { items });
  noErrors(c);
  const t = place(base, base.board.innPositions[1] - 1, { bag: ['HE47', 'HE02', 'AT01'], hp: 5, mp: 0 });
  const inn = walk(c, t, 1).state;
  assert.throws(() => A(c, inn, { type: 'useItem', itemId: 'HE47', params: { partner: 'AT01' } }), /item_notNow/);
  const done = A(c, inn, { type: 'useItem', itemId: 'HE47', params: { partner: 'HE02' } }).state;
  assert.deepEqual(done.bag, ['AT01']);
  assert.deepEqual([done.hp, done.mp], [33, 10]);
});

test('HE48-like: sinceInn is the distance from the last visited inn', () => {
  const items = { HE48: { uses: [{ where: ['inn', 'gate'], effects: [{ op: 'hp', delta: { mul: [{ floorDiv: [{ ref: 'sinceInn' }, 2] }, 2] } }] }] } };
  const c = withScripts(content, { items });
  const gate = walk(c, place(base, 99, { bag: ['HE48'], hp: 1 }), 1).state; // inn 82 -> 100: 18 squares
  assert.equal(A(c, gate, { type: 'useItem', itemId: 'HE48' }).state.hp, 1 + 18);
});

test('information reveals: next enemy action (AT09), squares 7-12 ahead (BD08), six outcomes (BD30)', () => {
  const items = {
    AT09: { uses: [{ where: ['battle'], effects: [{ op: 'reveal', info: 'nextEnemyAction' }] }] },
    BD08: { uses: [{ where: ['board'], effects: [{ op: 'reveal', info: 'squaresAhead', from: 7, to: 12 }] }] },
    BD30: { uses: [{ where: ['board'], effects: [{ op: 'reveal', info: 'sixOutcomes' }] }] },
  };
  const c = withScripts(content, { items });
  const b = startBattle(c, base, 'EN03', { die: 5, patch: { bag: ['AT09'] } });
  const r = A(c, b.state, { type: 'item', itemId: 'AT09' });
  const rev = r.state.reveals.at(-1);
  assert.equal(rev.kind, 'nextEnemyAction');
  assert.equal(rev.data.kind, '大技'); // after 通常攻撃 comes the big move
  const t = place(base, 10, { bag: ['BD08', 'BD30'] });
  const sq = A(c, t, { type: 'useItem', itemId: 'BD08' }).state.reveals.at(-1).data.squares;
  assert.deepEqual(sq.map((x) => x.pos), [17, 18, 19, 20, 21, 22]);
  const six = A(c, t, { type: 'useItem', itemId: 'BD30' }).state.reveals.at(-1).data.outcomes;
  assert.deepEqual(six.map((x) => x.to), [11, 12, 13, 14, 15, 16]);
});

test('AR06-like reflect never takes the enemy below 1; AR47-like triggers right after the third distinct action', () => {
  const gear = {
    AR06: { rules: [{ id: 'spiky', hook: 'afterEnemyAction', limit: { perBattle: 3 },
      when: { and: [{ eq: [{ ref: 'battle.heroAction' }, 'guard'] }, { gt: [{ ref: 'battle.hpLost' }, 0] }] },
      effects: [{ op: 'dealDamage', amount: 2, leave: 1 }] }] },
    AR47: { rules: [{ id: 'riddle', hook: 'afterHeroAction', limit: { perBattle: 1 },
      when: { and: [{ eq: [{ ref: 'battle.round' }, 3] }, { actions: { abs: [1, 2, 3], distinct: true } }] },
      effects: [{ op: 'hp', delta: 6 }] }] },
  };
  const c = withScripts(content, { equipment: gear });
  noErrors(c);
  const spiky = startBattle(c, base, 'EN09', { die: 5, patch: { gear: [...base.gear, { iid: 'g3', id: 'AR06', paidGold: null, from: 'drop' }], equipped: { sword: 'g1', armor: 'g3' } } });
  const low = tweak(spiky.state, (x) => { x.battle.enemy.hp = 2; });
  const r = A(c, low, { type: 'guard' });
  assert.equal(r.state.battle.enemy.hp, 1);
  assert.equal(r.state.phase, 'battle');

  const riddle = startBattle(c, base, 'EN03', { die: 5, patch: { hp: 20, bag: ['HE01'], gear: [...base.gear, { iid: 'g3', id: 'AR47', paidGold: null, from: 'drop' }], equipped: { sword: 'g1', armor: 'g3' } } });
  let s = tweak(riddle.state, (x) => { x.battle.enemy.hp = 100; x.battle.enemy.maxHp = 100; });
  s = A(c, s, { type: 'attack' }).state; // round 1
  s = A(c, s, { type: 'guard' }).state; // round 2
  const before = s.hp;
  const r3 = A(c, s, { type: 'item', itemId: 'HE01' }); // round 3: third kind -> +6 right after the action
  assert.ok(fxOf(r3.effects, 'rule').some((e) => e.owner === 'gear:AR47'));
  assert.ok(r3.state.hp >= before + 12 + 6 - 17 - 1);
  void view;
});
