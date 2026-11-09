// Shared mutable-draft helpers. `ctx.s` is a private clone of the state that dispatch() mutates
// and finally returns; the caller's state object is never touched.

import { EngineError, clamp, fail } from './util.js';
import { draw as rngDraw } from './rng.js';

export const BAG_CAPACITY = 6;
export const MAX_COMPANIONS = 2;
export const PREPARED_SPELL_SLOTS = 2;
export const LEVEL_CAP = 20;

export function makeCtx(content, s, opts = {}) {
  const ctx = {
    content,
    s,
    fx: [],
    opts,
    forced: opts.rolls ? [...opts.rolls] : [],
    emit(e) {
      ctx.fx.push(e);
      return e;
    },
    draw() {
      return rngDraw(s.rng, ctx.forced);
    },
    drawInt(n) {
      return Math.min(n - 1, Math.floor(ctx.draw() * n));
    },
  };
  return ctx;
}

// ---- derived hero stats -----------------------------------------------------

export function levelRow(content, s) {
  return content.levelTable[clamp(s.level, 1, LEVEL_CAP) - 1];
}
export const maxHpOf = (content, s) => levelRow(content, s).maxHp;
export const maxMpOf = (content, s) => levelRow(content, s).maxMp;

export function gearInstance(s, iid) {
  return s.gear.find((g) => g.iid === iid) || null;
}
export function equippedGear(content, s, slot) {
  const iid = s.equipped[slot];
  if (!iid) return null;
  const inst = gearInstance(s, iid);
  return inst ? { inst, def: content.gear[inst.id] } : null;
}
export function attackOf(content, s) {
  const sw = equippedGear(content, s, 'sword');
  return levelRow(content, s).attack + (sw ? sw.def.baseStat : 0);
}
export function defenseOf(content, s) {
  const ar = equippedGear(content, s, 'armor');
  return levelRow(content, s).defense + (ar ? ar.def.baseStat : 0);
}
export const slotOfGear = (def) => (def.category === '剣' ? 'sword' : 'armor');
export const ownsGear = (s, id) => s.gear.some((g) => g.id === id);
export const knowsSpell = (s, id) => s.spells.learned.includes(id);

export function jobDef(content, s) {
  return content.jobs[s.job] || content.jobs.JB00;
}

// ---- bag ----------------------------------------------------------------------

export const bagFree = (s) => BAG_CAPACITY - s.bag.length;
export const itemCount = (s, id) => s.bag.filter((x) => x === id).length;

export function bagRemoveOne(s, id) {
  const i = s.bag.indexOf(id);
  if (i < 0) fail('no_such_item', id);
  s.bag.splice(i, 1);
}

// ---- discovery (dex deltas live in the run; save layer merges them into meta) -------

export function discover(ctx, kind, id) {
  const list = ctx.s.discovered[kind];
  if (!list) return;
  if (!list.includes(id)) {
    list.push(id);
    ctx.emit({ t: 'discover', kind, id });
  }
}

// ---- hp / mp ------------------------------------------------------------------

export function changeHp(ctx, delta, floor, meta = {}) {
  const s = ctx.s;
  const max = maxHpOf(ctx.content, s);
  const before = s.hp;
  let after;
  if (delta >= 0) {
    // "体力0から回復できない": a dead hero is never healed
    after = before <= 0 ? before : Math.min(max, before + delta);
  } else {
    const fl = floor === undefined ? 1 : floor;
    after = Math.max(Math.min(before, fl), before + delta);
    if (before < fl) after = before; // never raise hp through a loss
  }
  s.hp = after;
  if (after !== before || meta.always) ctx.emit({ t: 'hp', delta: after - before, before, after, ...(meta.reason ? { reason: meta.reason } : {}), ...(meta.trapLoss ? { trapLoss: true } : {}) });
  return after - before;
}

export function changeMp(ctx, delta, floor, meta = {}) {
  const s = ctx.s;
  const max = maxMpOf(ctx.content, s);
  const before = s.mp;
  let after;
  if (delta >= 0) after = Math.min(max, before + delta);
  else {
    const fl = floor === undefined ? 0 : floor;
    after = Math.max(Math.min(before, fl), before + delta);
  }
  s.mp = after;
  if (after !== before || meta.always) ctx.emit({ t: 'mp', delta: after - before, before, after, ...(meta.reason ? { reason: meta.reason } : {}) });
  return after - before;
}

export function changeGold(ctx, delta, reason) {
  const s = ctx.s;
  const before = s.gold;
  const after = before + delta;
  if (after < 0) fail('insufficient_gold', `need ${-delta}, have ${before}`);
  s.gold = after;
  ctx.emit({ t: 'gold', delta, before, after, reason });
}

// ---- experience ---------------------------------------------------------------

export function addXp(ctx, amount, reason) {
  if (!(amount > 0)) return;
  const s = ctx.s;
  const content = ctx.content;
  const fromLevel = s.level;
  s.xp += amount;
  ctx.emit({ t: 'xp', amount, total: s.xp, reason });
  let lvl = s.level;
  while (lvl < LEVEL_CAP && s.xp >= content.levelTable[lvl].totalXp) lvl += 1; // table index lvl => level lvl+1
  if (lvl !== fromLevel) {
    const a = content.levelTable[fromLevel - 1];
    const b = content.levelTable[lvl - 1];
    s.level = lvl;
    // current hp/mp are kept as-is (requirements: only the maxima rise)
    ctx.emit({
      t: 'levelUp',
      from: fromLevel,
      to: lvl,
      gains: { maxHp: b.maxHp - a.maxHp, maxMp: b.maxMp - a.maxMp, attack: b.attack - a.attack, defense: b.defense - a.defense },
      stats: { maxHp: b.maxHp, maxMp: b.maxMp, attack: b.attack, defense: b.defense },
    });
  }
}

export function xpToNext(content, s) {
  const row = levelRow(content, s);
  return row.xpToNext === null ? null : content.levelTable[s.level].totalXp - s.xp;
}

export { EngineError };
