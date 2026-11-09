// Inn: free rest, shop (buy/sell), job change, tavern, one-time services.

import { clone, fail } from './util.js';
import { shuffle } from './rng.js';
import {
  MAX_COMPANIONS,
  bagFree,
  changeGold,
  changeHp,
  changeMp,
  discover,
  gearInstance,
  knowsSpell,
  maxHpOf,
  maxMpOf,
  ownsGear,
} from './core.js';
import { consumablePool } from './board.js';
import { grantGear, grantItem, learnSpell } from './ops-basic.js';
import { applyCost, optionStatus } from './options.js';
import { newScope, runEffects } from './runner.js';

export const STANDARD_STOCK = ['HE01', 'BD01'];
export const SELL_RATE = { item: 40, gear: 50 };

export function unitPrice(content, type, id) {
  if (type === 'item') return content.items[id].price;
  if (type === 'gear') return content.gear[id].price;
  if (type === 'spell') return content.spells[id].price;
  fail('bad_stock_type', type);
  return 0;
}

/** Fix the shop of one inn (called for all five inns when the run starts, so BD09 can read it before arrival). */
export function generateShop(ctx, bandId) {
  const c = ctx.content;
  const slots = STANDARD_STOCK.map((id, i) => ({ slot: i, tier: 'standard', type: 'item', id, price: c.items[id].price }));
  const taken = new Set(STANDARD_STOCK);
  const regional = [];
  const guaranteed = c.base.economy.regionalGuaranteedStock[String(bandId)];
  if (guaranteed) {
    const type = guaranteed.startsWith('SP') ? 'spell' : 'gear';
    regional.push({ type, id: guaranteed, guaranteed: true });
    taken.add(guaranteed);
  }
  const pool = [];
  for (const id of consumablePool(c, bandId)) pool.push({ type: 'item', id });
  for (const cat of ['剣', '防具']) for (const id of (c.gearPool[bandId] && c.gearPool[bandId][cat]) || []) pool.push({ type: 'gear', id });
  const rest = pool.filter((p) => !taken.has(p.id) && p.id !== 'SW50');
  shuffle(ctx.s.rng, rest, ctx.forced);
  while (regional.length < 2) regional.push(rest.shift());
  regional.forEach((r, i) => {
    slots.push({ slot: 2 + i, tier: 'regional', type: r.type, id: r.id, price: unitPrice(c, r.type, r.id), guaranteed: !!r.guaranteed });
  });
  return { slots, bd40Used: false };
}

export function newInnState(ctx, bandId) {
  return { visited: false, restUsed: false, shop: generateShop(ctx, bandId), tavern: null, services: {}, band: bandId };
}

// ---- arrival ---------------------------------------------------------------------

export function tavernCandidates(ctx, bandId) {
  const c = ctx.content;
  const order = [...((c.taverns && c.taverns[String(bandId)]) || [])];
  for (const id of Object.keys(c.companions)) if (!order.includes(id)) order.push(id);
  return order.filter((id) => c.companions[id] && !ctx.s.companions.includes(id)).slice(0, 2);
}

export function arriveAtInn(ctx, pos) {
  const s = ctx.s;
  const inn = s.inns[pos];
  inn.visited = true;
  const sq = s.board.squares[pos - 1];
  s.phase = 'inn';
  s.event = { pos, eventId: sq.contentId, kind: '宿場', inn: true };
  ctx.emit({ t: 'innArrived', pos, band: inn.band, eventId: sq.contentId });
  if (!knowsSpell(s, 'SP01')) {
    ctx.emit({ t: 'freeSpell', id: 'SP01' });
    learnSpell(ctx, 'SP01');
  }
  if (!inn.tavern) {
    inn.tavern = { candidates: tavernCandidates(ctx, inn.band), recruited: false };
    for (const id of inn.tavern.candidates) discover(ctx, 'companions', id);
  }
}

// ---- actions ----------------------------------------------------------------------

function requireInn(s) {
  if (s.phase !== 'inn' || !s.event || !s.event.inn) fail('illegal_action', 'not at an inn');
  return s.inns[s.event.pos];
}

export function restHalf(content, s, inn) {
  const mh = maxHpOf(content, s);
  const mm = maxMpOf(content, s);
  return {
    hp: Math.min(Math.ceil(mh / 2), Math.max(0, mh - s.hp)),
    mp: Math.min(Math.ceil(mm / 2), Math.max(0, mm - s.mp)),
    used: inn.restUsed,
  };
}

export function doRest(ctx) {
  const s = ctx.s;
  const inn = requireInn(s);
  if (inn.restUsed) fail('rest_used');
  const mh = maxHpOf(ctx.content, s);
  const mm = maxMpOf(ctx.content, s);
  inn.restUsed = true;
  changeHp(ctx, Math.ceil(mh / 2), undefined, { reason: 'rest' });
  changeMp(ctx, Math.ceil(mm / 2), undefined, { reason: 'rest' });
  ctx.emit({ t: 'rested', pos: s.event.pos });
}

export function slotStatus(ctx, inn, slot) {
  const s = ctx.s;
  const st = { enabled: true, price: slot.price, afterGold: s.gold - slot.price };
  const no = (reason, extra) => {
    st.enabled = false;
    st.reason = reason;
    Object.assign(st, extra);
    return st;
  };
  if (slot.type === 'gear' && ownsGear(s, slot.id)) return no('alreadyOwned');
  if (slot.type === 'spell' && knowsSpell(s, slot.id)) return no('alreadyLearned');
  if (slot.type === 'item' && bagFree(s) <= 0) return no('bagFull');
  if (s.gold < slot.price) return no('insufficientGold', { shortfall: slot.price - s.gold });
  return st;
}

