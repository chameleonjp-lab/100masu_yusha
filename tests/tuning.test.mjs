import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildContent, ContentError } from '../src/content/index.js';
import { createNodeLoader } from '../src/content/node.js';
import { dispatch, view } from '../src/engine/index.js';
import { exampleRun, fxOf, getContent, landOnEvent, place, startBattle, walk } from './fixtures/helpers.mjs';

const content = await getContent();
const base = exampleRun(content, 'M');
const A = (c, s, a, o) => dispatch(c, s, a, o);

async function rawInputs() {
  const loader = createNodeLoader();
  const files = await loader.scriptFiles();
  const read = async (list) => Promise.all(list.map(async (name) => ({ name, json: await loader.readJson(`data/scripts/${name}`) })));
  return {
    base: await loader.readJson('data/adventure-content.json'),
    balance: await loader.readJson('data/balance-draft-2.json'),
    tuning: await loader.readJson('data/tuning.json'),
    patch: await loader.readJson('data/patches/encounters-balance-draft-2.json'),
    scripts: { events: await read(files.events), items: await read(files.items), equipment: await read(files.equipment) },
    tuningSource: 'data',
  };
}

test('default loading uses data/tuning.json (no stub fallback)', () => {
  assert.equal(content.tuningSource, 'data');
  assert.equal(content.tuningVersion, 'tuning-1');
});

test('EN02 band 3 and EN07 band 5 use their own stat blocks; other bands keep the base block (same enemy id)', () => {
  const e2 = content.enemies.EN02;
  assert.deepEqual([e2.maxHp, e2.phases[0].actions[0].attack], [14, 11]);
  assert.deepEqual([e2.bandStats[3].maxHp, e2.bandStats[3].phases[0].actions[0].attack, e2.bandStats[3].phases[0].actions[1].defense], [20, 20, 16]);
  const e7 = content.enemies.EN07;
  assert.deepEqual([e7.maxHp, e7.bandStats[5].maxHp], [32, 40]);

  // band 1 (square 10): the base block
  const b1 = startBattle(content, base, 'EN02', { die: 3, pos: 10 });
  assert.equal(b1.state.battle.band, 1);
  assert.equal(b1.state.battle.enemy.maxHp, 14);
  assert.equal(view(b1.content, b1.state).battle.telegraph.attack, 11);
  assert.equal(b1.state.battle.enemyId, 'EN02');

  // band 3 (square 50): the override block, announced defenses included
  const b3 = startBattle(content, base, 'EN02', { die: 3, pos: 50 });
  assert.equal(b3.state.battle.band, 3);
  assert.equal(b3.state.battle.enemy.maxHp, 20);
  const v3 = view(b3.content, b3.state);
  assert.deepEqual([v3.battle.telegraph.attack, v3.battle.telegraph.defense], [20, 8]);
  const r2 = A(b3.content, b3.state, { type: 'guard' });
  const t2 = view(b3.content, r2.state).battle.telegraph;
  assert.deepEqual([t2.name, t2.attack, t2.defense], ['丸まって転がる', 26, 16]);
  assert.equal(r2.state.battle.enemyId, 'EN02');

  // EN07: band 4 base, band 5 override
  const s4 = startBattle(content, base, 'EN07', { die: 3, pos: 70 });
  assert.equal(s4.state.battle.band, 4);
  assert.equal(s4.state.battle.enemy.maxHp, 32);
  assert.equal(view(s4.content, s4.state).battle.telegraph.attack, 30);
  const s5 = startBattle(content, base, 'EN07', { die: 3, pos: 90 });
  assert.equal(s5.state.battle.band, 5);
  assert.equal(s5.state.battle.enemy.maxHp, 40);
  assert.deepEqual([view(s5.content, s5.state).battle.telegraph.attack, view(s5.content, s5.state).battle.telegraph.defense], [35, 13]);
  // the dex entry is the same enemy either way
  assert.deepEqual(s5.state.discovered.enemies, ['EN07']);
});

test('a band override for a band the enemy never appears in fails content validation', async () => {
  const raw = await rawInputs();
  raw.tuning.normalEnemies.EN02.bandOverrides['5'] = raw.tuning.normalEnemies.EN02.bandOverrides['3'];
  assert.throws(() => buildContent(raw), (e) => e instanceof ContentError && e.problems.some((p) => p.code === 'tuning-band-override'));
  const raw2 = await rawInputs();
  delete raw2.tuning.normalEnemies.EN02.bandOverrides['3'].maxHp;
  assert.throws(() => buildContent(raw2), (e) => e instanceof ContentError && e.problems.some((p) => p.code === 'tuning-band-override'));
});

