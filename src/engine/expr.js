// Expression / condition evaluator for the typed script format. Pure.
//
// env = { ctx, vars?, hook?, move? }
//   ctx.s / ctx.content   run state + content
//   vars                  scope variables (inputs, loop vars) -> {"ref":"var.n"}
//   hook                  battle hook context: { attackKind, damage, dealt, spellCost, ... }
//   move                  move context for moveConfirm: { die, steps, discarded, stop, from, to, adjustItem, adjustDelta }

import { deepEqual, fail } from './util.js';
import { bagFree, itemCount, maxHpOf, maxMpOf, ownsGear, knowsSpell } from './core.js';
import { forcedStopFor, moveTarget, nextStopPos, bandOfPos } from './board.js';

export function currentDie(s) {
  if (s.roll && s.roll.die != null) return s.roll.die;
  return s.turn && s.turn.die != null ? s.turn.die : null;
}

function roundRec(b, node) {
  if (!b) return undefined;
  let idx;
  if (node.abs !== undefined) idx = node.abs;
  else idx = b.round + (node.offset || 0);
  if (idx < 1) return undefined;
  return b.rounds[idx - 1];
}

function actionType(rec) {
  return rec && rec.action ? rec.action.type : null;
}

function countOf(b, what) {
  if (!b) return 0;
  let n = 0;
  for (const r of b.rounds) {
    const a = r.action && r.action.type;
    if (what === 'attackHits' && a === 'attack' && r.landed) n++;
    else if (what === 'attacks' && a === 'attack') n++;
    else if (what === 'guards' && a === 'guard') n++;
    else if (what === 'spells' && a === 'spell') n++;
    else if (what === 'items' && a === 'item') n++;
    else if (what === 'attackSpells' && a === 'spell' && r.action.spellKind === 'attack') n++;
    else if (what === 'healSpells' && a === 'spell' && r.action.spellKind === 'heal') n++;
    else if (what === 'enemyActions' && r.enemyActed) n++;
    else if (what === 'hitsTaken' && r.hpLost > 0) n++;
  }
  return n;
}

function resolveRef(env, node) {
  const name = node.ref;
  const { ctx } = env;
  const s = ctx.s;
  const content = ctx.content;
  const b = s.battle;
  const hook = env.hook || {};
  if (name.startsWith('var.')) {
    const v = env.vars ? env.vars[name.slice(4)] : undefined;
    if (v === undefined) fail('script_var_missing', name);
    return v;
  }
  switch (name) {
    case 'gold': return s.gold;
    case 'hp': return s.hp;
    case 'mp': return s.mp;
    case 'maxHp': return maxHpOf(content, s);
    case 'maxMp': return maxMpOf(content, s);
    case 'level': return s.level;
    case 'xp': return s.xp;
    case 'pos': return s.pos;
    case 'band': return bandOfPos(content, s.pos).id;
    case 'rolls': return s.rolls;
    case 'job': return s.job;
    case 'bagCount': return s.bag.length;
    case 'bagFree': return bagFree(s);
    case 'companionCount': return s.companions.length;
    case 'itemCount': return itemCount(s, node.id);
    case 'hasGear': return ownsGear(s, node.id);
    case 'hasSpell': return knowsSpell(s, node.id);
    case 'die': return currentDie(s);
    case 'rawDie': return s.roll ? s.roll.raw : s.turn.rawDie;
    case 'prevDie': return s.lastDie === undefined ? null : s.lastDie;
    case 'flag': return s.flags[node.key] === undefined ? false : s.flags[node.key];
    case 'nextStop': return nextStopPos(s);
    case 'stopPos': return moveTarget(s, evalExpr(env, node.die));
    case 'forcedStop': return forcedStopFor(s, evalExpr(env, node.die));
    case 'move.die': case 'move.steps': case 'move.discarded': case 'move.stop': case 'move.from': case 'move.to':
    case 'move.adjustItem': case 'move.adjustDelta': {
      if (!env.move) fail('script_ref_context', `${name} outside a move`);
      const v = env.move[name.slice(5)];
      return v === undefined ? null : v;
    }
    case 'battle.round': return b ? b.round : 0;
    case 'battle.isKing': return !!b && b.kind === 'king';
    case 'battle.isOptional': return !!b && b.kind === 'optional';
    case 'battle.enemyId': return b ? b.enemy.id : null;
    case 'battle.enemyHp': return b ? b.enemy.hp : 0;
    case 'battle.enemyMaxHp': return b ? b.enemy.maxHp : 0;
    case 'battle.startHp': return b ? b.startHp : 0;
    case 'battle.startMp': return b ? b.startMp : 0;
    case 'battle.heroAction': return actionType(roundRec(b, node));
    case 'battle.hpLost': { const r = roundRec(b, node); return r ? r.hpLost : 0; }
    case 'battle.attackHit': { const r = roundRec(b, node); return !!(r && r.landed); }
    case 'battle.guarded': { const r = roundRec(b, node); return !!(r && r.guarded); }
    case 'battle.enemyKind': { const r = roundRec(b, node); return r && r.enemyAction ? r.enemyAction.kind : null; }
    case 'battle.enemyHealed': { const r = roundRec(b, node); return r ? r.enemyHealed || 0 : 0; }
    case 'battle.damage': return hook.damage === undefined ? 0 : hook.damage;
    case 'battle.dealt': return hook.dealt === undefined ? 0 : hook.dealt;
    case 'battle.attackKind': return hook.attackKind === undefined ? null : hook.attackKind;
    case 'battle.spellCost': return hook.spellCost === undefined ? 0 : hook.spellCost;
    case 'battle.spellMpAfter': return hook.spellMpAfter === undefined ? 0 : hook.spellMpAfter;
    case 'battle.count': return countOf(b, node.what);
    default:
      fail('script_ref_unknown', name);
  }
  return undefined;
}

