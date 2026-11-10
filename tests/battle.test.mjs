import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, view } from '../src/engine/index.js';
import { cl, exampleRun, fxOf, getContent, place, startBattle, walk, withScripts } from './fixtures/helpers.mjs';

const content = await getContent();
const base = exampleRun(content, 'M');
const NO_DROPS = { rolls: [0.99, 0.99] }; // gear / item rolls both miss

const tweak = (s, fn) => {
  const t = cl(s);
  fn(t);
  return t;
};
const A = (c, s, a, o) => dispatch(c, s, a, o);

test('rounds: damage = max(1, atk-def) with the announced defense; zero-attack actions do not hit; the table cycles from order 1', () => {
  // die 3 -> the first positive damage the hero takes is softened by 4 (tuning.dieBonus.small)
  const b = startBattle(content, base, 'EN09', { die: 3 });
  const c = b.content;
  let s = b.state;
  assert.equal(s.phase, 'battle');
  let v = view(c, s);
  assert.deepEqual([v.battle.telegraph.name, v.battle.telegraph.kind, v.battle.telegraph.defense, v.battle.telegraph.hits], ['草束を投げる', '通常攻撃', 2, true]);
  assert.deepEqual([v.battle.telegraph.damageIfUnguarded, v.battle.telegraph.damageIfGuarded, v.battle.telegraph.heroAttackDamage], [5, 3, 5]);
  // round 1: hero deals 7-2=5; enemy base 10-5=5, softened to 1
  let r = A(c, s, { type: 'attack' });
  s = r.state;
  assert.equal(s.battle.enemy.hp, 8);
  assert.equal(s.hp, 39);
  assert.deepEqual(fxOf(r.effects, 'hit').map((e) => [e.target, e.amount]), [['enemy', 5], ['hero', 1]]);
  // round 2: 草盾 (defense 5, no attack): displayed defense applies this turn, the enemy does not hit
  v = view(c, s);
  assert.deepEqual([v.battle.telegraph.name, v.battle.telegraph.defense, v.battle.telegraph.hits], ['草盾を立てる', 5, false]);
  r = A(c, s, { type: 'attack' });
  s = r.state;
  assert.equal(s.battle.enemy.hp, 6); // 7-5 = 2
  assert.equal(s.hp, 39);
  assert.deepEqual(fxOf(r.effects, 'hit').map((e) => e.target), ['enemy']);
  // round 3: ほどける (defense 1): 6 damage kills; the kill is a win, no enemy action
  v = view(c, s);
  assert.equal(v.battle.telegraph.defense, 1);
  r = A(c, s, { type: 'attack' }, NO_DROPS);
  assert.equal(r.state.phase, 'battleReward');
  assert.equal(fxOf(r.effects, 'enemyAct').length, 0);
  assert.equal(r.state.hp, 39);
  // the table wraps back to order 1
  const again = startBattle(content, base, 'EN09', { die: 3 });
  let t = again.state;
  for (let i = 0; i < 3; i++) t = A(again.content, t, { type: 'guard' }).state;
  assert.equal(view(again.content, t).battle.telegraph.name, '草束を投げる');
  assert.equal(t.battle.round, 4);
});

test('guard halves (ceil) before everything else; a softened 0 leaves nothing to take', () => {
  const b = startBattle(content, base, 'EN09', { die: 5 }); // die 5: no soften, boost on the first direct hit
  const r = A(b.content, b.state, { type: 'guard' });
  assert.equal(r.state.hp, 37); // ceil(5/2) = 3
  const soft = startBattle(content, base, 'EN09', { die: 2 });
  const r2 = A(soft.content, soft.state, { type: 'guard' });
  assert.equal(r2.state.hp, 40); // ceil(5/2)=3, softened by 3 -> 0
  assert.equal(fxOf(r2.effects, 'hit').find((e) => e.target === 'hero').amount, 0);
});

