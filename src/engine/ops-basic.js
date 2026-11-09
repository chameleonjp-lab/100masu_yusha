// Basic effect ops: resources, items, gear, spells, prompts, reservations, reveals.

import { EngineError, clone, fail } from './util.js';
import { evalExpr } from './expr.js';
import {
  BAG_CAPACITY,
  PREPARED_SPELL_SLOTS,
  addXp,
  bagRemoveOne,
  changeGold,
  changeHp,
  changeMp,
  discover,
  knowsSpell,
  ownsGear,
} from './core.js';
import { envOf, register } from './runner.js';
import { OPS } from './formats.js';
import { CUSTOM } from './custom/index.js';

export function learnSpell(ctx, id) {
  const s = ctx.s;
  if (!ctx.content.spells[id]) fail('unknown_spell', id);
  if (knowsSpell(s, id)) {
    ctx.emit({ t: 'spellKnown', id });
    return false;
  }
  s.spells.learned.push(id);
  if (s.spells.prepared.length < PREPARED_SPELL_SLOTS) s.spells.prepared.push(id);
  ctx.emit({ t: 'spellLearned', id, prepared: s.spells.prepared.includes(id) });
  return true;
}

export function grantGear(ctx, id, paidGold, from) {
  const s = ctx.s;
  if (!ctx.content.gear[id]) fail('unknown_gear', id);
  if (ownsGear(s, id)) {
    ctx.emit({ t: 'gearOwned', id });
    return null;
  }
  const iid = `g${s.nextGearIid++}`;
  s.gear.push({ iid, id, paidGold: paidGold == null ? null : paidGold, from: from || 'gift' });
  ctx.emit({ t: 'gearGained', id, iid, paidGold: paidGold == null ? null : paidGold });
  discover(ctx, 'gear', id);
  return iid;
}

/** Add a consumable or open a bagFull prompt descriptor. Returns {ok:true} or {pause}. */
export function grantItem(ctx, id, source, onFull) {
  const s = ctx.s;
  if (!ctx.content.items[id]) fail('unknown_item', id);
  if (s.bag.length < BAG_CAPACITY) {
    s.bag.push(id);
    ctx.emit({ t: 'itemGained', id });
    return { ok: true };
  }
  if (onFull === 'skip') {
    ctx.emit({ t: 'itemForfeited', id, reason: 'bagFull' });
    return { ok: true };
  }
  ctx.emit({ t: 'bagFull', itemId: id, source });
  return { pause: { kind: 'bagFull', itemId: id, source } };
}

const ev = (ctx, scope, e) => evalExpr(envOf(ctx, scope), e);

register('awardGold', (ctx, op, scope) => {
  const o = scope.origin || {};
  if (o.kind !== 'event' && o.kind !== 'service') fail('award_outside_event');
  const event = ctx.content.events[o.eventId];
  if (!event || !event.goldAward || !event.directGold) fail('award_not_defined', o.eventId);
  const amount = ev(ctx, scope, op.amount);
  if (amount !== event.directGold) fail('award_amount_mismatch', `${amount} != ${event.directGold}`);
  if (amount < 100 || amount > 1000) fail('award_range', String(amount));
  const key = String(o.pos);
  if (ctx.s.awards[key]) {
    ctx.emit({ t: 'awardSkipped', pos: o.pos, reason: 'already' });
    return;
  }
  ctx.s.awards[key] = amount;
  changeGold(ctx, amount, 'award');
});

register('payGold', (ctx, op, scope) => {
  const n = ev(ctx, scope, op.amount);
  if (n <= 0) return;
  if (ctx.s.gold < n) {
    if (!op.clamp) fail('insufficient_gold', `need ${n}, have ${ctx.s.gold}`);
    changeGold(ctx, -ctx.s.gold, 'pay');
    return;
  }
  changeGold(ctx, -n, 'pay');
});

register('hp', (ctx, op, scope) => {
  const d = ev(ctx, scope, op.delta);
  changeHp(ctx, d, op.floor, { trapLoss: op.trapLoss, reason: op.reason });
});

register('mp', (ctx, op, scope) => {
  const d = ev(ctx, scope, op.delta);
  changeMp(ctx, d, op.floor, { reason: op.reason });
});

register('xp', (ctx, op, scope) => {
  addXp(ctx, ev(ctx, scope, op.amount), op.reason || 'effect');
});

register('giveItem', (ctx, op, scope) => {
  const r = grantItem(ctx, op.id, (scope.origin && scope.origin.kind) || 'event', op.onFull);
  return r.pause ? { pause: { ...r.pause, origin: scope.origin } } : undefined;
});

register('giveGear', (ctx, op, scope) => {
  const paid = op.paidGold === undefined ? null : ev(ctx, scope, op.paidGold);
  grantGear(ctx, op.id, paid, (scope.origin && scope.origin.kind) || 'event');
});

register('learnSpell', (ctx, op) => {
  learnSpell(ctx, op.id);
});

