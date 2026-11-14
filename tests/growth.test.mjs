import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, view } from '../src/engine/index.js';
import { exampleRun, fxOf, getContent, place, walk } from './fixtures/helpers.mjs';

const content = await getContent();
const base = exampleRun(content, 'M');

test('level table: boundaries 11/12 and 27/28; xp carries over; hp and mp stay where they are', () => {
  let r = walk(content, place(base, 10, { xp: 10 }), 1); // +1 -> 11
  assert.equal(r.state.level, 1);
  r = walk(content, place(base, 10, { xp: 11 }), 1); // 12
  assert.equal(r.state.level, 2);
  assert.equal(r.state.xp, 12);
  r = walk(content, place(base, 10, { xp: 26, level: 2 }), 1); // 27
  assert.equal(r.state.level, 2);
  r = walk(content, place(base, 10, { xp: 27, level: 2, hp: 30, mp: 3 }), 1); // 28 -> level 3
  assert.equal(r.state.level, 3);
  assert.equal(r.state.hp, 30); // current values unchanged by the level-up
  assert.equal(r.state.mp, 3);
  const up = fxOf(r.effects, 'levelUp')[0];
  assert.deepEqual(up.stats, { maxHp: 44, maxMp: 14, attack: 10, defense: 8 });
});

test('28 xp from level 1 jumps two levels at once: level 3, max hp 44, current hp untouched', () => {
  const t = place(base, 10, { xp: 22, hp: 25 });
  const r = walk(content, t, 6); // +6 walked squares -> xp 28
  assert.equal(r.state.xp, 28);
  assert.equal(r.state.level, 3);
  const v = view(content, r.state);
  assert.equal(v.hero.maxHp, 44);
  assert.equal(v.hero.hp, 25);
  assert.deepEqual(fxOf(r.effects, 'levelUp').map((e) => [e.from, e.to]), [[1, 3]]);
  assert.deepEqual(fxOf(r.effects, 'levelUp')[0].gains, { maxHp: 4, maxMp: 4, attack: 4, defense: 4 });
});

test('912 xp is level 20 (78 hp / 48 mp / 44 attack / 42 defense before gear); more xp changes nothing', () => {
  const r = walk(content, place(base, 10, { xp: 908, level: 19 }), 4); // 908 + 4 = 912
  assert.equal(r.state.level, 20);
  const v = view(content, r.state);
  assert.deepEqual([v.hero.levelRow.maxHp, v.hero.levelRow.maxMp, v.hero.levelRow.attack, v.hero.levelRow.defense], [78, 48, 44, 42]);
  assert.equal(v.hero.attack, 44 + 1); // + travelling sword
  assert.equal(v.hero.defense, 42 + 1);
  const again = walk(content, place(base, 10, { xp: 912, level: 20 }), 3);
  assert.equal(again.state.level, 20);
  assert.equal(again.state.xp, 915);
  assert.equal(v.hero.xpToNext, null);
  // the table itself
  assert.equal(content.levelTable[19].totalXp, 912);
  assert.equal(content.levelTable[0].xpToNext, 12);
  assert.equal(content.levelTable[1].xpToNext, 16);
});

test('level-ups are the same for every job and route', () => {
  for (const job of ['JB00', 'JB01', 'JB02', 'JB03']) {
    for (const route of ['M', 'F', 'B', 'H']) {
      const b = exampleRun(content, route);
      const r = walk(content, place(b, 10, { xp: 22, job }), 6);
      assert.deepEqual([r.state.level, view(content, r.state).hero.maxHp], [3, 44]);
    }
  }
  void dispatch;
});