test('landing die: 1-3 softens only the first positive hit taken; 4-6 boosts only the first direct damage (attack/spell/AT01, not AT11)', () => {
  const soft = startBattle(content, base, 'EN09', { die: 3 });
  let s = A(soft.content, soft.state, { type: 'attack' }).state;
  assert.equal(s.hp, 39);
  s = A(soft.content, s, { type: 'guard' }).state; // round 2: no attack
  s = A(soft.content, s, { type: 'guard' }).state; // round 3
  const r4 = A(soft.content, s, { type: 'guard' }); // round 4: 草束 again, guarded: ceil(5/2) = 3, soften already used
  assert.equal(r4.state.hp, 36);

  const boost = startBattle(content, base, 'EN09', { die: 5, patch: { bag: ['AT11', 'AT01'] } });
  assert.deepEqual(view(boost.content, boost.state).battle.dieBonus, { kind: 'boost', amount: 5, used: false, die: 5 });
  let t = tweak(boost.state, (x) => { x.battle.enemy.hp = 60; x.battle.enemy.maxHp = 60; });
  let r = A(boost.content, t, { type: 'item', itemId: 'AT11' }); // two 5s, not boostable
  assert.equal(r.state.battle.enemy.hp, 50);
  assert.equal(r.state.battle.dieBonus.used, false);
  r = A(boost.content, r.state, { type: 'attack' }); // round 2 (def 5): 2 + 5 boost (die 5)
  assert.equal(r.state.battle.enemy.hp, 43);
  assert.equal(r.state.battle.dieBonus.used, true);
  r = A(boost.content, r.state, { type: 'item', itemId: 'AT01' }); // plain 10 now
  assert.equal(r.state.battle.enemy.hp, 33);
  // guard / heal / viewing never spend the boost
  const g = startBattle(content, base, 'EN09', { die: 6 });
  assert.equal(A(g.content, g.state, { type: 'guard' }).state.battle.dieBonus.used, false);
});

test('a normal battle can always be fled before the enemy acts: no gold, xp or items; walking xp stays', () => {
  const b = startBattle(content, base, 'EN09', { die: 4 });
  const xpBefore = b.state.xp;
  const r = A(b.content, b.state, { type: 'flee' });
  assert.equal(r.state.phase, 'board');
  assert.equal(r.state.hp, 40);
  assert.equal(r.state.gold, 200);
  assert.equal(r.state.xp, xpBefore);
  assert.deepEqual(fxOf(r.effects, 'rewards'), []);
  assert.deepEqual(fxOf(r.effects, 'enemyAct'), []);
  assert.equal(r.state.battle, null);
  assert.equal(r.state.done['10'], true);
});

test('mutual KO is a defeat; a counter that kills a surviving hero wins', () => {
  // enemy 4 hp, hero 5 hp, AT03 caltrops; the hit costs 5, the caltrops deal 4: both fall -> defeat
  const b = startBattle(content, base, 'EN09', { die: 5, patch: { hp: 5, bag: ['AT03'] } });
  let s = tweak(b.state, (x) => { x.battle.enemy.hp = 4; });
  let r = A(b.content, s, { type: 'item', itemId: 'AT03' });
  assert.equal(r.state.hp, 0);
  assert.equal(r.state.battle.enemy.hp, 0);
  assert.equal(r.state.phase, 'retryOffer');
  assert.deepEqual(fxOf(r.effects, 'rewards'), []);
  assert.equal(r.state.gold, 200);
  // hero hp 10: survives with 5, the caltrops finish the enemy: victory, and rewards exactly once
  const c = startBattle(content, base, 'EN09', { die: 5, patch: { hp: 10, bag: ['AT03'] } });
  s = tweak(c.state, (x) => { x.battle.enemy.hp = 4; });
  r = A(c.content, s, { type: 'item', itemId: 'AT03' }, NO_DROPS);
  assert.equal(r.state.hp, 5);
  assert.equal(r.state.phase, 'battleReward');
  assert.equal(r.state.gold, 340);
  assert.equal(fxOf(r.effects, 'victory').length, 1);
  assert.equal(fxOf(r.effects, 'rewards').length, 1);
});