export function doBuy(ctx, slotIndex) {
  const s = ctx.s;
  const inn = requireInn(s);
  const slot = inn.shop.slots.find((x) => x.slot === slotIndex);
  if (!slot) fail('bad_slot', String(slotIndex));
  const st = slotStatus(ctx, inn, slot);
  if (!st.enabled) fail(st.reason === 'bagFull' ? 'bag_full' : st.reason === 'insufficientGold' ? 'insufficient_gold' : st.reason, `${slot.id}`);
  changeGold(ctx, -slot.price, 'buy');
  if (slot.type === 'item') {
    s.bag.push(slot.id);
    ctx.emit({ t: 'itemGained', id: slot.id, source: 'shop' });
  } else if (slot.type === 'gear') grantGear(ctx, slot.id, slot.price, 'shop');
  else learnSpell(ctx, slot.id);
  ctx.emit({ t: 'bought', slot: slot.slot, id: slot.id, price: slot.price });
}

// ---- selling ----------------------------------------------------------------------

export function itemSellPrice(content, id) {
  const p = content.items[id].price;
  return Math.max(1, Math.floor((p * content.settings.pricing.itemSellRatePct) / 100));
}

export function gearSellPrice(content, inst) {
  const def = content.gear[inst.id];
  const standard = Math.max(1, Math.floor((def.price * content.settings.pricing.equipmentSellRatePct) / 100));
  return inst.paidGold == null ? standard : Math.max(1, Math.min(standard, inst.paidGold));
}

export function doSellItem(ctx, index) {
  const s = ctx.s;
  requireInn(s);
  if (!Number.isInteger(index) || index < 0 || index >= s.bag.length) fail('bad_index', String(index));
  const id = s.bag[index];
  const price = itemSellPrice(ctx.content, id);
  s.bag.splice(index, 1);
  changeGold(ctx, price, 'sell');
  ctx.emit({ t: 'sold', kind: 'item', id, price });
}

export function doSellGear(ctx, iid) {
  const s = ctx.s;
  requireInn(s);
  const inst = gearInstance(s, iid);
  if (!inst) fail('not_owned', String(iid));
  if (s.equipped.sword === iid || s.equipped.armor === iid) fail('equipped_not_sellable', inst.id);
  const price = gearSellPrice(ctx.content, inst);
  s.gear.splice(s.gear.indexOf(inst), 1);
  changeGold(ctx, price, 'sell');
  ctx.emit({ t: 'sold', kind: 'gear', id: inst.id, iid, price }); // discovery stays in run.discovered / meta.dex
}

// ---- job, tavern -------------------------------------------------------------------

export function doChangeJob(ctx, jobId) {
  const s = ctx.s;
  requireInn(s);
  if (!ctx.content.jobs[jobId]) fail('bad_job', String(jobId));
  if (s.job === jobId) fail('same_job');
  const from = s.job;
  s.job = jobId;
  ctx.emit({ t: 'jobChanged', from, to: jobId });
}

export function doRecruit(ctx, companionId, replaceId) {
  const s = ctx.s;
  const inn = requireInn(s);
  if (!inn.tavern) fail('no_tavern');
  if (inn.tavern.recruited) fail('recruit_used');
  if (!inn.tavern.candidates.includes(companionId)) fail('not_a_candidate', String(companionId));
  if (s.companions.includes(companionId)) fail('already_companion');
  if (s.companions.length >= MAX_COMPANIONS) {
    if (!replaceId) fail('party_full');
    if (!s.companions.includes(replaceId)) fail('bad_replace', String(replaceId));
    s.companions.splice(s.companions.indexOf(replaceId), 1, companionId);
    ctx.emit({ t: 'companionSwapped', out: replaceId, in: companionId });
  } else {
    s.companions.push(companionId);
    ctx.emit({ t: 'companionJoined', id: companionId });
  }
  inn.tavern.recruited = true;
  discover(ctx, 'companions', companionId);
}

// ---- services (event-script `inn.services`) ------------------------------------------

export function innServices(ctx) {
  const s = ctx.s;
  const sc = ctx.content.scripts.events[s.event.eventId];
  return (sc && sc.inn && sc.inn.services) || [];
}

export function serviceStatus(ctx, svc, inputValue) {
  const s = ctx.s;
  const inn = s.inns[s.event.pos];
  if ((svc.once === undefined ? true : svc.once) && inn.services[svc.id]) return { enabled: false, reason: 'used', cost: {} };
  return optionStatus(ctx, newScope({ kind: 'service', pos: s.event.pos, eventId: s.event.eventId, serviceId: svc.id }), svc, inputValue, inputValue !== undefined);
}

export function doService(ctx, serviceId, input) {
  const s = ctx.s;
  const inn = requireInn(s);
  const svc = innServices(ctx).find((x) => x.id === serviceId);
  if (!svc) fail('bad_service', String(serviceId));
  const st = serviceStatus(ctx, svc, input);
  if (!st.enabled) fail(`service_${st.reason}`, serviceId);
  const origin = { kind: 'service', pos: s.event.pos, eventId: s.event.eventId, serviceId };
  if ((svc.once === undefined ? true : svc.once)) inn.services[svc.id] = true;
  applyCost(ctx, svc.cost, false);
  const scope = newScope(origin, { vars: svc.input ? { [svc.input.var]: input } : {} });
  const r = runEffects(ctx, svc.effects || [], scope);
  ctx.emit({ t: 'serviceUsed', pos: s.event.pos, id: serviceId });
  return r;
}

/** Checks only; the caller (index.js) then finishes the square. */
export function checkLeaveInn(ctx) {
  const s = ctx.s;
  requireInn(s);
  if (s.prompt) fail('illegal_action', 'prompt pending');
  ctx.emit({ t: 'innLeft', pos: s.event.pos });
}

void clone;
