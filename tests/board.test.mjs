import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBoard, boardFromExample, createRun, dispatch, minRollsForBoard, view } from '../src/engine/index.js';
import { exampleRun, getContent, place, rollDie, walk } from './fixtures/helpers.mjs';

const content = await getContent();

test('content builds with no problems and exposes the five patched encounters', () => {
  assert.deepEqual(content.problems.filter((p) => p.level === 'error'), []);
  assert.equal(Object.keys(content.events).length, 1000);
  assert.deepEqual(content.patchedEventIds.sort(), ['B4-27', 'F3-27', 'H2-11', 'M1-24', 'M5-25']);
  assert.equal(content.events['M1-24'].name, 'ほどける草の荷札');
  assert.deepEqual(content.events['M1-24'].refs, ['EN09']);
  assert.ok(content.bands[0].enemyIds.includes('EN09'));
  assert.ok(content.bands[4].enemyIds.includes('EN13'));
  // the original enemies are still reachable on another candidate of the same route/band
  const still = Object.values(content.events).filter((e) => e.route === 'M' && e.band === 1 && e.refs.includes('EN01'));
  assert.ok(still.length >= 1);
});

test('the four example boards pass the structural audit', () => {
  for (const ex of content.base.exampleBoards) {
    const board = boardFromExample(content, ex);
    assert.deepEqual(checkBoard(content, ex.route, board), [], ex.sampleId);
    assert.equal(minRollsForBoard(board).total, ex.route === 'M' ? 18 : 19, `${ex.sampleId} minimum rolls`);
  }
});

test('generated boards: counts per kind, 19/20/20/20/19, 5 inns in the 2nd-7th pool position, 5 chests, no duplicates', () => {
  for (const route of content.routeIds) {
    for (let seed = 1; seed <= 60; seed++) {
      const s = createRun(content, { route, seed });
      const problems = checkBoard(content, route, s.board);
      assert.deepEqual(problems, [], `${route} seed ${seed}`);
      const ids = s.board.squares.map((q) => q.contentId);
      assert.equal(new Set(ids).size, 100);
      assert.equal(s.board.squares[0].contentId, 'START');
      assert.equal(s.board.squares[99].contentId, 'CASTLE');
      const perBand = content.bands.map((b) => {
        let n = 0;
        for (let p = b.randomRange[0]; p <= b.randomRange[1]; p++) n++;
        return n;
      });
      assert.deepEqual(perBand, [19, 20, 20, 20, 19]);
      assert.equal(s.board.innPositions.length, 5);
      content.bands.forEach((b, i) => {
        const lo = b.randomRange[0];
        assert.ok(s.board.innPositions[i] >= lo + 1 && s.board.innPositions[i] <= lo + 6, `inn ${i + 1} at ${s.board.innPositions[i]}`);
      });
    }
  }
});