test('AT03: 4 damage back for each hit of 1+ during this and the next enemy action, at most twice, then it is gone', () => {
  const b = startBattle(content, base, 'EN09', { die: 5, patch: { bag: ['AT03'] } });
  let s = tweak(b.state, (x) => { x.battle.enemy.hp = 40; x.battle.enemyMaxHp = 40; });
  let r = A(b.content, s, { type: 'item', itemId: 'AT03' }); // enemy 草束: hit 5 -> back 4
  assert.equal(r.state.battle.enemy.hp, 36);
  assert.equal(r.state.battle.marks.length, 1);
  r = A(b.content, r.state, { type: 'guard' }); // 草盾: no hit -> nothing; the mark has now seen both actions
  assert.equal(r.state.battle.enemy.hp, 36);
  assert.equal(r.state.battle.marks.length, 0);
  // no stacking of the same mark
  const twice = startBattle(content, base, 'EN09', { die: 5, patch: { bag: ['AT03', 'AT03'] } });
  const first = A(twice.content, twice.state, { type: 'item', itemId: 'AT03' });
  assert.throws(() => A(twice.content, first.state, { type: 'item', itemId: 'AT03' }), /item_alreadyActive|mark_active/);
});

test('AT02 halves (ceil) the next hit actually taken; no-attack turns and 0 damage keep the mark', () => {
  const b0 = startBattle(content, base, 'EN09', { die: 5, patch: { bag: ['AT02'] } });
  const b = { content: b0.content, state: tweak(b0.state, (x) => { x.battle.enemy.hp = 100; x.battle.enemy.maxHp = 100; }) };
  let r = A(b.content, b.state, { type: 'item', itemId: 'AT02' }); // hit 5 -> 3
  assert.equal(r.state.hp, 37);
  assert.equal(r.state.battle.marks.length, 0);
  // use it on a round where the enemy does not attack: the mark waits
  let s = A(b.content, b.state, { type: 'attack' }).state; // round 1 done
  r = A(b.content, s, { type: 'item', itemId: 'AT02' }); // round 2: 草盾, no attack
  assert.equal(r.state.battle.marks.length, 1);
  r = A(b.content, r.state, { type: 'attack' }); // round 3, still no attack
  assert.equal(r.state.battle.marks.length, 1);
  const before = r.state.hp;
  r = A(b.content, r.state, { type: 'attack' }); // round 4: 草束 hits 5 -> 3
  assert.equal(before - r.state.hp, 3);
  assert.equal(r.state.battle.marks.length, 0);
  // not stackable
  const dup = startBattle(content, base, 'EN09', { die: 5, patch: { bag: ['AT02', 'AT02'] } });
  const one = A(dup.content, dup.state, { type: 'attack' }).state;
  const used = A(dup.content, one, { type: 'item', itemId: 'AT02' }).state;
  assert.throws(() => A(dup.content, used, { type: 'item', itemId: 'AT02' }), /item_alreadyActive/);
});

test('reduction order: guard -> 石の衣 -> shield companion -> small die -> card; a card keeps its use when nothing is left to halve', () => {
  const card = { id: 'card', hook: 'enemyDamage', stage: 'card', when: { gt: [{ ref: 'battle.damage' }, 0] }, uses: 1, effects: [{ op: 'halveDamage', round: 'ceil' }] };
  // EN09, die 2 (soften 5): guarded 5 -> 3, softened 3 -> 0: the card is not spent
  const g = startBattle(content, base, 'EN09', { die: 2, rules: [card] });
  let r = A(g.content, g.state, { type: 'guard' });
  assert.equal(r.state.hp, 40);
  assert.equal(r.state.battle.marks.length, 1);
  // EN03, die 3 (soften 4): unguarded 10 -> softened 6 -> card 3
  const u = startBattle(content, base, 'EN03', { die: 3, rules: [card] });
  r = A(u.content, u.state, { type: 'attack' });
  assert.equal(r.state.hp, 37);
  assert.equal(r.state.battle.marks.length, 0);
});

test('AT11 hits twice and stops when the first hit finishes the enemy; AT01 10 flat', () => {
  const b = startBattle(content, base, 'EN09', { die: 2, patch: { bag: ['AT11'] } });
  const s = tweak(b.state, (x) => { x.battle.enemy.hp = 5; });
  const r = A(b.content, s, { type: 'item', itemId: 'AT11' }, NO_DROPS);
  assert.equal(fxOf(r.effects, 'hit').filter((e) => e.target === 'enemy').length, 1);
  assert.equal(r.state.phase, 'battleReward');
});

