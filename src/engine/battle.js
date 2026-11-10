// Battle (R21-R30): rounds, hooks/marks, rewards, retry, demon king.

import { clone, fail } from './util.js';
import {
  addXp,
  attackOf,
  bagRemoveOne,
  changeGold,
  changeHp,
  changeMp,
  defenseOf,
  discover,
  equippedGear,
  jobDef,
  maxHpOf,
  maxMpOf,
  ownsGear,
} from './core.js';
import { bandOfPos } from './board.js';
import { evalCond, evalExpr } from './expr.js';
import { newScope, register, runEffects, envOf } from './runner.js';
import { applyItemUse, whereOf } from './items.js';
import { grantGear, grantItem } from './ops-basic.js';
import { ORIGIN_HANDLERS, finishEvent, finishSquare, resetTurn } from './events.js';

// ---- setup ------------------------------------------------------------------------------

// tuning.dieBonus: small.firstPositiveDamageReduction[die] for dice 1-3, big.firstDirectHitBonus[die] for dice 4-6
const dieBonusFor = (content, die) => {
  const cfg = content.tuning.dieBonus;
  if (!cfg || die == null) return null;
  const soft = cfg.small.firstPositiveDamageReduction[String(die)];
  if (soft !== undefined) return { kind: 'soften', amount: soft, used: false, die };
  const boost = cfg.big.firstDirectHitBonus[String(die)];
  if (boost !== undefined) return { kind: 'boost', amount: boost, used: false, die };
  return null;
};

export function enemyDef(content, enemyId) {
  const e = content.enemies[enemyId];
  if (!e) fail('unknown_enemy', String(enemyId));
  return e;
}

/** maxHp + action table for the band where the fight happens (EN02 band 3, EN07 band 5 have their own blocks). */
export function statsFor(content, enemyId, band) {
  const e = enemyDef(content, enemyId);
  const o = e.bandStats && e.bandStats[band];
  return o ? { maxHp: o.maxHp, phases: o.phases } : { maxHp: e.maxHp, phases: e.phases };
}

function newMark(ctx, b, def, owner) {
  const m = {
    mid: b.nextMid++,
    owner,
    createdRound: b.round,
    id: def.id || null,
    hook: def.hook,
    when: def.when === undefined ? null : clone(def.when),
    cancelWhen: def.cancelWhen === undefined ? null : clone(def.cancelWhen),
    stage: def.stage || 'gear',
    effects: clone(def.effects || []),
    limit: def.limit ? clone(def.limit) : null,
    unique: def.unique || null,
    uses: def.uses === undefined ? null : def.uses,
    pool: undefined,
    label: def.label || null,
    enemyActionsLeft: def.expires && def.expires.enemyActions !== undefined ? def.expires.enemyActions : null,
    heroTurnsLeft: def.expires && def.expires.heroTurns !== undefined ? def.expires.heroTurns : null,
    turnsUsed: 0,
    fired: 0,
  };
  return m;
}

/** Called by the `battle` effect op (event origin) and by the gate for the king. */
export function startBattle(ctx, enemyId, params, origin, kindOverride) {
  const s = ctx.s;
  const content = ctx.content;
  const def = enemyDef(content, enemyId);
  const kind = kindOverride || def.kind;
  const band = bandOfPos(content, s.pos).id;
  const stats = statsFor(content, enemyId, band);
  const b = {
    id: s.nextBattleId++,
    enemyId,
    kind,
    band,
    origin: clone(origin),
    enemy: { id: enemyId, name: def.name, maxHp: stats.maxHp, hp: stats.maxHp },
    phaseIdx: 0,
    cursor: 0,
    phaseChanged: false,
    phaseChangePending: false,
    round: 1,
    rounds: [],
    current: null,
    targets: null,
    marks: [],
    nextMid: 1,
    ruleUse: {},
    flags: {},
    startHp: s.hp,
    startMp: s.mp,
    dieBonus: dieBonusFor(content, s.turn.die),
    onWin: clone(params.onWin || []),
    extraActions: clone(params.extraActions || []),
    stage: 'fight',
    result: null,
    rewarded: false,
  };
  s.battle = b;
  s.phase = 'battle';
  s.offer = null;
  discover(ctx, 'enemies', enemyId);
  ctx.emit({ t: 'battleStart', enemyId, name: def.name, kind, band, maxHp: stats.maxHp, die: s.turn.die, dieBonus: b.dieBonus ? { kind: b.dieBonus.kind, amount: b.dieBonus.amount } : null });

  const f = params.field || {};
  if (f.enemyHp) {
    const before = b.enemy.hp;
    b.enemy.hp = Math.max(f.enemyHp.min === undefined ? 1 : f.enemyHp.min, b.enemy.hp + f.enemyHp.delta);
    ctx.emit({ t: 'enemyHpSet', before, after: b.enemy.hp });
  }
  for (const r of params.rules || []) b.marks.push(newMark(ctx, b, r, 'field'));

  // reservations (BD10 / BD27 / BD35 ...): matching ones become marks + onStart effects
  const keep = [];
  const starts = [];
  for (const r of s.reservations) {
    if (r.slot !== 'nextBattle') {
      keep.push(r);
      continue;
    }
    const ok = r.filter === 'any' || r.filter === kind || (r.filter === 'normal' && kind === 'normal');
    if (!ok) {
      keep.push(r);
      continue;
    }
    for (const rule of r.rules) b.marks.push(newMark(ctx, b, rule, r.label || 'reservation'));
    starts.push(r);
    ctx.emit({ t: 'reservationApplied', rid: r.rid, label: r.label });
  }
  s.reservations = keep;
  for (const r of starts) runEffects(ctx, r.onStart, newScope({ kind: 'battle' }));
  b.startHp = s.hp;
  b.startMp = s.mp;

  announce(ctx);
  // snapshot for the one retry: everything needed to put this exact battle back
  s.retry.snapshot = {
    hp: s.hp,
    mp: s.mp,
    bag: clone(s.bag),
    equipped: clone(s.equipped),
    prepared: clone(s.spells.prepared),
    companions: clone(s.companions),
    battle: clone(s.battle),
    turn: clone(s.turn),
  };
  beginFight(ctx);
}

