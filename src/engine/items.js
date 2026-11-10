// Consumable use: legality (by dry run), consumption, the die-adjust / shop / reveal ops.
//
// A script `use` = { where:[...], inputs?, requires?, effects, label?, consume? }. Legality is decided by
// running the effects on a throw-away clone, so "no target -> not consumed" falls out of an EngineError.

import { EngineError, clone, fail } from './util.js';
import { bagRemoveOne, itemCount } from './core.js';
import { evalCond, evalExpr, currentDie } from './expr.js';
import { newScope, register, runEffects, envOf } from './runner.js';
import { REASON_TEXT } from './options.js';
import { forcedStopFor, landingWays, moveTarget } from './board.js';
import { makeCtx } from './core.js';

export function whereOf(s) {
  switch (s.phase) {
    case 'board': return 'board';
    case 'rolled': return 'afterRoll';
    case 'inn': return 'inn';
    case 'gate': return 'gate';
    case 'battle': return 'battle';
    case 'event':
      if (s.event && s.event.kind === '罠' && s.prompt && s.prompt.kind === 'choice' && s.prompt.top) return 'trap';
      return null;
    default: return null;
  }
}

function inputsError(use, params) {
  for (const spec of use.inputs || []) {
    const v = params ? params[spec.id] : undefined;
    if (v === undefined || v === null) {
      if (spec.optional) continue;
      return { reason: 'inputInvalid', detail: `missing ${spec.id}` };
    }
    if (spec.type === 'int' && !(Number.isInteger(v) && v >= spec.min && v <= spec.max)) return { reason: 'inputInvalid', detail: spec.id };
    if (spec.type === 'enum' && !spec.values.some((x) => JSON.stringify(x) === JSON.stringify(v))) return { reason: 'inputInvalid', detail: spec.id };
    if (spec.type === 'string' && typeof v !== 'string') return { reason: 'inputInvalid', detail: spec.id };
    if (spec.type === 'sequence') {
      const ok = Array.isArray(v) && v.length === spec.of.length && [...v].sort().join() === [...spec.of].sort().join();
      if (!ok) return { reason: 'inputInvalid', detail: spec.id };
    }
    if (spec.type === 'ints') {
      const ok = Array.isArray(v) && v.length >= spec.minCount && v.length <= spec.maxCount && v.every((x) => Number.isInteger(x) && x >= spec.min && x <= spec.max) && new Set(v).size === v.length;
      if (!ok) return { reason: 'inputInvalid', detail: spec.id };
    }
  }
  return null;
}

function pickUse(ctx, script, where, params) {
  const cands = (script.uses || []).filter((u) => u.where.includes(where));
  if (!cands.length) return { error: 'notNow' };
  const wanted = params && params.use;
  const list = wanted ? cands.filter((u) => u.id === wanted) : cands;
  if (!list.length) return { error: 'notNow' };
  let firstErr = null;
  for (const u of list) {
    const ierr = inputsError(u, params);
    if (ierr) {
      firstErr = firstErr || ierr.reason;
      continue;
    }
    const env = { ctx, vars: { ...(params || {}) } };
    const failing = (u.requires || []).find((r) => !evalCond(env, r.when));
    if (failing) {
      firstErr = firstErr || failing.reason || 'notNow';
      continue;
    }
    if (u.unique && ctx.s.battle && ctx.s.battle.marks.some((m) => m.unique === u.unique)) {
      firstErr = firstErr || 'alreadyActive';
      continue;
    }
    return { use: u };
  }
  return { error: firstErr || 'notNow' };
}

/**
 * Apply an item use on ctx.s (mutating). Throws EngineError when not legal.
 * Returns { use, status } where status is the runEffects status.
 */
export function applyItemUse(ctx, itemId, params, where) {
  const s = ctx.s;
  if (!ctx.content.items[itemId]) fail('unknown_item', itemId);
  const script = ctx.content.scripts.items[itemId];
  if (!script) fail('item_unscripted', itemId);
  if (itemCount(s, itemId) < 1) fail('no_such_item', itemId);
  if (where === null || where === undefined) fail('item_not_now', itemId);
  const picked = pickUse(ctx, script, where, params);
  if (picked.error) fail(`item_${picked.error}`, itemId, { reason: picked.error });
  const use = picked.use;
  bagRemoveOne(s, itemId); // consumed first; a thrown EngineError aborts the whole dispatch
  ctx.emit({ t: 'itemUsed', id: itemId, where });
  const scope = newScope({ kind: 'item', itemId }, { vars: { ...(params || {}) }, itemId, where });
  const status = runEffects(ctx, use.effects || [], scope);
  return { use, status };
}

/** Dry run: { enabled, reason?, reasonText? } for one item in the current situation. */
export function itemStatus(content, s, itemId, params) {
  const script = content.scripts.items[itemId];
  const out = { itemId, scripted: !!script, enabled: false };
  if (!script) {
    out.reason = 'unscripted';
    out.reasonText = REASON_TEXT.unscripted;
    return out;
  }
  const where = whereOf(s);
  const probe = clone(s);
  const ctx = makeCtx(content, probe, { rolls: [0.5, 0.5, 0.5, 0.5] });
  try {
    applyItemUse(ctx, itemId, params || {}, where);
    out.enabled = true;
  } catch (e) {
    if (!(e instanceof EngineError)) throw e;
    out.reason = (e.details && e.details.reason) || e.code.replace(/^item_/, '');
    out.reasonText = REASON_TEXT[out.reason] || e.code;
    out.code = e.code;
  }
  out.where = where;
  return out;
}