register('loseItem', (ctx, op, scope) => {
  if (op.choose) {
    if (!ctx.s.bag.length) return; // nothing to lose
    return { pause: { kind: 'pickBagItem', reason: op.reason || 'loss' } };
  }
  const n = op.count === undefined ? 1 : ev(ctx, scope, op.count);
  for (let i = 0; i < n; i++) {
    bagRemoveOne(ctx.s, op.id);
    ctx.emit({ t: 'itemLost', id: op.id, reason: op.reason || 'effect' });
  }
});

register('choice', (ctx, op) => ({ pause: { kind: 'choice', title: op.prompt || null, options: clone(op.options), nested: true } }));

register('setFlag', (ctx, op, scope) => {
  ctx.s.flags[op.key] = ev(ctx, scope, op.value === undefined ? true : op.value);
});

register('custom', (ctx, op, scope) => {
  const h = CUSTOM[op.id];
  if (!h) fail('custom_unknown', op.id);
  h(ctx, op.args || {}, scope);
});

register('negateTrap', (ctx) => {
  ctx.negateTrap = true;
});

// ---- reservations --------------------------------------------------------------

register('reserve', (ctx, op, scope) => {
  const s = ctx.s;
  const slot = op.slot;
  if (!['thisMove', 'nextBattle', 'arrival'].includes(slot)) fail('reserve_slot', String(slot));
  const unique = op.unique || null;
  if (unique && s.reservations.some((r) => r.unique === unique)) fail('already_reserved', unique);
  const r = {
    rid: s.nextRid++,
    slot,
    unique,
    filter: op.filter || 'any',
    withinMoves: op.withinMoves === undefined ? null : op.withinMoves,
    movesUsed: 0,
    rules: clone(op.rules || []),
    onStart: clone(op.onStart || []),
    effects: clone(op.effects || []),
    pos: slot === 'arrival' ? ev(ctx, scope, op.pos) : null,
    source: scope.origin || null,
    label: op.label || null,
  };
  s.reservations.push(r);
  ctx.emit({ t: 'reserved', slot, rid: r.rid, label: r.label, withinMoves: r.withinMoves });
});

// ---- reveals -------------------------------------------------------------------

export function walkOps(list, fn) {
  for (const op of list || []) {
    if (!op || typeof op !== 'object') continue;
    fn(op);
    if (op.then) walkOps(op.then, fn);
    if (op.else) walkOps(op.else, fn);
    if (op.options) for (const o of op.options) walkOps(o.effects, fn);
    if (op.onWin) walkOps(op.onWin, fn);
  }
}

export function scriptBattleEnemy(content, eventId) {
  const sc = content.scripts.events[eventId];
  let found = null;
  if (sc) {
    const visit = (list) =>
      walkOps(list, (op) => {
        if (!found && op.op === 'battle') found = op.enemy;
      });
    visit(sc.onLand);
    for (const o of sc.options || []) visit(o.effects);
  }
  if (!found) {
    const e = content.events[eventId];
    found = ((e && e.refs) || []).find((r) => /^(EN|MB)/.test(r)) || null;
  }
  return found;
}

function ahead(ctx, pred, count) {
  const s = ctx.s;
  const out = [];
  for (let p = s.pos + 1; p < 100 && out.length < count; p++) {
    const sq = s.board.squares[p - 1];
    const e = ctx.content.events[sq.contentId];
    if (pred(e, p)) out.push({ pos: p, eventId: e.id, kind: e.kind, name: e.name });
  }
  return out;
}

register('reveal', (ctx, op) => {
  const s = ctx.s;
  const content = ctx.content;
  let data;
  if (op.info === 'nextBattleEnemy' || op.info === 'nearestBattles') {
    const count = op.info === 'nextBattleEnemy' ? 1 : op.count || 1;
    const found = ahead(ctx, (e) => e.kind === '戦闘' && content.enemies[scriptBattleEnemy(content, e.id)] && content.enemies[scriptBattleEnemy(content, e.id)].kind === 'normal', count);
    data = {
      battles: found.map((f) => {
        const enemyId = scriptBattleEnemy(content, f.eventId);
        const en = content.enemies[enemyId];
        return { ...f, enemyId, enemyName: en.name, firstActions: op.withActions ? en.phases[0].actions.map((a) => ({ order: a.order, name: a.name, kind: a.kind, tell: a.tell })) : undefined };
      }),
    };
  } else if (op.info === 'nearestTraps') {
    const found = ahead(ctx, (e) => e.kind === '罠', op.count || 1);
    data = {
      traps: found.map((f) => {
        const sc = content.scripts.events[f.eventId];
        return { ...f, options: sc && sc.options ? sc.options.map((o) => ({ id: o.id, label: o.label, cost: o.cost || null })) : null };
      }),
    };
  } else fail('reveal_unknown', String(op.info));
  const rec = { kind: op.info, turn: s.rolls, data };
  s.reveals.push(rec);
  if (s.reveals.length > 20) s.reveals.shift();
  ctx.emit({ t: 'reveal', ...rec });
});

void EngineError;
void OPS;