function beginFight(ctx) {
  const s = ctx.s;
  const b = s.battle;
  b.stage = 'fight';
  // CP04 (lantern): mana at the start of every fight, including a retry's start
  for (const id of s.companions) {
    const c = ctx.content.companions[id];
    if (c && c.role === 'lantern') {
      const got = changeMp(ctx, c.effect.restoreMp, undefined, { reason: 'companion' });
      ctx.emit({ t: 'companion', id, role: 'lantern', amount: got });
    }
  }
  runHook(ctx, 'battleStart', {});
}

register('battle', (ctx, op, scope) => {
  const s = ctx.s;
  const def = enemyDef(ctx.content, op.enemy);
  const origin = scope.origin;
  if (op.optional || def.kind === 'optional') {
    // an optional strong enemy: offer first (challenge / skip); met = seen
    s.offer = { enemyId: op.enemy, params: clone({ field: op.field, rules: op.rules, extraActions: op.extraActions, onWin: op.onWin }), origin: clone(origin) };
    s.phase = 'bossOffer';
    discover(ctx, 'enemies', op.enemy);
    ctx.emit({ t: 'bossOffer', enemyId: op.enemy, name: def.name });
    return { handoff: true };
  }
  startBattle(ctx, op.enemy, { field: op.field, rules: op.rules, extraActions: op.extraActions, onWin: op.onWin }, origin);
  return { handoff: true };
});

export function challengeOffer(ctx) {
  const s = ctx.s;
  if (s.phase !== 'bossOffer' || !s.offer) fail('illegal_action', 'no offer');
  const o = s.offer;
  startBattle(ctx, o.enemyId, o.params, o.origin, 'optional');
}

export function skipOffer(ctx) {
  const s = ctx.s;
  if (s.phase !== 'bossOffer' || !s.offer) fail('illegal_action', 'no offer');
  ctx.emit({ t: 'bossSkipped', enemyId: s.offer.enemyId });
  s.offer = null;
  finishEvent(ctx);
}

export function challengeKing(ctx) {
  const s = ctx.s;
  if (s.phase !== 'gate') fail('illegal_action', 'not at the gate');
  startBattle(ctx, 'DK01', {}, { kind: 'gate', pos: 100 }, 'king');
}

// ---- announce / advance ---------------------------------------------------------------------

function announce(ctx) {
  const s = ctx.s;
  const b = s.battle;
  const def = enemyDef(ctx.content, b.enemyId);
  const phase = statsFor(ctx.content, b.enemyId, b.band).phases[b.phaseIdx];
  const a = phase.actions[b.cursor];
  b.current = { ...a, phaseIdx: b.phaseIdx, phaseName: phase.name };
  b.rounds.push({
    round: b.round,
    enemyAction: { order: a.order, name: a.name, attack: a.attack, defense: a.defense, kind: a.kind, tell: a.tell || '', phaseIdx: b.phaseIdx },
    action: null,
    landed: false,
    dealt: 0,
    hpLost: 0,
    guarded: false,
    enemyActed: false,
    enemyHit: false,
    enemyHealed: 0,
  });
  if (def.traits && def.traits.decoys) {
    const n = def.traits.decoys;
    const real = ctx.drawInt(n);
    b.targets = Array.from({ length: n }, (_, i) => ({ index: i, real: i === real, footprint: i === real ? 'fresh' : 'old' }));
  }
  ctx.emit({ t: 'enemyTell', round: b.round, name: a.name, kind: a.kind, tell: a.tell || '', defense: a.defense, attack: a.attack, phase: phase.name });
}

function advance(ctx) {
  const b = ctx.s.battle;
  const phases = statsFor(ctx.content, b.enemyId, b.band).phases;
  if (b.phaseChangePending && phases.length > 1) {
    b.phaseIdx = 1;
    b.cursor = 0;
    b.phaseChangePending = false;
  } else {
    b.phaseChangePending = false;
    b.cursor = (b.cursor + 1) % phases[b.phaseIdx].actions.length;
  }
  b.round += 1;
  announce(ctx);
}

// ---- rules / hooks -----------------------------------------------------------------------------

