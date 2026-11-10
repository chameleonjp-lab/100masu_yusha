// Test helpers (not a test file). Tests drive the engine directly; there is no debug entry in the UI.

import { loadContentFromDisk } from '../../src/content/node.js';
import { boardFromExample, createRun, dispatch, view } from '../../src/engine/index.js';

let cached = null;
export async function getContent() {
  if (!cached) cached = await loadContentFromDisk();
  return cached;
}

export function newRun(content, route = 'M', seed = 1, extra = {}) {
  return createRun(content, { route, seed, ...extra });
}

export function exampleRun(content, route = 'M', seed = 1) {
  const ex = content.base.exampleBoards.find((b) => b.route === route);
  return createRun(content, { route, seed, board: boardFromExample(content, ex) });
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
