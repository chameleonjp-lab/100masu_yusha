// Test helpers (not a test file). Tests drive the engine directly; there is no debug entry in the UI.

import { loadContentFromDisk } from '../../src/content/node.js';
import { boardFromExample, createRun, dispatch, view } from '../../src/engine/index.js';

let cached = null;
let fixtureRunSequence = 0;
export async function getContent() {
  if (!cached) cached = await loadContentFromDisk();
  return cached;
}

export function newRun(content, route = 'M', seed = 1, extra = {}) {
  return createRun(content, { route, seed, runId: `fixture-${++fixtureRunSequence}`, ...extra });
}

export function exampleRun(content, route = 'M', seed = 1) {
  const ex = content.base.exampleBoards.find((b) => b.route === route);
  return createRun(content, { route, seed, runId: `fixture-${++fixtureRunSequence}`, board: boardFromExample(content, ex) });
}

export const cl = (o) => JSON.parse(JSON.stringify(o));

/** Put a run at `pos` in phase board with every inn before it marked visited (and the one at pos, if any). */
export function place(s, pos, patch = {}) {
  const t = cl(s);
  t.pos = pos;
  t.furthest = Math.max(t.furthest, pos);
  t.phase = 'board';
  t.event = null;
  t.prompt = null;
  t.roll = null;
  t.turn = { die: null, rawDie: null, adjustUsed: false, preRoll: null };
  for (const p of t.board.innPositions) if (p <= pos) t.inns[p].visited = true;
  return Object.assign(t, patch);
}

/** Replace the content id of a board square (fixture surgery for scripted events that are not on the example boards). */
export function withSquare(s, pos, contentId, treasure) {
  const t = cl(s);
  const keep = t.board.squares[pos - 1].treasure; // an existing chest overlay stays unless replaced
  t.board.squares[pos - 1] = { position: pos, contentId };
  if (treasure || keep) t.board.squares[pos - 1].treasure = treasure || keep;
  return t;
}

export function act(content, s, action, opts) {
  return dispatch(content, s, action, opts);
}

/** Force the next die and return the state in phase rolled. */
export function rollDie(content, s, die, opId) {
  return dispatch(content, s, { type: 'roll', ...(opId ? { opId } : {}) }, { rolls: [(die - 0.5) / 6] });
}

/** roll + move with the given die; returns the final state and all effects. */
export function walk(content, s, die) {
  const a = rollDie(content, s, die);
  const b = dispatch(content, a.state, { type: 'move' });
  return { state: b.state, effects: [...a.effects, ...b.effects] };
}

export function actionsOf(content, s, type) {
  return view(content, s).actions.filter((a) => a.type === type);
}

export function fxOf(effects, t) {
  return effects.filter((e) => e.t === t);
}

/**
 * Land on `contentId` at square `pos` by rolling exactly `die` from pos-die (fixture surgery on the board).
 * No unvisited inn may lie between; pick positions accordingly.
 */
export function landOnEvent(content, s, contentId, { pos = 10, die = 1, patch = {} } = {}) {
  let t = withSquare(s, pos, contentId);
  t = place(t, pos - die, patch);
  for (const p of t.board.innPositions) if (p < pos) t.inns[p].visited = true; // never stop early at an inn on the way
  return walk(content, t, die);
}

/** A content variant with extra/overridden scripts (fixtures for rules the real data does not exercise yet). */
export function withScripts(content, { events = {}, items = {}, equipment = {} } = {}) {
  return {
    ...content,
    scripts: {
      events: { ...content.scripts.events, ...events },
      items: { ...content.scripts.items, ...items },
      equipment: { ...content.scripts.equipment, ...equipment },
    },
  };
}

/**
 * Start a battle against `enemyId` by landing on a scripted fixture event. Returns { content, state, effects }.
 * die: the landing die (1-3 softens the first hit taken, 4-6 boosts the first direct hit).
 */
export function startBattle(content, base, enemyId, { die = 2, patch = {}, rules, optional, pos = 10 } = {}) {
  const op = { op: 'battle', enemy: enemyId };
  if (rules) op.rules = rules;
  if (optional) op.optional = true;
  const c2 = withScripts(content, { events: { 'M1-22': { onLand: [op] } } });
  const r = landOnEvent(c2, base, 'M1-22', { pos, die, patch });
  return { content: c2, state: r.state, effects: r.effects };
}