function companionRules(content, s) {
  const out = [];
  for (const id of s.companions) {
    const c = content.companions[id];
    if (c && c.effect && Array.isArray(c.effect.rules)) c.effect.rules.forEach((r, i) => out.push({ owner: `companion:${id}`, rule: r, key: `companion:${id}:${r.id || i}` }));
  }
  return out;
}

function gearRules(content, s) {
  const out = [];
  for (const slot of ['sword', 'armor']) {
    const g = equippedGear(content, s, slot);
    if (!g) continue;
    const sc = content.scripts.equipment[g.def.id];
    if (!sc) continue;
    (sc.rules || []).forEach((r, i) => out.push({ owner: `gear:${g.def.id}`, rule: r, key: `gear:${g.def.id}:${r.id || i}` }));
  }
  return out;
}

function jobRules(content, s) {
  const j = jobDef(content, s);
  const out = [];
  if (j.guardThenAttackBonus) {
    out.push({
      owner: `job:${s.job}`,
      key: `job:${s.job}:guardThenAttack`,
      rule: {
        hook: 'heroAttackDamage',
        when: { and: [{ eq: [{ ref: 'battle.attackKind' }, 'attack'] }, { eq: [{ ref: 'battle.heroAction', offset: -1 }, 'guard'] }] },
        effects: [{ op: 'addDamage', amount: j.guardThenAttackBonus }],
      },
    });
  }
  return out;
}

function limitOk(b, key, limit, round) {
  if (!limit) return true;
  if (!b) return true;
  const u = b.ruleUse[key] || { total: 0, round: 0, inRound: 0 };
  if (limit.perBattle !== undefined && u.total >= limit.perBattle) return false;
  if (limit.perRound !== undefined && u.round === round && u.inRound >= limit.perRound) return false;
  return true;
}

function noteUse(b, key, round) {
  if (!b) return;
  const u = b.ruleUse[key] || { total: 0, round: 0, inRound: 0 };
  u.total += 1;
  if (u.round === round) u.inRound += 1;
  else {
    u.round = round;
    u.inRound = 1;
  }
  b.ruleUse[key] = u;
}

/**
 * Run every rule bound to `hookName`. `hook` is the mutable hook context (damage, dealt, ...).
 * opts.stage filters enemyDamage rules; opts.move supplies the move context.
 * Order: job, gear (sword, armor), companions, field/item marks.
 */
export function runHook(ctx, hookName, hook, opts = {}) {
  const s = ctx.s;
  const content = ctx.content;
  const b = s.battle;
  const stage = opts.stage;
  const entries = [];
  if (b) entries.push(...jobRules(content, s));
  entries.push(...gearRules(content, s));
  entries.push(...companionRules(content, s));
  const round = b ? b.round : 0;
  const fire = [];
  for (const e of entries) {
    if (e.rule.hook !== hookName) continue;
    if (stage && (e.rule.stage || 'gear') !== stage) continue;
    fire.push({ ...e, mark: null });
  }
  if (b) {
    for (const m of [...b.marks]) {
      if (m.hook !== hookName) continue;
      if (stage && m.stage !== stage) continue;
      fire.push({ owner: m.owner, rule: m, key: `mark:${m.mid}`, mark: m });
    }
  }
  const results = [];
  const evaluated = [];
  for (const e of fire) {
    const env = { ctx, vars: {}, hook, move: opts.move };
    if (!limitOk(b, e.key, e.rule.limit, round)) continue;
    if (e.mark && e.mark.uses !== null && e.mark.uses <= 0) continue;
    if (!evalCond(env, e.rule.when)) continue;
    evaluated.push(e);
    if (!opts.deferWhen) {
      results.push(...applyRule(ctx, e, hook, opts));
      if (hook.stop) break;
    }
  }
  if (opts.deferWhen) {
    // victory: every `when` was evaluated against the moment of victory before any effect runs
    for (const e of evaluated) results.push(...applyRule(ctx, e, hook, opts));
  }
  return results;
}

function applyRule(ctx, e, hook, opts) {
  const b = ctx.s.battle;
  noteUse(b, e.key, b ? b.round : 0);
  if (e.mark) {
    e.mark.fired += 1;
    if (e.mark.uses !== null) e.mark.uses -= 1;
  }
  const scope = newScope({ kind: 'rule', owner: e.owner }, { hook, mark: e.mark, move: opts.move });
  ctx.emit({ t: 'rule', owner: e.owner, hook: e.rule.hook, id: e.rule.id || null });
  runEffects(ctx, e.rule.effects || [], scope);
  if (e.mark && e.mark.uses !== null && e.mark.uses <= 0) removeMark(ctx.s.battle, e.mark);
  return [e];
}

function removeMark(b, m) {
  const i = b.marks.indexOf(m);
  if (i >= 0) b.marks.splice(i, 1);
}

// ---- hook ops ------------------------------------------------------------------------------------

const needHook = (scope, what) => {
  if (!scope.hook) fail('op_outside_hook', what);
  return scope.hook;
};

