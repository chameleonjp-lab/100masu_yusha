// Run creation. A run is one JSON-serialisable object (see docs/dev/engine-api.md for the shape).

import { fail } from './util.js';
import { newRng } from './rng.js';
import { makeCtx } from './core.js';
import { boardFromExample, checkBoard, generateBoard } from './board.js';
import { newInnState } from './inn.js';

export const SCHEMA_VERSION = 1;
export const RULES_VERSION = 'rules-1';

/**
 * createRun(content, { route, seed, runId, board? })
 *   board: optional pre-made board (e.g. boardFromExample) for fixtures/tests.
 * Returns the initial state (phase 'board', pos 1).
 */
export function createRun(content, opts = {}) {
  const route = opts.route;
  if (!content.routes[route]) fail('bad_route', String(route));
  const seed = opts.seed === undefined ? 1 : opts.seed >>> 0;
  const s = {
    schema: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    contentVersion: content.version,
    runId: opts.runId || `r-${seed.toString(16)}`,
    route,
    seed,
    revision: 0,
    ops: [],
    phase: 'board',
    rng: newRng(seed),
    board: null,
    pos: 1,
    furthest: 1,
    rolls: 0,
    xp: 0,
    level: 1,
    gold: content.base.economy.startingGold,
    hp: content.levelTable[0].maxHp,
    mp: content.levelTable[0].maxMp,
    job: 'JB00',
    spells: { learned: [], prepared: [] },
    gear: [
      { iid: 'g1', id: 'SW01', paidGold: null, from: 'start' },
      { iid: 'g2', id: 'AR01', paidGold: null, from: 'start' },
    ],
    nextGearIid: 3,
    equipped: { sword: 'g1', armor: 'g2' },
    bag: ['HE01', 'BD01'],
    companions: [],
    turn: { die: null, rawDie: null, adjustUsed: false, preRoll: null },
    roll: null,
    lastDie: null,
    done: {},
    awards: {},
    inns: {},
    chests: {},
    reservations: [],
    nextRid: 1,
    reveals: [],
    flags: {},
    event: null,
    chest: null,
    prompt: null,
    offer: null,
    battle: null,
    nextBattleId: 1,
    reward: null,
    retry: { used: false, stage: null, snapshot: null },
    victory: null,
    result: null,
    discovered: { enemies: [], companions: [], gear: ['SW01', 'AR01'] },
    unscripted: [],
  };
  const ctx = makeCtx(content, s, { rolls: opts.rolls });
  s.board = opts.board ? opts.board : generateBoard(content, route, s.rng, ctx.forced);
  if (opts.board) {
    const probs = checkBoard(content, route, s.board);
    if (probs.length) fail('bad_board', probs.slice(0, 5).join('; '));
  }
  content.bands.forEach((b, i) => {
    const innPos = s.board.innPositions[i];
    s.inns[innPos] = newInnState(ctx, b.id);
  });
  for (const sq of s.board.squares) if (sq.treasure) s.chests[sq.position] = { opened: false, shown: null, taken: null };
  return s;
}

export { boardFromExample };