test('spells: cost shown and paid, insufficient mp neither spends nor lets the enemy act; mage discount; heal; finisher vs 大技; 石の衣 persists until a hit lands', () => {
  const learned = { spells: { learned: ['SP01', 'SP02', 'SP03', 'SP04'], prepared: ['SP01', 'SP04'] } };
  const sw10 = { gear: [...base.gear, { iid: 'g3', id: 'SW10', paidGold: null, from: 'drop' }], equipped: { sword: 'g3', armor: 'g2' } }; // atk 6+5
  const b = startBattle(content, base, 'EN03', { die: 2, patch: { ...learned, ...sw10, hp: 30 } });
  const v = view(b.content, b.state);
  assert.deepEqual(v.battle.spells.map((x) => [x.id, x.cost, x.mpAfter]), [['SP01', 4, 6], ['SP04', 7, 3]]);
  // 火花: 4 + 2 x level = 6 fixed damage (defense 6 does not matter)
  let r = A(b.content, b.state, { type: 'spell', spellId: 'SP01' });
  assert.equal(r.state.mp, 6);
  assert.equal(r.state.battle.enemy.hp, 12);
  assert.throws(() => A(b.content, b.state, { type: 'spell', spellId: 'SP02' }), /spell_not_prepared/);
  // finisher: x1 on a normal telegraph (11-6 = 5), x2 on 大技 (round 2)
  r = A(b.content, b.state, { type: 'spell', spellId: 'SP04' });
  assert.equal(r.state.battle.enemy.hp, 18 - 5);
  const big = tweak(b.state, (x) => { x.battle.enemy.hp = 60; x.battle.enemy.maxHp = 60; x.mp = 20; });
  const r2 = A(b.content, big, { type: 'guard' });
  assert.equal(r2.state.battle.current.kind, '大技');
  const fin = A(b.content, r2.state, { type: 'spell', spellId: 'SP04' });
  assert.equal(60 - fin.state.battle.enemy.hp, 10);
  const poor = tweak(r2.state, (x) => { x.mp = 6; });
  assert.equal(view(b.content, poor).battle.spells[1].enabled, false);
  // insufficient mp: dispatch throws, nothing changes (no enemy action either)
  const low = tweak(b.state, (x) => { x.mp = 3; });
  const frozen = cl(low);
  assert.throws(() => A(b.content, low, { type: 'spell', spellId: 'SP01' }), /insufficient_mp/);
  assert.deepEqual(low, frozen);
  // mage discount: attack spells only, min 1
  const mage = startBattle(content, base, 'EN03', { die: 2, patch: { ...learned, job: 'JB02' } });
  assert.deepEqual(view(mage.content, mage.state).battle.spells.map((x) => x.cost), [2, 5]);
  assert.equal(A(mage.content, mage.state, { type: 'spell', spellId: 'SP01' }).state.mp, 8);
  const mageHeal = startBattle(content, base, 'EN03', { die: 2, patch: { spells: { learned: ['SP02'], prepared: ['SP02'] }, job: 'JB02', hp: 5 } });
  assert.equal(view(mageHeal.content, mageHeal.state).battle.spells[0].cost, 5); // not an attack spell
  // heal 10 + level: 11, then the crab's hit (15-5 = 10, softened 5) leaves 5
  const heal = startBattle(content, base, 'EN03', { die: 2, patch: { spells: { learned: ['SP01', 'SP02'], prepared: ['SP01', 'SP02'] }, hp: 10 } });
  const h = A(heal.content, heal.state, { type: 'spell', spellId: 'SP02' });
  assert.equal(h.state.mp, 5);
  assert.equal(h.state.hp, 10 + 11 - 5);
  const full = startBattle(content, base, 'EN03', { die: 2, patch: { spells: { learned: ['SP02'], prepared: ['SP02'] } } });
  assert.throws(() => A(full.content, full.state, { type: 'spell', spellId: 'SP02' }), /hp_full/);
  // 石の衣: blocks up to 20 of the next hit that lands, survives a turn without an attack, cannot be stacked
  const wall = startBattle(content, base, 'EN09', { die: 5, patch: { spells: { learned: ['SP03'], prepared: ['SP03'] } } });
  const w0 = tweak(wall.state, (x) => { x.battle.enemy.hp = 100; x.battle.enemy.maxHp = 100; });
  const w = A(wall.content, w0, { type: 'spell', spellId: 'SP03' }); // round 1: the hit (5) is blocked
  assert.equal(w.state.hp, 40);
  assert.equal(w.state.battle.marks.length, 0);
  // a round without an attack (草盾): the wall stays; casting it again is refused
  const noAttack = { order: 2, name: '草盾を立てる', attack: 0, defense: 5, kind: '守り', tell: '', phaseIdx: 0 };
  const atAttackFree = tweak(w0, (x) => { x.battle.cursor = 1; x.battle.current = { ...noAttack }; x.battle.rounds[0].enemyAction = { ...noAttack }; });
  const w1 = A(wall.content, atAttackFree, { type: 'spell', spellId: 'SP03' });
  assert.equal(w1.state.hp, 40);
  assert.equal(w1.state.battle.marks.length, 1);
  assert.throws(() => A(wall.content, tweak(w1.state, (x) => { x.mp = 10; }), { type: 'spell', spellId: 'SP03' }), /spell_active/);
  // it then blocks the next hit that lands (up to 20), even a guarded one, and is gone afterwards
  const hitRound = tweak(w1.state, (x) => { const a = { order: 1, name: '草束を投げる', attack: 10, defense: 2, kind: '通常攻撃', tell: '', phaseIdx: 0 }; x.battle.cursor = 0; x.battle.current = a; x.battle.rounds[x.battle.round - 1].enemyAction = a; });
  const w2 = A(wall.content, hitRound, { type: 'guard' });
  assert.equal(w2.state.hp, 40);
  assert.equal(w2.state.battle.marks.length, 0);
});