function num(env, e) {
  const v = evalExpr(env, e);
  if (typeof v !== 'number' || Number.isNaN(v)) fail('script_expr_type', `expected number, got ${JSON.stringify(v)}`);
  return v;
}

function actionsCond(env, spec) {
  const b = env.ctx.s.battle;
  if (!b) return false;
  let recs;
  if (spec.abs) recs = spec.abs.map((n) => roundRec(b, { abs: n }));
  else recs = (spec.rounds || []).map((o) => roundRec(b, { offset: o }));
  const acts = recs.map(actionType);
  if (acts.some((a) => a === null || a === undefined)) return false;
  if (spec.is) return acts.every((a) => a === spec.is || (Array.isArray(spec.is) && spec.is.includes(a)));
  if (spec.sequence) return deepEqual(acts, spec.sequence);
  if (spec.anyOrder) return deepEqual([...acts].sort(), [...spec.anyOrder].sort());
  if (spec.distinct) return new Set(acts).size === acts.length;
  if (spec.includes) return spec.includes.every((x) => acts.includes(x));
  return false;
}

export function evalExpr(env, e) {
  if (e === null || typeof e === 'number' || typeof e === 'string' || typeof e === 'boolean') return e;
  if (Array.isArray(e)) return e.map((x) => evalExpr(env, x));
  if (typeof e !== 'object') fail('script_expr', `bad node ${JSON.stringify(e)}`);
  if ('ref' in e) return resolveRef(env, e);
  const keys = Object.keys(e);
  if (keys.length !== 1) fail('script_expr', `node must have one key: ${JSON.stringify(e)}`);
  const k = keys[0];
  const a = e[k];
  switch (k) {
    case 'add': return a.reduce((t, x) => t + num(env, x), 0);
    case 'sub': return num(env, a[0]) - a.slice(1).reduce((t, x) => t + num(env, x), 0);
    case 'mul': return a.reduce((t, x) => t * num(env, x), 1);
    case 'floorDiv': return Math.floor(num(env, a[0]) / num(env, a[1]));
    case 'ceilDiv': return Math.ceil(num(env, a[0]) / num(env, a[1]));
    case 'min': return Math.min(...a.map((x) => num(env, x)));
    case 'max': return Math.max(...a.map((x) => num(env, x)));
    case 'neg': return -num(env, a);
    case 'sum': return evalExpr(env, a).reduce((t, x) => t + x, 0);
    case 'clamp': return Math.min(num(env, a[2]), Math.max(num(env, a[1]), num(env, a[0])));
    case 'if': return evalExpr(env, a[0]) ? evalExpr(env, a[1]) : evalExpr(env, a[2]);
    case 'eq': return deepEqual(evalExpr(env, a[0]), evalExpr(env, a[1]));
    case 'ne': return !deepEqual(evalExpr(env, a[0]), evalExpr(env, a[1]));
    case 'gt': return num(env, a[0]) > num(env, a[1]);
    case 'gte': return num(env, a[0]) >= num(env, a[1]);
    case 'lt': return num(env, a[0]) < num(env, a[1]);
    case 'lte': return num(env, a[0]) <= num(env, a[1]);
    case 'between': { const x = num(env, a[0]); return x >= num(env, a[1]) && x <= num(env, a[2]); }
    case 'in': { const x = evalExpr(env, a[0]); return evalExpr(env, a[1]).some((y) => deepEqual(x, y)); }
    case 'even': return num(env, a) % 2 === 0;
    case 'odd': return Math.abs(num(env, a)) % 2 === 1;
    case 'and': return a.every((x) => !!evalExpr(env, x));
    case 'or': return a.some((x) => !!evalExpr(env, x));
    case 'not': return !evalExpr(env, a);
    case 'actions': return actionsCond(env, a);
    default:
      fail('script_expr_unknown', k);
  }
  return undefined;
}

export const evalCond = (env, c) => (c === undefined || c === null ? true : !!evalExpr(env, c));
