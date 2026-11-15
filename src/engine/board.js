// Board generation (R03/R04/R06/R10), movement stops and theoretical minimum rolls.

import { drawInt, shuffle } from './rng.js';
import { clone, fail } from './util.js';

export const KIND_ORDER = ['金貨', '装備', '戦闘', '道具', '回復', '宿場', '選択', '罠'];
export const CHEST_KINDS = ['装備', '道具'];
export const FIXED_FIRST = 1;
export const FIXED_LAST = 100;

export function bandOfPos(content, pos) {
  for (const b of content.bands) if (pos >= b.range[0] && pos <= b.range[1]) return b;
  return content.bands[content.bands.length - 1];
}

/** Candidate pool for the chest of band `bandId`: that band's swords, armor, 3 item categories (+ SP0n for bands 2-4). */
export function chestPool(content, bandId) {
  const pool = [];
  for (const cat of ['剣', '防具']) pool.push(...(content.gearPool[bandId] && content.gearPool[bandId][cat] ? content.gearPool[bandId][cat] : []));
  for (const cat of ['戦闘用', '回復用', 'すごろく用']) pool.push(...(content.itemPool[bandId] && content.itemPool[bandId][cat] ? content.itemPool[bandId][cat] : []));
  const sp = `SP0${bandId}`;
  if (bandId >= 2 && bandId <= 4 && content.spells[sp]) pool.push(sp);
  return pool;
}

export function consumablePool(content, bandId) {
  const pool = [];
  for (const cat of ['戦闘用', '回復用', 'すごろく用']) pool.push(...(content.itemPool[bandId] && content.itemPool[bandId][cat] ? content.itemPool[bandId][cat] : []));
  return pool;
}

/**
 * Generate the 100 squares for `route`. Deterministic in (rng state, content).
 * Returns { squares:[{position,contentId,treasure?}], innPositions:[5 numbers] }.
 */
export function generateBoard(content, route, rng, forced) {
  const r = content.routes[route];
  if (!r) fail('bad_route', String(route));
  const squares = new Array(100);
  squares[0] = { position: 1, contentId: 'START' };
  squares[99] = { position: 100, contentId: 'CASTLE' };
  const innPositions = [];

  for (const band of content.bands) {
    const [lo, hi] = band.randomRange;
    const positions = [];
    for (let p = lo; p <= hi; p++) positions.push(p);
    const slots = { ...r.slotsInTwenty };
    if (positions.length === 19) slots['罠'] -= 1; // short band: one fewer 罠 than the 20-square allocation
    const group = content.eventsByRB[`${route}:${band.id}`];

    const chosen = {};
    for (const kind of KIND_ORDER) {
      const pool = [...(group[kind] || [])];
      shuffle(rng, pool, forced);
      if (pool.length < slots[kind]) fail('board_pool_short', `${route}:${band.id}:${kind}`);
      chosen[kind] = pool.slice(0, slots[kind]);
    }
    const innEvent = chosen['宿場'][0];
    // inn sits at the 2nd..7th position of the drawing pool
    const innPos = positions[1 + drawInt(rng, 6, forced)];
    innPositions.push(innPos);
    squares[innPos - 1] = { position: innPos, contentId: innEvent };

    const rest = [];
    for (const kind of KIND_ORDER) if (kind !== '宿場') rest.push(...chosen[kind]);
    shuffle(rng, rest, forced);
    const free = positions.filter((p) => p !== innPos);
    if (free.length !== rest.length) fail('board_count', `band ${band.id}: ${free.length} free vs ${rest.length} events`);
    free.forEach((p, i) => {
      squares[p - 1] = { position: p, contentId: rest[i] };
    });

    // chest overlay on one 装備/道具 square
    const eligible = free.filter((p) => CHEST_KINDS.includes(content.events[squares[p - 1].contentId].kind));
    if (!eligible.length) fail('board_no_chest_site', `band ${band.id}`);
    const chestPos = eligible[drawInt(rng, eligible.length, forced)];
    const pool = chestPool(content, band.id);
    shuffle(rng, pool, forced);
    const candidateIds = pool.slice(0, 3);
    const fbPool = consumablePool(content, band.id).filter((id) => !candidateIds.includes(id));
    shuffle(rng, fbPool, forced);
    squares[chestPos - 1].treasure = { candidateIds, fallbackItemIds: fbPool.slice(0, 3) };
  }
  return { squares, innPositions };
}

export function boardFromExample(content, ex) {
  const squares = ex.squares.map((q) => clone(q));
  return { squares, innPositions: [...ex.innPositions], sampleId: ex.sampleId };
}