register('addDamage', (ctx, op, scope) => {
  const h = needHook(scope, 'addDamage');
  h.damage += evalExpr(envOf(ctx, scope), op.amount);
});
register('subDamage', (ctx, op, scope) => {
  const h = needHook(scope, 'subDamage');
  h.damage = Math.max(op.min === undefined ? 0 : op.min, h.damage - evalExpr(envOf(ctx, scope), op.amount));
});
register('reduceDamage', (ctx, op, scope) => {
  const h = needHook(scope, 'reduceDamage');
  const n = evalExpr(envOf(ctx, scope), op.amount);
  const cap = op.max === undefined ? n : Math.min(n, op.max);
  const before = h.damage;
  h.damage = Math.max(op.min === undefined ? 0 : op.min, h.damage - cap);
  h.reduced = (h.reduced || 0) + (before - h.damage);
});
register('increaseDamage', (ctx, op, scope) => {
  const h = needHook(scope, 'increaseDamage');
  h.damage += evalExpr(envOf(ctx, scope), op.amount);
});
register('halveDamage', (ctx, op, scope) => {
  const h = needHook(scope, 'halveDamage');
  if (h.damage > 0) {
    const before = h.damage;
    h.damage = op.round === 'floor' ? Math.floor(h.damage / 2) : Math.ceil(h.damage / 2);
    h.reduced = (h.reduced || 0) + (before - h.damage);
  }
});
register('capDamage', (ctx, op, scope) => {
  const h = needHook(scope, 'capDamage');
  h.damage = Math.min(h.damage, evalExpr(envOf(ctx, scope), op.amount));
});
register('absorbDamage', (ctx, op, scope) => {
  const h = needHook(scope, 'absorbDamage');
  const m = scope.mark;
  if (!m) fail('op_outside_mark', 'absorbDamage');
  if (m.pool === undefined) m.pool = evalExpr(envOf(ctx, scope), op.amount);
  const take = Math.min(m.pool, h.damage);
  h.damage -= take;
  m.pool -= take;
  h.reduced = (h.reduced || 0) + take;
  if (m.pool <= 0) m.uses = 0;
});
register('reduceCost', (ctx, op, scope) => {
  const h = needHook(scope, 'reduceCost');
  h.spellCost = Math.max(op.min === undefined ? 1 : op.min, h.spellCost - evalExpr(envOf(ctx, scope), op.amount));
});

register('dealDamage', (ctx, op, scope) => {
  const s = ctx.s;
  if (!s.battle) fail('op_outside_battle', 'dealDamage');
  const amount = evalExpr(envOf(ctx, scope), op.amount);
  const times = op.times === undefined ? 1 : op.times;
  const leave = op.leave === undefined ? 0 : op.leave;
  const target = scope.vars && scope.vars.target !== undefined ? scope.vars.target : scope.target;
  heroDirectHit(ctx, { kind: scope.itemId ? 'item' : 'effect', base: amount, boostable: !!op.boostable, times, target, leave });
});

register('addMark', (ctx, op, scope) => {
  const s = ctx.s;
  const b = s.battle;
  if (!b) fail('op_outside_battle', 'addMark');
  const def = op.mark;
  if (def.unique && b.marks.some((m) => m.unique === def.unique)) fail('mark_active', def.unique);
  const m = newMark(ctx, b, def, scope.itemId || (scope.origin && scope.origin.kind) || 'effect');
  b.marks.push(m);
  ctx.emit({ t: 'markAdded', owner: m.owner, hook: m.hook, id: m.id });
});

// ---- damage to the enemy ----------------------------------------------------------------------------

function damageEnemy(ctx, amount) {
  const s = ctx.s;
  const b = s.battle;
  const e = b.enemy;
  const dealt = Math.min(e.hp, Math.max(0, amount));
  e.hp -= dealt;
  ctx.emit({ t: 'hit', target: 'enemy', amount: dealt, hp: e.hp, maxHp: e.maxHp });
  const def = enemyDef(ctx.content, b.enemyId);
  if (def.kind === 'king' && e.hp > 0 && !b.phaseChanged && def.phaseTwoThresholdHp != null && e.hp <= def.phaseTwoThresholdHp) {
    b.phaseChanged = true;
    b.phaseChangePending = true;
    ctx.emit({ t: 'phaseChange', hp: e.hp });
  }
  return dealt;
}

/**
 * Hero direct damage (attack / spell / item / effect). Handles decoys, die boost, rules.
 * spec = { kind, base, boostable, times, target, viaHooks }
 */
