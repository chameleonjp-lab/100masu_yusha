import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRunToMeta, compareResults, createMeta, rankResults } from '../src/engine/index.js';
import { exampleRun, getContent } from './fixtures/helpers.mjs';

const content = await getContent();
const R = (defeated, furthest, rolls, extra = {}) => ({ defeated, furthest, rolls, route: 'M', runId: `r${defeated}${furthest}${rolls}`, job: 'JB00', companions: [], ...extra });

test('ordering: defeated first, then the furthest square, then fewer rolls; all equal is the same rank', () => {
  assert.ok(compareResults(R(true, 100, 40), R(false, 100, 10)) > 0, 'a victory at 100 beats a defeat at the same 100');
  assert.ok(compareResults(R(false, 100, 30), R(false, 99, 10)) > 0);
  assert.ok(compareResults(R(false, 70, 20), R(false, 70, 25)) > 0);
  assert.ok(compareResults(R(false, 70, 25), R(false, 70, 20)) < 0);
  assert.equal(compareResults(R(false, 70, 25), R(false, 70, 25, { job: 'JB01', route: 'F' })), 0);
  // the job and companions do not influence the order
  assert.equal(compareResults(R(true, 100, 20, { job: 'JB03', companions: ['CP01'] }), R(true, 100, 20)), 0);
});

test('ranking: ties share a rank and the next rank skips by the number tied (1,2,2,4)', () => {
  const list = [R(false, 50, 10), R(true, 100, 30), R(false, 80, 22), R(false, 80, 22, { runId: 'twin' }), R(false, 80, 30)];
  const ranked = rankResults(list);
  assert.deepEqual(ranked.map((x) => x.rank), [1, 2, 2, 4, 5]);
  assert.equal(ranked[0].result.defeated, true);
  assert.equal(ranked[3].result.rolls, 30);
});

test('personal bests only change for strictly better results; a finished run is recorded once', () => {
  const base = exampleRun(content, 'M');
  const mk = (id, over) => ({ ...base, runId: id, result: { ...R(false, 60, 15), runId: id, ...over }, discovered: { enemies: ['EN01'], companions: [], gear: ['SW01'] } });
  let m = applyRunToMeta(createMeta(), mk('a', {}));
  assert.equal(m.recorded, true);
  assert.equal(m.newBest, true);
  assert.equal(m.meta.bests.all.furthest, 60);
  // worse (fewer squares): the best stays
  const worse = applyRunToMeta(m.meta, mk('b', { furthest: 40 }));
  assert.equal(worse.newBest, false);
  assert.equal(worse.meta.bests.all.furthest, 60);
  // equal rank: not a new best (same rank is not an improvement)
  const equal = applyRunToMeta(m.meta, mk('c', {}));
  assert.equal(equal.newBest, false);
  // better: replaced
  const better = applyRunToMeta(m.meta, mk('d', { defeated: true, furthest: 100, rolls: 30 }));
  assert.equal(better.newBest, true);
  assert.equal(better.meta.bests.all.defeated, true);
  // the same run twice: recorded once
  const twice = applyRunToMeta(better.meta, mk('d', { defeated: true, furthest: 100, rolls: 30 }));
  assert.equal(twice.recorded, false);
  assert.deepEqual(twice.meta, better.meta);
});

test('dex keeps enemies, companions and gear that were met, and merges new runs without losing old entries', () => {
  const base = exampleRun(content, 'M');
  const a = { ...base, runId: 'a', result: null, discovered: { enemies: ['EN01', 'EN02'], companions: ['CP01'], gear: ['SW01', 'AR01', 'SW09'] } };
  const m1 = applyRunToMeta(createMeta(), a);
  assert.deepEqual(m1.discoveries.enemies, ['EN01', 'EN02']);
  assert.equal(m1.recorded, false); // no result yet
  const b = { ...base, runId: 'b', result: null, discovered: { enemies: ['EN02', 'EN03'], companions: [], gear: ['SW01'] } };
  const m2 = applyRunToMeta(m1.meta, b);
  assert.deepEqual(m2.discoveries.enemies, ['EN03']);
  assert.deepEqual(m2.meta.dex.enemies, ['EN01', 'EN02', 'EN03']);
  assert.deepEqual(m2.meta.dex.gear, ['SW01', 'AR01', 'SW09']); // selling SW09 never removes it
});