test('warrior: the attack right after a guard hits 6 harder', () => {
  const b = startBattle(content, base, 'EN09', { die: 2, patch: { job: 'JB01' } });
  let s = tweak(b.state, (x) => { x.battle.enemy.hp = 40; x.battle.enemy.maxHp = 40; });
  s = A(b.content, s, { type: 'guard' }).state; // round 1
  const r = A(b.content, s, { type: 'attack' }); // round 2 (defense 5): 7-5 = 2, +6
  assert.equal(40 - r.state.battle.enemy.hp, 8);
  const r2 = A(b.content, r.state, { type: 'attack' }); // round 3 (defense 1): 6, no bonus
  assert.equal(r.state.battle.enemy.hp - r2.state.battle.enemy.hp, 6);
});

test('companions: shield trims every 大技 hit by 5 before the hit, medic heals 15 once at half hp, thrower, lantern', () => {
  const shield = startBattle(content, base, 'EN03', { die: 5, patch: { companions: ['CP01'] } });
  let s = A(shield.content, shield.state, { type: 'guard' }).state; // round 1: normal 10, guarded 5
  assert.equal(s.hp, 35);
  const r = A(shield.content, s, { type: 'attack' }); // round 2: 大技 22-5 = 17, shield 5 -> 12
  assert.equal(35 - r.state.hp, 12);
  assert.equal(fxOf(r.effects, 'companion')[0].role, 'shield');
  // the shield does not touch a normal attack
  const plain = startBattle(content, base, 'EN03', { die: 5, patch: { companions: ['CP01'] } });
  assert.equal(A(plain.content, plain.state, { type: 'attack' }).state.hp, 30);

  const medic = startBattle(content, base, 'EN03', { die: 5, patch: { companions: ['CP02'], hp: 24 } });
  let m = A(medic.content, medic.state, { type: 'attack' }); // 24-10 = 14 <= 20 -> heal 15
  assert.equal(m.state.hp, 29);
  assert.equal(fxOf(m.effects, 'companion')[0].amount, 15);
  m = A(medic.content, m.state, { type: 'attack' }); // 大技 17 -> 12 <= 20 but already used
  assert.equal(m.state.hp, 12);

  // CP03 thrower: 6 damage ignoring defense on an 反撃の隙 turn when the hero's action left the enemy alive
  const thrower = startBattle(content, base, 'EN03', { die: 2, patch: { companions: ['CP03'] } });
  let t = tweak(thrower.state, (x) => { x.battle.enemy.hp = 100; x.battle.enemy.maxHp = 100; });
  t = A(thrower.content, t, { type: 'guard' }).state;
  let tr = A(thrower.content, t, { type: 'guard' });
  assert.equal(fxOf(tr.effects, 'companion').length, 0);
  t = tr.state; // round 3: 両ばさみが下がる (defense 2): attack 7-2 = 5, thrower 6
  tr = A(thrower.content, t, { type: 'attack' });
  assert.equal(t.battle.enemy.hp - tr.state.battle.enemy.hp, 5 + 6);
  assert.equal(fxOf(tr.effects, 'companion')[0].role, 'thrower');
  // the thrower can finish the enemy: a win is a win
  const finish = tweak(t, (x) => { x.battle.enemy.hp = 8; });
  assert.equal(A(thrower.content, finish, { type: 'attack' }, NO_DROPS).state.phase, 'battleReward');

  // CP04 lantern: +3 mp when a fight starts, including a retry; the recorded start mp is the one before it
  const lantern = startBattle(content, base, 'EN09', { die: 5, patch: { companions: ['CP04'], mp: 5, hp: 1 } });
  assert.equal(lantern.state.mp, 8);
  assert.equal(lantern.state.battle.startMp, 5);
  const lost = A(lantern.content, lantern.state, { type: 'attack' });
  assert.equal(lost.state.phase, 'retryOffer');
  const again = A(lantern.content, A(lantern.content, lost.state, { type: 'retry' }).state, { type: 'resumeBattle' });
  assert.equal(again.state.mp, 8); // max(5, ceil(10/2)) = 5, then +3 again
});