function heroDirectHit(ctx, spec) {
  const s = ctx.s;
  const b = s.battle;
  const rec = b.rounds[b.round - 1];
  const cur = b.current;
  const times = spec.times || 1;
  let total = 0;
  for (let i = 0; i < times; i++) {
    if (b.enemy.hp <= 0) break;
    let blocked = null;
    if (cur.immune) blocked = 'immune';
    else if (b.targets) {
      const t = spec.target;
      if (spec.kind === 'attack' || spec.kind === 'spell' || spec.kind === 'item') {
        if (t === undefined || t === null) fail('target_required');
        if (!b.targets[t]) fail('bad_target', String(t));
        if (!b.targets[t].real) blocked = 'decoy';
      }
    }
    if (blocked) {
      ctx.emit({ t: 'hit', target: 'enemy', amount: 0, blocked, hp: b.enemy.hp, maxHp: b.enemy.maxHp, via: spec.kind });
      continue;
    }
    let dmg = spec.base;
    if (spec.boostable && b.dieBonus && b.dieBonus.kind === 'boost' && !b.dieBonus.used) {
      dmg += b.dieBonus.amount;
      b.dieBonus.used = true;
      ctx.emit({ t: 'dieBoost', amount: b.dieBonus.amount });
    }
    if (spec.kind === 'attack' || spec.kind === 'spell' || spec.kind === 'item') {
      const hook = { attackKind: spec.kind, damage: dmg, ...(spec.hookExtra || {}) };
      runHook(ctx, 'heroAttackDamage', hook);
      dmg = Math.max(0, hook.damage);
    }
    if (spec.leave) dmg = Math.max(0, Math.min(dmg, b.enemy.hp - spec.leave));
    const dealt = damageEnemy(ctx, dmg);
    total += dealt;
    if (spec.kind === 'attack') rec.landed = true;
    rec.dealt += dealt;
    rec.hitKinds = [...(rec.hitKinds || []), spec.kind];
    runHook(ctx, 'heroHit', { attackKind: spec.kind, dealt, ...(spec.hookExtra || {}) });
  }
  return total;
}

// ---- hero actions ------------------------------------------------------------------------------------

function spellCostFor(ctx, sp) {
  const s = ctx.s;
  // job discount first (attack spells only), then gear/item savings, then the minimum
  let cost = sp.mpCost;
  const j = jobDef(ctx.content, s);
  if (sp.isAttackSpell && j.attackSpellMpDiscount) cost -= j.attackSpellMpDiscount;
  const hook = { spellCost: cost, attackKind: 'spell' };
  runHook(ctx, 'spellCost', hook);
  return Math.max(sp.mpCost > 0 ? (j.minimumMpCost || 1) : 0, hook.spellCost);
}

export function battleSpellCost(content, s, spellId) {
  // pure helper for view(): cost after job/gear rules, without mutating
  const probe = clone(s);
  const ctx = { content, s: probe, fx: [], emit() {}, forced: [], draw: () => 0.5, drawInt: () => 0 };
  return spellCostFor(ctx, content.spells[spellId]);
}

export const spellPower = (sp, s) => sp.power + (sp.powerPerLevel || 0) * s.level;

function heroAct(ctx, action) {
  const s = ctx.s;
  const b = s.battle;
  const rec = b.rounds[b.round - 1];
  const content = ctx.content;
  switch (action.type) {
    case 'attack': {
      rec.action = { type: 'attack', target: action.target === undefined ? null : action.target };
      const base = Math.max(1, attackOf(content, s) - b.current.defense);
      heroDirectHit(ctx, { kind: 'attack', base, boostable: true, target: action.target });
      break;
    }
    case 'guard': {
      rec.action = { type: 'guard' };
      rec.guarded = true;
      ctx.emit({ t: 'guard' });
      break;
    }
    case 'spell': {
      const id = action.spellId;
      const sp = content.spells[id];
      if (!sp || !s.spells.prepared.includes(id)) fail('spell_not_prepared', String(id));
      const cost = spellCostFor(ctx, sp);
      if (s.mp < cost) fail('insufficient_mp', `${id} needs ${cost}`);
      if (sp.kind === 'heal' && s.hp >= maxHpOf(content, s)) fail('hp_full');
      if (sp.kind === 'guard' && b.marks.some((m) => m.unique === `spell:${id}`)) fail('spell_active', id);
      changeMp(ctx, -cost, 0, { reason: 'spell' });
      rec.action = { type: 'spell', spellId: id, spellKind: sp.kind, cost, target: action.target === undefined ? null : action.target };
      ctx.emit({ t: 'spellCast', id, kind: sp.kind, cost });
      if (sp.kind === 'attack') {
        // fixed damage (4 + 2 x level for SP01), the enemy's defense does not matter
        heroDirectHit(ctx, { kind: 'spell', base: spellPower(sp, s), boostable: true, target: action.target, hookExtra: { spellCost: cost, spellMpAfter: s.mp } });
      } else if (sp.kind === 'finisher') {
        // normal-attack damage x2 against an announced 大技, x1 otherwise
        const normal = Math.max(1, attackOf(content, s) - b.current.defense);
        const mult = b.current.kind === '大技' ? sp.power : sp.otherwiseMultiplier || 1;
        heroDirectHit(ctx, { kind: 'spell', base: normal * mult, boostable: true, target: action.target, hookExtra: { spellCost: cost, spellMpAfter: s.mp } });
      } else if (sp.kind === 'heal') {
        const hook = { damage: spellPower(sp, s) };
        runHook(ctx, 'spellHeal', hook);
        changeHp(ctx, hook.damage, undefined, { reason: 'spell' });
      } else if (sp.kind === 'guard') {
        // blocks up to `power` of the next hit that lands (1+ damage); stays until then; does not stack
        b.marks.push(newMark(ctx, b, {
          id: `${id}-wall`, hook: 'enemyDamage', stage: 'wall', unique: `spell:${id}`, label: id, uses: 1,
          when: { gt: [{ ref: 'battle.damage' }, 0] },
          effects: [{ op: 'absorbDamage', amount: sp.power }],
        }, `spell:${id}`));
      }
      break;
    }
    case 'item': {
      const itemId = action.itemId;
      rec.action = { type: 'item', itemId };
      const scope = { target: action.target };
      const params = { ...(action.params || {}) };
      if (action.target !== undefined) params.target = action.target;
      void scope;
      const { status } = applyItemUse(ctx, itemId, params, 'battle');
      if (status !== 'done') fail('item_prompt_in_battle', itemId);
      break;
    }
    case 'extra': {
      const ex = b.extraActions.find((x) => x.id === action.id);
      if (!ex) fail('bad_extra', String(action.id));
      if (!evalCond(envOf(ctx, { vars: {} }), ex.when)) fail('extra_not_now', action.id);
      rec.action = { type: 'extra', id: ex.id };
      runEffects(ctx, ex.effects || [], newScope({ kind: 'battle' }, { hook: { extra: true } }));
      break;
    }
    default:
      fail('bad_battle_action', String(action.type));
  }
}