// ---- die ops -------------------------------------------------------------------------

register('adjustDie', (ctx, op, scope) => {
  const s = ctx.s;
  if (s.phase !== 'rolled' || !s.roll) fail('adjust_not_now');
  if (s.turn.adjustUsed) fail('one_adjust_per_turn');
  const env = envOf(ctx, scope);
  const die = s.roll.die;
  const to = evalExpr(env, op.to);
  if (!Number.isInteger(to) || to < 1 || to > 6) fail('adjust_out_of_range', String(to));
  for (const c of op.constraints || []) {
    if (c === 'mustDiffer' && to === die) fail('adjust_no_change');
    if (c === 'needPrev' && (s.lastDie === null || s.lastDie === undefined)) fail('adjust_no_prev');
    if (c === 'sameForcedStop') {
      if (!(forcedStopFor(s, die) && forcedStopFor(s, to) && moveTarget(s, die) === moveTarget(s, to))) fail('adjust_stop_differs');
    }
    if (c === 'evenOnly' && die % 2 !== 0) fail('adjust_needs_even');
  }
  s.roll.die = to;
  s.roll.adjust = { itemId: scope.itemId || null, delta: to - die };
  s.turn.adjustUsed = true;
  ctx.emit({ t: 'dieAdjusted', from: die, to, itemId: scope.itemId || null });
});

register('setDieRule', (ctx, op, scope) => {
  const s = ctx.s;
  if (s.phase !== 'board') fail('adjust_not_now');
  if (s.turn.adjustUsed || s.turn.preRoll) fail('one_adjust_per_turn');
  s.turn.preRoll = { itemId: scope.itemId || null, table: clone(op.table) };
  s.turn.adjustUsed = true;
  ctx.emit({ t: 'dieRuleSet', itemId: scope.itemId || null });
});

export function applyPreRollRule(s, raw) {
  const rule = s.turn.preRoll;
  if (!rule) return raw;
  const mapped = rule.table[String(raw)];
  return mapped === undefined ? raw : mapped;
}

// ---- info / shop ops --------------------------------------------------------------------

function nextUnvisitedInn(s) {
  for (const p of s.board.innPositions) if (p > s.pos && !(s.inns[p] && s.inns[p].visited)) return p;
  return null;
}

export function shopView(content, inn) {
  return inn.shop.slots.map((sl) => ({
    slot: sl.slot,
    tier: sl.tier,
    type: sl.type,
    id: sl.id,
    name: sl.type === 'item' ? content.items[sl.id].name : sl.type === 'gear' ? content.gear[sl.id].name : content.spells[sl.id].name,
    price: sl.price,
  }));
}

register('revealShop', (ctx) => {
  const s = ctx.s;
  const p = nextUnvisitedInn(s);
  if (p === null) fail('no_inn_ahead');
  const data = { innPos: p, band: s.inns[p].band, slots: shopView(ctx.content, s.inns[p]) };
  const rec = { kind: 'shop', turn: s.rolls, data };
  s.reveals.push(rec);
  if (s.reveals.length > 20) s.reveals.shift();
  ctx.emit({ t: 'reveal', ...rec });
});

register('showLandingOdds', (ctx, op, scope) => {
  const s = ctx.s;
  const within = op.within || 12;
  const target = evalExpr(envOf(ctx, scope), op.target === undefined ? { ref: 'var.target' } : op.target);
  if (!Number.isInteger(target) || target <= s.pos || target > Math.min(s.pos + within, 100)) fail('target_out_of_range', String(target));
  const ways = landingWays(s, target);
  const rec = { kind: 'landingOdds', turn: s.rolls, data: { target, ways, of: 36 } };
  s.reveals.push(rec);
  if (s.reveals.length > 20) s.reveals.shift();
  ctx.emit({ t: 'reveal', ...rec });
});

register('swapShopSlot', (ctx, op, scope) => {
  const s = ctx.s;
  if (s.phase !== 'inn' || !s.event || !s.event.inn) fail('swap_not_at_inn');
  const inn = s.inns[s.event.pos];
  if (inn.shop.bd40Used) fail('swap_used');
  const slotIdx = scope.vars.slot;
  const newId = scope.vars.newItemId;
  const slot = inn.shop.slots.find((x) => x.slot === slotIdx);
  if (!slot || slot.tier !== 'regional' || slot.type !== 'item') fail('swap_slot_not_allowed');
  const cur = ctx.content.items[slot.id];
  const nxt = ctx.content.items[newId];
  if (!nxt) fail('swap_unknown_item', String(newId));
  if (nxt.id === cur.id || nxt.band !== cur.band || nxt.category !== cur.category) fail('swap_item_not_allowed');
  if (inn.shop.slots.some((x) => x.id === nxt.id)) fail('swap_item_in_shop');
  const before = slot.id;
  slot.id = nxt.id;
  slot.price = nxt.price;
  inn.shop.bd40Used = true;
  ctx.emit({ t: 'shopSwapped', slot: slotIdx, from: before, to: nxt.id, price: nxt.price });
});

void currentDie;