test('gear rules: SW07 riposte, SW50 combo (attack+guard in any order), one use per battle', () => {
  const sw07 = startBattle(content, base, 'EN09', { die: 3, patch: { gear: [...base.gear, { iid: 'g3', id: 'SW07', paidGold: null, from: 'drop' }], equipped: { sword: 'g3', armor: 'g2' } } });
  let s = tweak(sw07.state, (x) => { x.battle.enemy.hp = 50; x.battle.enemy.maxHp = 50; });
  s = A(sw07.content, s, { type: 'attack' }).state; // round 1: 9-2 = 7, hp lost this round (2 after soften)
  assert.equal(s.battle.enemy.hp, 43);
  let r = A(sw07.content, s, { type: 'attack' }); // round 2 (def 5): 4 + 3
  assert.equal(43 - r.state.battle.enemy.hp, 7);
  r = A(sw07.content, r.state, { type: 'attack' }); // round 3 (def 1): 8, no second riposte
  assert.equal(36 - r.state.battle.enemy.hp, 8);

  const sw50 = startBattle(content, base, 'EN09', { die: 2, patch: { hp: 30, gear: [...base.gear, { iid: 'g3', id: 'SW50', paidGold: null, from: 'drop' }], equipped: { sword: 'g3', armor: 'g2' } } });
  s = tweak(sw50.state, (x) => { x.battle.enemy.hp = 200; x.battle.enemy.maxHp = 200; });
  s = A(sw50.content, s, { type: 'guard' }).state; // round 1 guard
  s = A(sw50.content, s, { type: 'attack' }).state; // round 2 attack (def 5): 28-5 = 23, no combo yet
  assert.equal(200 - s.battle.enemy.hp, 23);
  const hpBefore = s.hp;
  r = A(sw50.content, s, { type: 'attack' }); // round 3: guard,attack in the last 2 rounds -> +9, heal 4
  assert.equal(s.battle.enemy.hp - r.state.battle.enemy.hp, 27 + 9);
  assert.equal(fxOf(r.effects, 'rule').filter((e) => e.owner === 'gear:SW50').length, 1);
  assert.ok(r.state.hp >= hpBefore - 5 + 4 - 1);
  r = A(sw50.content, r.state, { type: 'attack' }); // round 4: no combo any more (once per battle)
  assert.equal(fxOf(r.effects, 'rule').filter((e) => e.owner === 'gear:SW50').length, 0);
});