// ---- enemy action ------------------------------------------------------------------------------------

function companionShield(ctx, hook, rec) {
  const s = ctx.s;
  for (const id of s.companions) {
    const c = ctx.content.companions[id];
    if (c && c.role === 'shield' && rec.enemyAction.kind === '大技' && hook.damage > 0) {
      const red = Math.min(hook.damage, c.effect.reduceDamage);
      hook.damage -= red;
      hook.reduced = (hook.reduced || 0) + red;
      ctx.emit({ t: 'companion', id, role: 'shield', amount: red });
      rec.companionActed = [...(rec.companionActed || []), id];
    }
  }
}

function enemyAct(ctx) {
  const s = ctx.s;
  const b = s.battle;
  const content = ctx.content;
  const rec = b.rounds[b.round - 1];
  const cur = b.current;
  rec.enemyActed = true;
  ctx.emit({ t: 'enemyAct', name: cur.name, kind: cur.kind, attack: cur.attack, round: b.round });
  if (cur.attack > 0) {
    const defense = defenseOf(content, s);
    const base = Math.max(1, cur.attack - defense);
    const hook = { damage: base, enemyKind: cur.kind, reduced: 0, base };
    if (rec.guarded) {
      hook.damage = Math.ceil(hook.damage / 2);
      hook.reduced += base - hook.damage;
    }
    // order: guard -> 石の衣 (stage wall) -> shield companion -> other gear/marks -> small die -> card
    runHook(ctx, 'enemyDamage', hook, { stage: 'guard' });
    runHook(ctx, 'enemyDamage', hook, { stage: 'wall' });
    companionShield(ctx, hook, rec);
    runHook(ctx, 'enemyDamage', hook, { stage: 'shield' });
    runHook(ctx, 'enemyDamage', hook, { stage: 'gear' });
    if (b.dieBonus && b.dieBonus.kind === 'soften' && !b.dieBonus.used && hook.damage > 0) {
      const red = Math.min(hook.damage, b.dieBonus.amount);
      hook.damage -= red;
      hook.reduced += red;
      b.dieBonus.used = true;
      ctx.emit({ t: 'dieSoften', amount: red });
    }
    runHook(ctx, 'enemyDamage', hook, { stage: 'die' });
    runHook(ctx, 'enemyDamage', hook, { stage: 'card' });
    hook.damage = Math.max(0, hook.damage);
    rec.reduced = hook.reduced;
    const before = s.hp;
    s.hp = Math.max(0, s.hp - hook.damage);
    rec.hpLost = before - s.hp;
    rec.enemyHit = true;
    ctx.emit({ t: 'hit', target: 'hero', amount: hook.damage, base, blocked: Math.max(0, base - hook.damage), guarded: rec.guarded, hp: s.hp, maxHp: maxHpOf(content, s), enemyKind: cur.kind });
  }
  // counters run even when the hero fell: mutual KO is a loss (checkEnd), rules that need a survivor say so in `when`
  runHook(ctx, 'afterEnemyAction', { hpLost: rec.hpLost, enemyKind: cur.kind });
  // enemy-action based expiry
  for (const m of [...b.marks]) {
    if (m.enemyActionsLeft !== null) {
      m.enemyActionsLeft -= 1;
      if (m.enemyActionsLeft <= 0) removeMark(b, m);
    }
  }
}

// ---- round driver -----------------------------------------------------------------------------------

function checkEnd(ctx) {
  const s = ctx.s;
  const b = s.battle;
  if (s.hp <= 0) {
    loseBattle(ctx);
    return true;
  }
  if (b.enemy.hp <= 0) {
    winBattle(ctx);
    return true;
  }
  return false;
}

/** CP03 (thrower): on an 反撃の隙 turn, if the enemy survived the hero's action, 6 damage ignoring defense. */
function companionsAfterHero(ctx) {
  const s = ctx.s;
  const b = s.battle;
  const rec = b.rounds[b.round - 1];
  for (const id of s.companions) {
    const c = ctx.content.companions[id];
    if (!c || c.role !== 'thrower' || b.current.kind !== '反撃の隙' || b.enemy.hp <= 0) continue;
    const dealt = b.current.immune ? 0 : damageEnemy(ctx, c.effect.damage);
    ctx.emit({ t: 'companion', id, role: 'thrower', amount: dealt });
    rec.companionActed = [...(rec.companionActed || []), id];
  }
}