test('landing-die table: 1/2/3 reduce the first positive damage taken by 6/5/4, 4/5/6 add 4/5/6 to the first direct hit', () => {
  for (const [die, soft] of [[1, 6], [2, 5], [3, 4]]) {
    const b = startBattle(content, base, 'EN03', { die }); // first hit: 15-5 = 10
    assert.equal(A(b.content, b.state, { type: 'attack' }).state.hp, 40 - (10 - soft), `die ${die}`);
  }
  for (const [die, plus] of [[4, 4], [5, 5], [6, 6]]) {
    const b = startBattle(content, base, 'EN03', { die }); // attack 7-6 = 1
    const r = A(b.content, b.state, { type: 'attack' });
    assert.equal(b.state.battle.enemy.hp - r.state.battle.enemy.hp, 1 + plus, `die ${die}`);
    assert.equal(r.state.hp, 30); // no softening
  }
  // the bonus belongs to the landing: with no battle on the landing square it is gone next turn
  const e = landOnEvent(content, base, 'H4-25', { pos: 30, die: 3 });
  assert.equal(e.state.phase, 'board');
  assert.equal(e.state.turn.die, null);
  assert.equal(e.state.battle, null);
});

test('tavern pairs follow tuning.taverns minus current companions, refilled by tavernFallbackOrder, fixed on first entry', () => {
  const at = (idx, companions) => {
    const t = place(base, base.board.innPositions[idx] - 1, { companions });
    return walk(content, t, 1).state;
  };
  const cands = (s) => view(content, s).inn.tavern.candidates.map((c) => c.id);
  assert.deepEqual(cands(at(0, [])), ['CP01', 'CP02']);
  assert.deepEqual(cands(at(1, [])), ['CP03', 'CP04']);
  assert.deepEqual(cands(at(4, [])), ['CP01', 'CP03']);
  // CP01 is travelling with us: band 5's pair loses it and is refilled in order (CP02 next)
  assert.deepEqual(cands(at(4, ['CP01'])), ['CP03', 'CP02']);
  // two companions out of the four: the pair is the other two, always two candidates
  assert.deepEqual(cands(at(3, ['CP01', 'CP04'])), ['CP02', 'CP03']);
  assert.deepEqual(cands(at(0, ['CP02', 'CP01'])), ['CP03', 'CP04']);
  // fixed for the visit
  const s = at(2, ['CP03']);
  assert.deepEqual(cands(JSON.parse(JSON.stringify(s))), cands(s));
});

test('spell numbers from the tuning table: SP01 4 + 2 x level fixed damage, SP02 10 + level, costs 4/5/4/7', () => {
  const costs = Object.fromEntries(Object.entries(content.spells).map(([id, sp]) => [id, sp.mpCost]));
  assert.deepEqual(costs, { SP01: 4, SP02: 5, SP03: 4, SP04: 7 });
  const lv5 = startBattle(content, base, 'EN09', { die: 5, patch: { level: 5, xp: 72, mp: 20, hp: 50, spells: { learned: ['SP01'], prepared: ['SP01'] } } });
  const hpBefore = lv5.state.battle.enemy.hp;
  const big = A(lv5.content, JSON.parse(JSON.stringify({ ...lv5.state, battle: { ...lv5.state.battle, enemy: { ...lv5.state.battle.enemy, hp: 100, maxHp: 100 } } })), { type: 'spell', spellId: 'SP01' });
  assert.equal(100 - big.state.battle.enemy.hp, 4 + 2 * 5 + 5); // + die-5 boost on the first direct hit
  void hpBefore;
  void fxOf;
});

test('tuning.json on disk keeps the documented shape', async () => {
  const tuning = JSON.parse(await readFile(new URL('../data/tuning.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(tuning.normalEnemies), ['EN01', 'EN02', 'EN03', 'EN04', 'EN05', 'EN06', 'EN07', 'EN08']);
  assert.deepEqual(tuning.tavernFallbackOrder, ['CP01', 'CP02', 'CP03', 'CP04']);
});