test('AR07 heals 2 on a confirmed adjusted die of 1 only (steps do not count); AR29 reads hp at the moment of victory before other heals', () => {
  const t = place(base, 10, { hp: 30, gear: [...base.gear, { iid: 'g3', id: 'AR07', paidGold: null, from: 'drop' }], equipped: { sword: 'g1', armor: 'g3' } });
  assert.equal(walk(content, t, 1).state.hp, 32);
  assert.equal(walk(content, t, 4).state.hp, 30);
  // a die forced to 1 by an item counts; a roll of 4 that only walks 1 step does not
  const near = place(base, 7, { hp: 30, gear: t.gear, equipped: t.equipped }); // inn at 8: a 4 walks 1 step
  assert.equal(walk(content, near, 4).state.hp, 30);
  assert.equal(walk(content, near, 1).state.hp, 32);

  const win = startBattle(content, base, 'EN09', { die: 5, patch: { hp: 10, gear: [...base.gear, { iid: 'g3', id: 'AR29', paidGold: null, from: 'drop' }], equipped: { sword: 'g1', armor: 'g3' } } });
  const s = tweak(win.state, (x) => { x.battle.enemy.hp = 3; });
  const r = A(win.content, s, { type: 'attack' }, NO_DROPS);
  assert.equal(r.state.phase, 'battleReward');
  assert.equal(r.state.hp, 17); // hp 10 <= 40/4 at victory -> +7
  const healthy = tweak(win.state, (x) => { x.battle.enemy.hp = 3; x.hp = 11; });
  assert.equal(A(win.content, healthy, { type: 'attack' }, NO_DROPS).state.hp, 11);
});

test('MB03 (B5-30): the offer can be skipped; once challenged there is no fleeing; decoys deal 0; the real target takes the first-footprint bonus', () => {
  const eb = exampleRun(content, 'B');
  const land = (patch) => {
    const t = place(eb, 87, patch);
    const t2 = tweak(t, (x) => { x.board.squares[89] = { position: 90, contentId: 'B5-30' }; });
    return walk(content, t2, 3);
  };
  const r = land({});
  assert.equal(r.state.phase, 'bossOffer');
  assert.deepEqual(view(content, r.state).actions.map((a) => a.type), ['challenge', 'skip']);
  const skipped = A(content, r.state, { type: 'skip' });
  assert.equal(skipped.state.phase, 'board');
  assert.equal(skipped.state.gold, 200);
  assert.equal(skipped.state.battle, null);
  assert.deepEqual(fxOf(skipped.effects, 'rewards'), []);

  const ch = A(content, r.state, { type: 'challenge' });
  let s = ch.state;
  assert.equal(s.phase, 'battle');
  assert.throws(() => A(content, s, { type: 'flee' }), /flee_forbidden/);
  assert.throws(() => A(content, s, { type: 'attack' }), /target_required/);
  const v = view(content, s);
  assert.equal(v.battle.targets.length, 3);
  assert.equal(v.battle.targets.filter((t) => t.footprint === 'fresh').length, 1);
  const real = s.battle.targets.find((t) => t.real).index;
  const fake = s.battle.targets.find((t) => !t.real).index;
  // a reload keeps the same body
  assert.equal(JSON.parse(JSON.stringify(s)).battle.targets.find((t) => t.real).index, real);
  // wrong target: 0 damage, but the enemy still acts and the bonus is not spent
  const miss = A(content, s, { type: 'attack', target: fake });
  assert.equal(miss.state.battle.enemy.hp, s.battle.enemy.hp);
  assert.ok(fxOf(miss.effects, 'hit').some((e) => e.target === 'enemy' && e.blocked === 'decoy'));
  assert.equal(miss.state.battle.round, 2);
  // right target in round 1: max(1, 7-21)=1 + 6 bonus (die 3: soften, no boost)
  const hit = A(content, s, { type: 'attack', target: real });
  assert.equal(s.battle.enemy.hp - hit.state.battle.enemy.hp, 7);
  // the bonus is only for round 1: later rounds deal the base damage
  const later = A(content, miss.state, { type: 'attack', target: miss.state.battle.targets.find((t) => t.real).index });
  assert.equal(miss.state.battle.enemy.hp - later.state.battle.enemy.hp, 1);
  // items obey the decoys too
  const withItem = tweak(s, (x) => { x.bag = ['AT01']; });
  const itemMiss = A(content, withItem, { type: 'item', itemId: 'AT01', target: fake });
  assert.equal(itemMiss.state.battle.enemy.hp, s.battle.enemy.hp);
  const itemHit = A(content, withItem, { type: 'item', itemId: 'AT01', target: real });
  assert.equal(s.battle.enemy.hp - itemHit.state.battle.enemy.hp, 10);
});