test('generation is deterministic in the seed and different across seeds', () => {
  const a = createRun(content, { route: 'F', seed: 7 });
  const b = createRun(content, { route: 'F', seed: 7 });
  const c = createRun(content, { route: 'F', seed: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.board, c.board);
});

test('chest candidates: 3 distinct from the band pool, fallbacks are consumables that do not overlap', () => {
  const s = createRun(content, { route: 'B', seed: 3 });
  for (const sq of s.board.squares.filter((q) => q.treasure)) {
    const t = sq.treasure;
    assert.equal(new Set(t.candidateIds).size, 3);
    assert.equal(t.fallbackItemIds.length, 3);
    for (const f of t.fallbackItemIds) assert.ok(content.items[f], 'fallbacks are consumables');
  }
});

test('shops are fixed at run start: HE01 20G + BD01 30G + 2 regional; bands 2-4 carry SP02/03/04, band 5 SW50 for 3000G', () => {
  const s = createRun(content, { route: 'M', seed: 11 });
  s.board.innPositions.forEach((p, i) => {
    const slots = s.inns[p].shop.slots;
    assert.equal(slots.length, 4);
    assert.deepEqual(slots.slice(0, 2).map((x) => [x.id, x.price]), [['HE01', 20], ['BD01', 30]]);
    const reg = slots.slice(2).map((x) => x.id);
    if (i === 1) assert.ok(reg.includes('SP02'));
    if (i === 2) assert.ok(reg.includes('SP03'));
    if (i === 3) assert.ok(reg.includes('SP04'));
    if (i === 4) assert.ok(reg.includes('SW50'));
    for (const sl of slots) if (sl.id !== 'SW50') assert.ok(sl.price < 3000);
    if (i === 4) assert.equal(slots.find((x) => x.id === 'SW50').price, 3000);
  });
  // the same seed yields the same shelves; nothing is redrawn later
  assert.deepEqual(createRun(content, { route: 'M', seed: 11 }).inns, s.inns);
});

test('EX01-M: from 6, a roll of 5 stops at the inn on 8, 2 steps of xp, the remaining 3 are discarded', () => {
  let s = place(exampleRun(content, 'M'), 6);
  const r = rollDie(content, s, 5);
  assert.equal(r.state.phase, 'rolled');
  assert.equal(r.state.roll.raw, 5);
  const v = view(content, r.state);
  assert.equal(v.rolled.preview.to, 8);
  assert.equal(v.rolled.preview.steps, 2);
  assert.equal(v.rolled.preview.discarded, 3);
  const m = dispatch(content, r.state, { type: 'move' });
  s = m.state;
  assert.equal(s.pos, 8);
  assert.equal(s.phase, 'inn');
  assert.equal(s.xp, 2);
  const moved = m.effects.find((e) => e.t === 'moved');
  assert.deepEqual([moved.from, moved.to, moved.steps, moved.discarded, moved.stop], [6, 8, 2, 3, 'inn']);
  assert.equal(s.inns[8].visited, true);
  assert.equal(s.rolls, 1);
});

test('EX01-M: from 41 a 3 reaches 44, +1 (BD01) reaches 45; cancelling the preview is free', () => {
  let s = place(exampleRun(content, 'M'), 41, { bag: ['BD01', 'HE01'] });
  const a = rollDie(content, s, 3);
  const v = view(content, a.state);
  assert.equal(v.rolled.preview.to, 44);
  const plus = v.rolled.adjustOptions.find((o) => o.itemId === 'BD01' && o.params.delta === 1);
  assert.equal(plus.enabled, true);
  assert.equal(plus.preview.to, 45);
  // preview and cancel changed nothing
  assert.deepEqual(a.state.bag, ['BD01', 'HE01']);
  const m = dispatch(content, a.state, { type: 'move', adjust: { itemId: 'BD01', params: { delta: 1 } } });
  assert.equal(m.state.pos, 45);
  assert.deepEqual(m.state.bag, ['HE01']);
  assert.equal(m.state.rolls, 1);
  // without the compass the move goes to 44 and the item is kept
  const m2 = dispatch(content, a.state, { type: 'move' });
  assert.equal(m2.state.pos, 44);
  assert.deepEqual(m2.state.bag, ['BD01', 'HE01']);
});

test('compass limits: 1 cannot go down, 6 cannot go up; only one die-adjust item per turn', () => {
  let s = place(exampleRun(content, 'M'), 41, { bag: ['BD01', 'BD01', 'BD11'] });
  let a = rollDie(content, s, 1);
  let v = view(content, a.state);
  assert.equal(v.rolled.adjustOptions.find((o) => o.itemId === 'BD01' && o.params.delta === -1).enabled, false);
  assert.equal(v.rolled.adjustOptions.find((o) => o.itemId === 'BD01' && o.params.delta === 1).enabled, true);
  a = rollDie(content, s, 6);
  v = view(content, a.state);
  assert.equal(v.rolled.adjustOptions.find((o) => o.itemId === 'BD01' && o.params.delta === 1).enabled, false);
  // use the compass for real, then a second adjust in the same turn is refused
  const used = dispatch(content, a.state, { type: 'useItem', itemId: 'BD01', params: { delta: -1 } });
  assert.equal(used.state.roll.die, 5);
  assert.throws(() => dispatch(content, used.state, { type: 'useItem', itemId: 'BD11' }), /one_adjust_per_turn/);
});

test('98 + 5 reaches 100 (the surplus is dropped) but that is not a victory', () => {
  let s = place(exampleRun(content, 'M'), 98);
  const r = walk(content, s, 5);
  assert.equal(r.state.pos, 100);
  assert.equal(r.state.phase, 'gate');
  assert.equal(r.state.victory, null);
  assert.equal(r.state.result, null);
  const moved = r.effects.find((e) => e.t === 'moved');
  assert.equal(moved.steps, 2);
  assert.equal(moved.discarded, 3);
  assert.equal(moved.stop, 'castle');
});

test('an unvisited inn is never jumped; a visited inn is passed; band borders do not stop', () => {
  let s = place(exampleRun(content, 'M'), 24); // inn 25 ahead, unvisited
  let r = walk(content, s, 6);
  assert.equal(r.state.pos, 25);
  assert.equal(r.state.phase, 'inn');
  // leave and roll again: the same inn does not stop us twice
  let t = dispatch(content, r.state, { type: 'leaveInn' }).state;
  assert.equal(t.phase, 'board');
  r = walk(content, t, 6);
  assert.equal(r.state.pos, 31);
  // crossing 40 -> 41 is not a stop
  s = place(exampleRun(content, 'M'), 38);
  assert.equal(walk(content, s, 6).state.pos, 44);
});

test('xp: 1 per newly reached square; rolls counter counts only rolls', () => {
  let s = place(exampleRun(content, 'M'), 10);
  const r = walk(content, s, 4);
  assert.equal(r.state.xp, 4);
  assert.equal(r.state.rolls, 1);
  assert.equal(r.state.furthest, 14);
});

test('theoretical minimum rolls depend on the board (legs of ceil(d/6)), not a fixed 20', () => {
  const m = minRollsForBoard(boardFromExample(content, content.base.exampleBoards[0]));
  assert.deepEqual(m.legs.map((l) => l.rolls), [2, 3, 4, 3, 3, 3]);
  assert.equal(m.total, 18);
});

test('stale phase: roll is only legal on the board phase', () => {
  const s = exampleRun(content, 'M');
  const r = rollDie(content, s, 2);
  assert.throws(() => dispatch(content, r.state, { type: 'roll' }), /illegal_action/);
});