function companionsEndOfRound(ctx) {
  const s = ctx.s;
  const b = s.battle;
  const rec = b.rounds[b.round - 1];
  for (const id of s.companions) {
    const c = ctx.content.companions[id];
    if (c && c.role === 'medic' && !b.flags[`medic:${id}`] && s.hp > 0 && s.hp * 2 <= maxHpOf(ctx.content, s)) {
      b.flags[`medic:${id}`] = true;
      const got = changeHp(ctx, c.effect.healHp, undefined, { reason: 'companion' });
      ctx.emit({ t: 'companion', id, role: 'medic', amount: got });
      rec.companionActed = [...(rec.companionActed || []), id];
    }
  }
}

export function battleAction(ctx, action) {
  const s = ctx.s;
  const b = s.battle;
  if (s.phase !== 'battle' || !b || b.stage !== 'fight') fail('illegal_action', 'no fight in progress');
  if (action.type === 'flee') {
    if (b.kind !== 'normal') fail('flee_forbidden', b.kind);
    ctx.emit({ t: 'fled', enemyId: b.enemyId });
    endBattleNoReward(ctx, 'flee');
    return;
  }
  runHook(ctx, 'heroTurnStart', {});
  heroAct(ctx, action);
  const rec0 = b.rounds[b.round - 1];
  runHook(ctx, 'afterHeroAction', { spellCost: rec0.action && rec0.action.type === 'spell' ? rec0.action.cost : 0 });
  // marks that say "choosing something else cancels me" are checked once the hero's choice is known
  for (const m of [...b.marks]) {
    if (m.cancelWhen && m.createdRound < b.round && evalCond({ ctx, vars: {} }, m.cancelWhen)) removeMark(b, m);
  }
  if (checkEnd(ctx)) return;
  companionsAfterHero(ctx);
  if (checkEnd(ctx)) return;
  // the hero turn is over: tick hero-turn based marks only after the whole round (see below)
  enemyAct(ctx);
  if (checkEnd(ctx)) return;
  companionsEndOfRound(ctx);
  runHook(ctx, 'roundEnd', {});
  if (checkEnd(ctx)) return;
  for (const m of [...b.marks]) {
    if (m.heroTurnsLeft !== null && m.createdRound < b.round) {
      m.turnsUsed += 1;
      if (m.turnsUsed >= m.heroTurnsLeft) removeMark(b, m);
    }
  }
  advance(ctx);
}

// ---- end of battle ---------------------------------------------------------------------------------

function endBattleNoReward(ctx, how) {
  const s = ctx.s;
  const b = s.battle;
  b.result = how;
  s.battle = null;
  s.reward = null;
  s.phase = 'event';
  finishEvent(ctx);
}

function winBattle(ctx) {
  const s = ctx.s;
  const b = s.battle;
  b.result = 'win';
  b.stage = 'won';
  ctx.emit({ t: 'victory', enemyId: b.enemyId });
  if (b.kind === 'king') s.victory = { enemyId: 'DK01', rolls: s.rolls, battleId: b.id, pos: 100 };
  // gear victory effects: every condition is read at the moment of victory first
  runHook(ctx, 'victory', {}, { deferWhen: true });
  if (b.rewarded) return;
  b.rewarded = true;
  applyRewards(ctx);
}

function weightedPick(weights, u) {
  const entries = Object.entries(weights);
  const total = entries.reduce((t, [, w]) => t + w, 0);
  let x = u * total;
  for (const [k, w] of entries) {
    if (x < w) return k;
    x -= w;
  }
  return entries[entries.length - 1][0];
}

export function rollRewards(ctx, enemy, band) {
  const s = ctx.s;
  const content = ctx.content;
  const r = enemy.rewards;
  // gear roll and item roll are independent: both hit rolls are drawn first (gear, item)
  const uGear = ctx.draw();
  const uItem = ctx.draw();
  const out = {
    enemyId: enemy.id,
    band,
    gold: r.goldOnWin,
    xp: r.xpOnWin,
    gear: { hit: uGear * 100 < r.gearChancePct, kind: null, id: null, alreadyOwned: false },
    item: { hit: uItem * 100 < r.itemChancePct, cls: null, id: null },
    itemState: 'none',
  };
  if (out.gear.hit) {
    const kind = weightedPick({ 剣: r.swordWeightPct, 防具: r.armorWeightPct }, ctx.draw());
    out.gear.kind = kind;
    const pool = (content.gearPool[band] && content.gearPool[band][kind]) || [];
    const unowned = pool.filter((id) => !ownsGear(s, id));
    const u = ctx.draw();
    if (!unowned.length) out.gear.alreadyOwned = true;
    else out.gear.id = unowned[Math.min(unowned.length - 1, Math.floor(u * unowned.length))];
  }
  if (out.item.hit) {
    const cls = weightedPick(r.itemClassWeightsPct, ctx.draw());
    out.item.cls = cls;
    const pool = (content.itemPool[band] && content.itemPool[band][cls]) || [];
    const u = ctx.draw();
    out.item.id = pool[Math.min(pool.length - 1, Math.floor(u * pool.length))];
  }
  return out;
}

