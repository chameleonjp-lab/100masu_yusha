import {consumeOfferedHealing} from './items.js';
import { runHook } from './battle.js';
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
  levelRow,
  ownsGear,
} from './core.js';
import { envOf, register, runEffects } from './runner.js';
import { OPS } from './formats.js';
import { CUSTOM } from './custom/index.js';
import { bandOfPos, moveTarget } from './board.js';

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
  if(ctx.gearReceiptBonus){
    const sword=ctx.content.gear[id].category==='剣';
    runEffects(ctx,[{op:'reserve',slot:'nextBattle',withinMoves:2,unique:'BD28',label:'BD28',rules:[{id:'BD28-bonus',hook:sword?'heroAttackDamage':'enemyDamage',stage:'card',when:sword?{and:[{eq:[{ref:'battle.attackKind'},'attack']},{eq:[{ref:'battle.count',what:'attacks'},1]}]}:{gt:[{ref:'battle.damage'},0]},uses:1,effects:[{op:sword?'addDamage':'reduceDamage',amount:7}]}]}],{origin:{kind:'item',itemId:'BD28'},vars:{}});
    delete ctx.gearReceiptBonus;
  }
  discover(ctx, 'gear', id);
  return iid;
}

/** Add a consumable or open a bagFull prompt descriptor. Returns {ok:true} or {pause}. */
export function grantItem(ctx, id, source, onFull) {
  const s = ctx.s;
  if (!ctx.content.items[id]) fail('unknown_item', id);
  if(consumeOfferedHealing(ctx,id))return {ok:true};
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
  let d = ev(ctx, scope, op.delta);
  if(d>0 && !op.recoveryConfirmed && ctx.s.event?.kind==='回復' && scope.origin?.kind==='event' && !ctx.s.event.recoveryItemUsed && ctx.s.bag.some(id=>id==='BD17'||id==='BD38')) return {pause:{kind:'recoveryConfirm',amount:d,recoveryOp:clone(op)}};
  const item = ctx.s.phase==='battle' && !!ctx.s.battle && scope.origin?.kind==='item' && d>0;
  if(item) { const hook={damage:d}; runHook(ctx,'itemHeal',hook); d=hook.damage; }
  const before=ctx.s.hp;
  const actual=changeHp(ctx, d, op.floor, { trapLoss: op.trapLoss, reason: op.reason });
  if(item && actual>0) runHook(ctx,'hpRestored',{restoredHp:actual,hpBeforeRestore:before,restoreSource:'item'});
});