/** Structural audit used by tests/validator. Returns an array of problem strings. */
export function checkBoard(content, route, board) {
  const out = [];
  const r = content.routes[route];
  const { squares, innPositions } = board;
  if (squares.length !== 100) out.push(`squares.length ${squares.length}`);
  if (squares[0].contentId !== 'START') out.push('position 1 must be START');
  if (squares[99].contentId !== 'CASTLE') out.push('position 100 must be CASTLE');
  const seen = new Set();
  let chests = 0;
  for (const band of content.bands) {
    const [lo, hi] = band.randomRange;
    const counts = {};
    let chestsHere = 0;
    let innsHere = 0;
    for (let p = lo; p <= hi; p++) {
      const sq = squares[p - 1];
      if (sq.position !== p) out.push(`square index/position mismatch at ${p}`);
      const ev = content.events[sq.contentId];
      if (!ev) {
        out.push(`unknown content ${sq.contentId} at ${p}`);
        continue;
      }
      if (ev.route !== route || ev.band !== band.id) out.push(`${sq.contentId} at ${p} not from route ${route} band ${band.id}`);
      if (seen.has(sq.contentId)) out.push(`duplicate ${sq.contentId}`);
      seen.add(sq.contentId);
      counts[ev.kind] = (counts[ev.kind] || 0) + 1;
      if (sq.treasure) {
        chests++;
        chestsHere++;
        if (!CHEST_KINDS.includes(ev.kind)) out.push(`chest on ${ev.kind} square ${p}`);
        const t = sq.treasure;
        if (t.candidateIds.length !== 3 || new Set(t.candidateIds).size !== 3) out.push(`chest at ${p}: need 3 distinct candidates`);
        if (t.fallbackItemIds.length < 3) out.push(`chest at ${p}: need 3 fallbacks`);
        if (t.fallbackItemIds.some((id) => t.candidateIds.includes(id))) out.push(`chest at ${p}: fallback overlaps candidate`);
      }
      if (ev.kind === '宿場') innsHere++;
    }
    const n = hi - lo + 1;
    const want = { ...r.slotsInTwenty };
    if (n === 19) want['罠'] -= 1;
    for (const k of KIND_ORDER) if ((counts[k] || 0) !== want[k]) out.push(`band ${band.id}: ${k} ${(counts[k] || 0)} != ${want[k]}`);
    if (chestsHere !== 1) out.push(`band ${band.id}: ${chestsHere} chests`);
    if (innsHere !== 1) out.push(`band ${band.id}: ${innsHere} inns`);
    const ip = innPositions[band.id - 1];
    if (!(ip >= lo + 1 && ip <= lo + 6)) out.push(`band ${band.id}: inn ${ip} outside 2nd-7th pool position`);
    const at = squares[ip - 1] && content.events[squares[ip - 1].contentId];
    if (!at || at.kind !== '宿場') out.push(`band ${band.id}: innPositions ${ip} is not a 宿場 square`);
  }
  if (chests !== 5) out.push(`chests total ${chests}`);
  return out;
}

// ---- movement ------------------------------------------------------------------

/** First unvisited inn strictly ahead of pos, else 100. */
export function nextStopPos(s, fromPos = s.pos) {
  for (const p of s.board.innPositions) {
    if (p > fromPos && !(s.inns[p] && s.inns[p].visited)) return Math.min(p, FIXED_LAST);
  }
  return FIXED_LAST;
}

export function moveTarget(s, die, fromPos = s.pos) {
  return Math.min(fromPos + die, nextStopPos(s, fromPos));
}

export function forcedStopFor(s, die, fromPos = s.pos) {
  return fromPos + die >= nextStopPos(s, fromPos);
}

/**
 * Per-inn distance minimum: 1 -> inn1 -> ... -> inn5 -> 100, each leg ceil(d/6).
 * (No fixed 20: the minimum depends on the board.)
 */
export function minRollsForBoard(board) {
  const stops = [...board.innPositions].sort((a, b) => a - b);
  stops.push(FIXED_LAST);
  let prev = FIXED_FIRST;
  let total = 0;
  const legs = [];
  for (const p of stops) {
    const d = p - prev;
    const n = Math.ceil(d / 6);
    legs.push({ from: prev, to: p, distance: d, rolls: n });
    total += n;
    prev = p;
  }
  return { total, legs };
}

export function kindAt(content, board, pos) {
  if (pos === FIXED_FIRST) return 'START';
  if (pos === FIXED_LAST) return 'CASTLE';
  const sq = board.squares[pos - 1];
  return content.events[sq.contentId].kind;
}

/** Probability-ish helper for BD43: of the 36 (a,b) pairs, how many land on `target` after one or two rolls. */
export function landingWays(s, target) {
  let ways = 0;
  for (let a = 1; a <= 6; a++) {
    const p1 = moveTarget(s, a);
    for (let b = 1; b <= 6; b++) {
      if (p1 === target) {
        ways++;
        continue;
      }
      if (p1 >= FIXED_LAST) continue;
      // second leg: an inn we just stopped on counts as visited
      const visitedExtra = s.board.innPositions.includes(p1);
      let nxt = FIXED_LAST;
      for (const ip of s.board.innPositions) {
        if (ip > p1 && !(s.inns[ip] && s.inns[ip].visited)) {
          nxt = Math.min(ip, FIXED_LAST);
          break;
        }
      }
      void visitedExtra;
      const p2 = Math.min(p1 + b, nxt);
      if (p2 === target) ways++;
    }
  }
  return ways;
}