test('demon king: 124 hp, crown breaks at <= 62 once; the announced action still happens, the next one comes from phase 2; the kill blow wins first', () => {
  const lv20 = { level: 20, xp: 912, hp: 78, mp: 48 };
  const gate = walk(content, place(base, 99, lv20), 1).state;
  assert.equal(gate.phase, 'gate');
  const king = A(content, gate, { type: 'challengeKing' }).state;
  assert.equal(king.battle.enemy.maxHp, 124);
  assert.equal(king.battle.kind, 'king');
  assert.throws(() => A(content, king, { type: 'flee' }), /flee_forbidden/);
  assert.equal(view(content, king).battle.telegraph.name, '王の剣');
  const hero = view(content, king).hero;
  assert.deepEqual([hero.levelRow.maxHp, hero.levelRow.maxMp, hero.levelRow.attack, hero.levelRow.defense], [78, 48, 44, 42]);

  // 87 -> 63: not yet; the next telegraph is still phase 1 (王の強斬)
  let s = tweak(king, (x) => { x.battle.enemy.hp = 87; });
  let r = A(content, s, { type: 'attack' });
  assert.equal(r.state.battle.enemy.hp, 63);
  assert.deepEqual(fxOf(r.effects, 'phaseChange'), []);
  assert.equal(view(content, r.state).battle.telegraph.name, '王の強斬');
  // 86 -> 62: crown breaks. The current 王の剣 is executed, the next telegraph is phase 2 order 1
  s = tweak(king, (x) => { x.battle.enemy.hp = 86; });
  r = A(content, s, { type: 'attack' });
  assert.equal(r.state.battle.enemy.hp, 62);
  assert.equal(fxOf(r.effects, 'phaseChange').length, 1);
  assert.equal(fxOf(r.effects, 'enemyAct')[0].name, '王の剣');
  let v = view(content, r.state);
  assert.deepEqual([v.battle.phase.index, v.battle.phase.name, v.battle.telegraph.name], [1, '後半', '魔剣の波']);
  // phase 2 cycles 魔剣の波 -> 玉座の一撃 -> 王冠の隙 -> 魔剣の波 and never breaks again
  const names = [];
  let t = r.state;
  for (let i = 0; i < 4; i++) {
    names.push(view(content, t).battle.telegraph.name);
    const step = A(content, t, { type: 'guard' });
    assert.deepEqual(fxOf(step.effects, 'phaseChange'), []);
    t = step.state;
  }
  assert.deepEqual(names, ['魔剣の波', '玉座の一撃', '王冠の隙', '魔剣の波']);
  // the kill blow at exactly the crown threshold wins instead of breaking the crown
  s = tweak(king, (x) => { x.battle.enemy.hp = 24; });
  r = A(content, s, { type: 'attack' }, NO_DROPS);
  assert.deepEqual(fxOf(r.effects, 'phaseChange'), []);
  assert.equal(fxOf(r.effects, 'enemyAct').length, 0);
  assert.equal(r.state.victory.enemyId, 'DK01');
});

test('battle actions are illegal outside a fight and an unknown item or spell never changes the state', () => {
  const b = startBattle(content, base, 'EN09', { die: 2, patch: { bag: ['HE01'] } });
  assert.throws(() => A(b.content, b.state, { type: 'item', itemId: 'AT01' }), /no_such_item/);
  assert.throws(() => A(b.content, b.state, { type: 'roll' }), /illegal_action/);
  assert.throws(() => A(b.content, b.state, { type: 'leaveInn' }), /illegal_action/);
  void withScripts;
});