register('mp', (ctx, op, scope) => {
  const d = ev(ctx, scope, op.delta);
  const actual=changeMp(ctx, d, op.floor, { reason: op.reason });
  if(ctx.s.phase==='battle' && ctx.s.battle && scope.origin?.kind==='item' && actual>0)
    runHook(ctx,'mpRestored',{restoredMp:actual,restoreSource:'item'});
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
  if(scope.origin?.kind==='event' && !(paid>0) && ctx.s.bag.includes('BD28') && !ownsGear(ctx.s,op.id))return {pause:{kind:'gearConfirm',gearId:op.id,paidGold:paid,from:'event'}};
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
  const id = typeof op.id === 'object' ? ev(ctx, scope, op.id) : op.id; // an expression such as {ref:'var.partner'}
  for (let i = 0; i < n; i++) {
    bagRemoveOne(ctx.s, id);
    ctx.emit({ t: 'itemLost', id, reason: op.reason || 'effect' });
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
  if (!['thisMove', 'nextBattle', 'arrival', 'nextTrapLoss'].includes(slot)) fail('reserve_slot', String(slot));
  if(slot==='nextTrapLoss' && (!['hp','mp'].includes(op.resource) || !Number.isFinite(op.amount) || op.amount<0))fail('bad_trap_reservation');
  const unique = op.unique || null;
  if (unique && s.reservations.some((r) => r.unique === unique)) fail('already_reserved', unique);
  const r = {
    rid: s.nextRid++,
    slot,
    unique,
    filter: op.filter || 'any',
    ...(slot==='nextTrapLoss'?{resource:op.resource,amount:op.amount}:{}),
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

export function revealPreview(content, s, op) {
  const ctx = {content,s};
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
  } else if (op.info === 'nextEnemyAction') {
    const b = s.battle;
    if (!b) fail('reveal_not_in_battle');
    const phases = statsForBattle(content, b);
    let pi = b.phaseIdx;
    let ci = (b.cursor + 1) % phases[pi].actions.length;
    if (b.phaseChangePending && phases.length > 1) {
      pi = 1;
      ci = 0;
    }
    const overlay = (b.scenario?.roundActions || []).find(x=>x.round===b.round+1)?.action || {};
    const a = {...phases[pi].actions[ci],...overlay};
    data = { name: a.name, kind: a.kind, tell: a.tell || '', attack: a.attack, defense: a.defense, hits:a.hits||1, rawDamage:a.rawDamage, heal:a.heal||0 };
  } else if (op.info === 'squaresAhead') {
    // squares pos+from .. pos+to (<=99): kind of each, optionally only some kinds
    const out = [];
    for (let p = s.pos + (op.from || 1); p <= Math.min(s.pos + (op.to || 6), 99); p++) {
      const e = content.events[s.board.squares[p - 1].contentId];
      if (!op.kinds || op.kinds.includes(e.kind)) out.push({ pos: p, kind: e.kind, eventId: e.id, name: e.name });
    }
    data = { squares: out };
  } else if (op.info === 'sixOutcomes') {
    const out = [];
    for (let d = 1; d <= 6; d++) {
      const to = moveTarget(s, d);
      if(op.maxPos!==undefined && to>op.maxPos) continue;
      const sq = to === 100 ? null : s.board.squares[to - 1];
      out.push({ die: d, to, kind: to === 100 ? 'CASTLE' : content.events[sq.contentId].kind });
    }
    data = { outcomes: out };
  } else if (op.info === 'nearestTraps') {
    const found = ahead(ctx, (e) => e.kind === '罠', op.count || 1);
    data = {
      traps: found.map((f) => {
        const sc = content.scripts.events[f.eventId];
        return { ...f, options: sc && sc.options ? sc.options.map((o) => ({ id: o.id, label: o.label, cost: o.cost || null })) : null };
      }),
    };
  } else if (['nextGearInBand', 'nextTrapInBand', 'nextItemInBand', 'nextBattleInBand'].includes(op.info)) {
    const band = bandOfPos(content, s.pos);
    const kind = { nextGearInBand: '装備', nextTrapInBand: '罠', nextItemInBand: '道具', nextBattleInBand: '戦闘' }[op.info];
    const found = ahead(ctx, (e, p) => p <= band.range[1] && e.kind === kind &&
      (kind !== '戦闘' || content.enemies[scriptBattleEnemy(content, e.id)]?.kind === 'normal'), 1);
    data = { band: band.id, square: found[0] || null };
  } else if (op.info === 'strongEnemiesAhead') {
    const found = ahead(ctx, (e, p) => p <= s.pos + 6 && ((e.refs || []).some(id => /^MB/.test(id)) || /^MB/.test(scriptBattleEnemy(content, e.id) || '')), 6);
    data = { squares: found, found: found.length > 0 };
  } else if (op.info === 'kingPhaseHint') {
    data = { text: '魔王の体力が半分以下になると、次の予告から戦い方が変わる' };
  } else if (op.info === 'remainingTraps') {
    const squares = ahead(ctx, e => e.kind === '罠', 99);
    data = { count: squares.length, squares };
  } else if (op.info === 'ownedArmorComparison') {
    data = { maxSelected: 2, armor: s.gear.filter(g => content.gear[g.id]?.category === '防具').map(g => {
      const def = content.gear[g.id];
      return { iid: g.iid, id: g.id, name: def.name, defense: levelRow(content, s).defense + def.baseStat, timing: def.timing, effect: def.effect };
    }) };
  } else if (op.info === 'ownedSwordComparison') {
    data = { maxSelected: 2, swords: s.gear.filter(g => content.gear[g.id]?.category === '剣').map(g => {
      const def = content.gear[g.id];
      return { iid: g.iid, id: g.id, name: def.name, normalAttack: levelRow(content, s).attack + def.baseStat, timing: def.timing, effect: def.effect };
    }) };
  } else if (['nextGold','nextInn','allBattles','nearestSquares','gearCandidates','battleHint'].includes(op.info)) {
    const count = Math.max(1,Math.min(99,op.count || 1));
    const end = Math.min(99,s.pos+(op.within || 99));
    const found = ahead(ctx,(e,p)=>{
      if(p>end) return false;
      if(op.info==='nextGold')return e.kind==='金貨';
      if(op.info==='nextInn')return e.kind==='宿場' && !s.inns[p]?.visited;
      if(op.info==='allBattles' || op.info==='battleHint')return e.kind==='戦闘' && (!op.normalOnly || content.enemies[scriptBattleEnemy(content,e.id)]?.kind==='normal');
      if(op.info==='gearCandidates')return e.kind==='装備';
      return !op.kinds || op.kinds.includes(e.kind);
    },count);
    data={squares:found.map(f=>{
      const e=content.events[f.eventId],extra={};
      if(op.info==='nextGold')extra.directGold=e.directGold;
      if(op.info==='allBattles' || op.info==='battleHint') {const id=scriptBattleEnemy(content,e.id);extra.enemyId=id;extra.enemyName=content.enemies[id]?.name || null;}
      if(op.info==='battleHint'){extra.scene=e.scene;extra.action=e.action;}
      if(op.info==='gearCandidates'){extra.candidates=(e.refs||[]).filter(id=>content.gear[id]).map(id=>({id,name:content.gear[id].name}));extra.conditions=e.action;}
      return {...f,...extra};
    }),none:found.length===0};
  } else fail('reveal_unknown', String(op.info));
  return data;
}
register('reveal', (ctx, op) => {
  const s=ctx.s;
  const data=revealPreview(ctx.content,s,op);
  if(op.expires && (!Number.isInteger(op.expires.moves) || op.expires.moves<1 || op.expires.moves>3)) fail('bad_reveal_expiry');
  if(op.maxPos!==undefined && (!Number.isInteger(op.maxPos) || op.maxPos<1 || op.maxPos>100)) fail('bad_reveal_max_pos');
  const rec = { kind: op.info, turn: s.rolls, data, ...(op.expires ? {remainingMoves:op.expires.moves} : {}) };
  s.reveals.push(rec);
  if (s.reveals.length > 20) s.reveals.shift();
  ctx.emit({ t: 'reveal', ...rec });
});

function statsForBattle(content, b) {
  const e = content.enemies[b.enemyId];
  const o = e.bandStats && e.bandStats[b.band];
  return o ? o.phases : e.phases;
}

void EngineError;
void OPS;