function applyRewards(ctx) {
  const s = ctx.s;
  const b = s.battle;
  const enemy = enemyDef(ctx.content, b.enemyId);
  const reward = rollRewards(ctx, enemy, b.band);
  s.reward = reward;
  changeGold(ctx, reward.gold, 'battle');
  addXp(ctx, reward.xp, 'battle');
  if (reward.gear.id) {
    const iid = grantGear(ctx, reward.gear.id, null, 'drop');
    reward.gear.iid = iid;
  }
  ctx.emit({ t: 'rewards', gold: reward.gold, xp: reward.xp, gear: { hit: reward.gear.hit, id: reward.gear.id, alreadyOwned: reward.gear.alreadyOwned }, item: { hit: reward.item.hit, id: reward.item.id } });
  if (reward.item.id) {
    const r = grantItem(ctx, reward.item.id, 'reward');
    if (r.pause) {
      reward.itemState = 'prompt';
      s.prompt = { ...r.pause, prevPhase: 'battleReward', cont: { rest: [], vars: {}, origin: { kind: 'reward' } } };
      s.phase = 'bagFull';
      return;
    }
    reward.itemState = 'added';
  }
  s.phase = 'battleReward';
}

ORIGIN_HANDLERS.reward = (ctx) => {
  const s = ctx.s;
  if (s.reward && s.reward.itemState === 'prompt') s.reward.itemState = 'resolved';
  s.phase = 'battleReward';
};

export function continueReward(ctx) {
  const s = ctx.s;
  if (s.phase !== 'battleReward' || !s.battle) fail('illegal_action', 'no reward pending');
  const b = s.battle;
  const origin = b.origin;
  const onWin = b.onWin;
  if (b.kind === 'king') {
    s.battle = null;
    s.reward = null;
    finishRun(ctx, 'victory');
    return;
  }
  s.battle = null;
  s.reward = null;
  s.phase = 'event';
  if (onWin && onWin.length) {
    const r = runEffects(ctx, onWin, newScope(origin || { kind: 'event', pos: s.pos }));
    if (r !== 'done') return;
  }
  finishEvent(ctx);
}

function loseBattle(ctx) {
  const s = ctx.s;
  const b = s.battle;
  b.result = 'loss';
  b.stage = 'lost';
  ctx.emit({ t: 'defeat', enemyId: b.enemyId });
  if (!s.retry.used) {
    s.phase = 'retryOffer';
    s.retry.stage = 'offer';
    ctx.emit({ t: 'retryOffered' });
    return;
  }
  finishRun(ctx, 'lost');
}

export function acceptRetry(ctx) {
  const s = ctx.s;
  if (s.phase !== 'retryOffer' || s.retry.stage !== 'offer') fail('illegal_action', 'no retry offered');
  if (s.retry.used) fail('retry_used');
  const snap = s.retry.snapshot;
  if (!snap) fail('retry_no_snapshot');
  // spending the right and restoring happen in the same dispatch (= the same save)
  s.retry.used = true;
  s.retry.stage = 'prep';
  s.battle = clone(snap.battle);
  s.battle.stage = 'prep';
  s.bag = clone(snap.bag);
  s.equipped = clone(snap.equipped);
  s.spells.prepared = clone(snap.prepared);
  s.companions = clone(snap.companions);
  s.turn = clone(snap.turn);
  s.hp = Math.max(snap.hp, Math.ceil(maxHpOf(ctx.content, s) / 2));
  s.mp = Math.max(snap.mp, Math.ceil(maxMpOf(ctx.content, s) / 2));
  ctx.emit({ t: 'retryAccepted', hp: s.hp, mp: s.mp });
}

export function resumeBattle(ctx) {
  const s = ctx.s;
  if (s.phase !== 'retryOffer' || s.retry.stage !== 'prep') fail('illegal_action', 'not preparing a retry');
  s.phase = 'battle';
  s.retry.stage = null;
  beginFight(ctx);
  ctx.emit({ t: 'retryStarted', enemyId: s.battle.enemyId });
}

export function declineRetry(ctx) {
  const s = ctx.s;
  if (s.phase !== 'retryOffer' || s.retry.stage !== 'offer') fail('illegal_action', 'no retry offered');
  finishRun(ctx, 'declined');
}

export function finishRun(ctx, endedBy) {
  const s = ctx.s;
  s.phase = 'finished';
  s.battle = s.battle && endedBy !== 'victory' ? s.battle : null;
  s.prompt = null;
  s.event = null;
  s.result = {
    runId: s.runId,
    route: s.route,
    defeated: endedBy === 'victory',
    endedBy,
    furthest: s.furthest,
    rolls: s.rolls,
    level: s.level,
    job: s.job,
    companions: [...s.companions],
    lostTo: endedBy === 'victory' ? null : s.battle ? s.battle.enemyId : null,
    pos: s.pos,
  };
  ctx.emit({ t: 'runFinished', result: clone(s.result) });
}

void bagRemoveOne;
void finishSquare;
void resetTurn;
void whereOf;
void discover;
