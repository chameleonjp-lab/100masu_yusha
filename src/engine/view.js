// view(content, state): everything the UI reads. Pure; never mutates state.

import { EngineError, clone } from './util.js';
import {
  BAG_CAPACITY,
  MAX_COMPANIONS,
  PREPARED_SPELL_SLOTS,
  attackOf,
  bagFree,
  defenseOf,
  gearInstance,
  jobDef,
  knowsSpell,
  levelRow,
  makeCtx,
  maxHpOf,
  maxMpOf,
  ownsGear,
  slotOfGear,
  xpToNext,
} from './core.js';
import { FIXED_LAST, bandOfPos, forcedStopFor, minRollsForBoard, moveTarget, nextStopPos } from './board.js';
import { itemStatus, shopView, applyItemUse, whereOf } from './items.js';
import { REASON_TEXT, optionStatus, reasonText } from './options.js';
import { gearSellPrice, innServices, itemSellPrice, restHalf, serviceStatus, slotStatus } from './inn.js';
import { battleSpellCost, enemyDef, spellPower, statsFor } from './battle.js';
import { newScope } from './runner.js';
import { chestChoiceCount } from './events.js';

// ---- small descriptors ----------------------------------------------------------------------

export function describeItem(content, id) {
  const it = content.items[id];
  if (!it) return null;
  const sc = content.scripts.items[id];
  return {
    id,
    name: it.name,
    category: it.category,
    band: it.band,
    price: it.price,
    timing: it.timing,
    effect: it.effect,
    limit: it.limit || '',
    scripted: !!sc,
    sellPrice: itemSellPrice(content, id),
    uses: sc ? sc.uses.flatMap((u) => u.where) : [],
  };
}

export function describeGear(content, id) {
  const g = content.gear[id];
  if (!g) return null;
  return {
    id,
    name: g.name,
    category: g.category,
    slot: slotOfGear(g),
    band: g.band,
    price: g.price,
    stat: g.statType === '攻撃' ? 'attack' : 'defense',
    baseStat: g.baseStat,
    timing: g.timing,
    effect: g.effect,
    scripted: !!content.scripts.equipment[id],
  };
}

export function describeSpell(content, s, id) {
  const sp = content.spells[id];
  return {
    id,
    name: sp.name,
    kind: sp.kind,
    power: sp.kind === 'finisher' ? sp.power : spellPower(sp, s), // attack/heal: current value (level applied); finisher: the multiplier
    text: sp.text || sp.effect,
    price: sp.price,
    mpCost: sp.mpCost,
    learned: knowsSpell(s, id),
    prepared: s.spells.prepared.includes(id),
  };
}

function gearDiff(content, s, id) {
  const def = content.gear[id];
  const slot = slotOfGear(def);
  const cur = s.equipped[slot] ? content.gear[gearInstance(s, s.equipped[slot]).id] : null;
  const before = cur ? cur.baseStat : 0;
  return { slot, stat: def.statType === '攻撃' ? 'attack' : 'defense', before, after: def.baseStat, delta: def.baseStat - before, currentId: cur ? cur.id : null };
}

// ---- movement preview -------------------------------------------------------------------------

/** Pure preview of the move for the current roll, optionally after a die-adjust item. */
export function previewMove(content, s, adjust) {
  if (s.phase !== 'rolled' || !s.roll) throw new EngineError('illegal_action', 'no roll to preview');
  const probe = clone(s);
  const ctx = makeCtx(content, probe, { rolls: [0.5, 0.5, 0.5] });
  const out = { legal: true, itemId: adjust ? adjust.itemId : null };
  if (adjust) {
    try {
      applyItemUse(ctx, adjust.itemId, adjust.params || {}, 'afterRoll');
    } catch (e) {
      if (!(e instanceof EngineError)) throw e;
      return { legal: false, itemId: adjust.itemId, reason: (e.details && e.details.reason) || e.code, reasonText: REASON_TEXT[(e.details && e.details.reason) || ''] || e.code };
    }
  }
  const die = probe.roll.die;
  const from = probe.roll.from;
  const to = moveTarget(probe, die, from);
  const innStop = probe.inns[to] && !probe.inns[to].visited;
  return { ...out, die, raw: probe.roll.raw, from, to, steps: to - from, discarded: die - (to - from), stop: to === 100 ? 'castle' : innStop ? 'inn' : 'normal' };
}

// ---- main ----------------------------------------------------------------------------------------

function heroView(content, s) {
  const row = levelRow(content, s);
  const equipment = {};
  for (const slot of ['sword', 'armor']) {
    const inst = s.equipped[slot] ? gearInstance(s, s.equipped[slot]) : null;
    equipment[slot] = inst ? { iid: inst.iid, ...describeGear(content, inst.id) } : null;
  }
  const bagCounts = {};
  for (const id of s.bag) bagCounts[id] = (bagCounts[id] || 0) + 1;
  return {
    level: s.level,
    xp: s.xp,
    xpToNext: xpToNext(content, s),
    levelRow: row,
    hp: s.hp,
    maxHp: maxHpOf(content, s),
    mp: s.mp,
    maxMp: maxMpOf(content, s),
    attack: attackOf(content, s),
    defense: defenseOf(content, s),
    gold: s.gold,
    job: { id: s.job, ...jobDef(content, s) },
    spells: { learned: s.spells.learned.map((id) => describeSpell(content, s, id)), prepared: [...s.spells.prepared], slots: PREPARED_SPELL_SLOTS },
    equipment,
    companions: s.companions.map((id) => ({ id, ...content.companions[id] })),
    maxCompanions: MAX_COMPANIONS,
    bag: { capacity: BAG_CAPACITY, free: bagFree(s), items: s.bag.map((id, index) => ({ index, ...describeItem(content, id) })), counts: bagCounts },
    gear: s.gear.map((g) => ({
      iid: g.iid,
      ...describeGear(content, g.id),
      paidGold: g.paidGold,
      equipped: s.equipped.sword === g.iid || s.equipped.armor === g.iid,
      sellPrice: gearSellPrice(content, g),
      diff: gearDiff(content, s, g.id),
    })),
  };
}

function boardView(content, s) {
  const next = [];
  for (let p = s.pos + 1; p <= Math.min(s.pos + 6, FIXED_LAST); p++) {
    if (p === FIXED_LAST) {
      next.push({ pos: p, kind: 'CASTLE', name: content.base.fixedSquares[1].name, isInn: false, isCastle: true, hasChest: false });
      continue;
    }
    const sq = s.board.squares[p - 1];
    const ev = content.events[sq.contentId];
    next.push({ pos: p, eventId: ev.id, kind: ev.kind, name: ev.name, isInn: s.board.innPositions.includes(p), isCastle: false, hasChest: !!sq.treasure, band: ev.band });
  }
  const stop = nextStopPos(s);
  return {
    next6: next,
    inns: s.board.innPositions.map((p, i) => ({ pos: p, band: i + 1, visited: !!(s.inns[p] && s.inns[p].visited), restUsed: !!(s.inns[p] && s.inns[p].restUsed) })),
    castle: FIXED_LAST,
    nextStop: stop,
    distanceToNextStop: stop - s.pos,
    minRolls: minRollsForBoard(s.board),
    band: bandOfPos(content, s.pos),
  };
}

function itemActions(content, s) {
  const seen = new Set();
  const out = [];
  s.bag.forEach((id, index) => {
    if (seen.has(id)) return;
    seen.add(id);
    const sc = content.scripts.items[id];
    const where = whereOf(s);
    const base = { type: 'useItem', itemId: id, index, name: content.items[id].name };
    if (!sc) {
      out.push({ ...base, enabled: false, reason: 'unscripted', reasonText: REASON_TEXT.unscripted });
      return;
    }
    const uses = sc.uses.filter((u) => where && u.where.includes(where));
    if (!uses.length) {
      out.push({ ...base, enabled: false, reason: 'notNow', reasonText: REASON_TEXT.notNow });
      return;
    }
    const needInput = uses.some((u) => (u.inputs || []).some((i) => !i.optional));
    if (needInput) {
      out.push({ ...base, enabled: true, needsInput: true, inputs: uses.flatMap((u) => u.inputs || []), uses: uses.map((u) => u.id || null) });
      return;
    }
    const st = itemStatus(content, s, id, {});
    out.push({ ...base, enabled: st.enabled, reason: st.reason, reasonText: st.reasonText });
  });
  return out;
}

function adjustOptions(content, s) {
  const out = [];
  const seen = new Set();
  for (const id of s.bag) {
    if (seen.has(id)) continue;
    seen.add(id);
    const sc = content.scripts.items[id];
    if (!sc) continue;
    for (const u of sc.uses) {
      if (!u.where.includes('afterRoll')) continue;
      const combos = [];
      const enums = (u.inputs || []).filter((i) => i.type === 'enum');
      if (!(u.inputs || []).length) combos.push({});
      else if (enums.length === u.inputs.length && enums.length === 1) for (const v of enums[0].values) combos.push({ [enums[0].id]: v });
      else continue;
      for (const params of combos) {
        const p = previewMove(content, s, { itemId: id, params });
        out.push({ itemId: id, name: content.items[id].name, params, enabled: p.legal, reason: p.reason, reasonText: p.reasonText, preview: p.legal ? { die: p.die, to: p.to, steps: p.steps, stop: p.stop } : null });
      }
    }
  }
  return out;
}

function promptView(content, s) {
  const p = s.prompt;
  if (!p) return null;
  const ctx = makeCtx(content, clone(s), {});
  if (p.kind === 'choice') {
    const scope = newScope(p.cont.origin, { vars: p.cont.vars });
    return {
      kind: 'choice',
      top: !!p.top,
      title: p.title,
      options: p.options.map((o) => {
        const st = optionStatus(ctx, scope, o, undefined, false);
        return { optionId: o.id, label: o.label, enabled: st.enabled, reason: st.reason, reasonText: st.reasonText, cost: st.cost, afterGold: st.afterGold, shortfall: st.shortfall, input: o.input || null };
      }),
    };
  }
  if (p.kind === 'bagFull') {
    return { kind: 'bagFull', itemId: p.itemId, item: describeItem(content, p.itemId), source: p.source, bag: s.bag.map((id, index) => ({ index, ...describeItem(content, id) })) };
  }
  if (p.kind === 'pickBagItem') return { kind: 'pickBagItem', bag: s.bag.map((id, index) => ({ index, ...describeItem(content, id) })) };
  return { kind: p.kind };
}

function eventView(content, s) {
  if (!s.event) return null;
  const ev = content.events[s.event.eventId];
  return {
    pos: s.event.pos,
    id: ev.id,
    kind: ev.kind,
    name: ev.name,
    scene: ev.scene,
    action: ev.action,
    result: ev.result,
    directGold: ev.directGold,
    refs: ev.refs,
    patched: !!ev.patched,
    unscripted: !!s.event.unscripted,
    awarded: s.awards[String(s.event.pos)] || 0,
    stage: s.event.stage || null,
  };
}

function innView(content, s) {
  if (s.phase !== 'inn' || !s.event || !s.event.inn) return null;
  const inn = s.inns[s.event.pos];
  const ctx = makeCtx(content, clone(s), {});
  const rest = restHalf(content, s, inn);
  const slots = inn.shop.slots.map((sl) => {
    const st = slotStatus(ctx, inn, sl);
    const nm = sl.type === 'item' ? describeItem(content, sl.id) : sl.type === 'gear' ? describeGear(content, sl.id) : describeSpell(content, s, sl.id);
    return {
      slot: sl.slot,
      tier: sl.tier,
      type: sl.type,
      id: sl.id,
      name: nm.name,
      detail: nm,
      price: sl.price,
      enabled: st.enabled,
      reason: st.reason,
      reasonText: st.reason ? reasonText(st.reason) : undefined,
      shortfall: st.shortfall,
      afterGold: st.afterGold,
      diff: sl.type === 'gear' ? gearDiff(content, s, sl.id) : undefined,
    };
  });
  const sellItems = s.bag.map((id, index) => ({ index, id, name: content.items[id].name, price: itemSellPrice(content, id) }));
  const sellGear = s.gear.map((g) => ({
    iid: g.iid,
    id: g.id,
    name: content.gear[g.id].name,
    price: gearSellPrice(content, g),
    standardPrice: Math.max(1, Math.floor((content.gear[g.id].price * content.settings.pricing.equipmentSellRatePct) / 100)),
    paidGold: g.paidGold,
    equipped: s.equipped.sword === g.iid || s.equipped.armor === g.iid,
    sellable: !(s.equipped.sword === g.iid || s.equipped.armor === g.iid),
  }));
  const tav = inn.tavern;
  const services = innServices(ctx).map((svc) => {
    const st = serviceStatus(ctx, svc, undefined);
    return { id: svc.id, label: svc.label, once: svc.once === undefined ? true : svc.once, enabled: st.enabled, reason: st.reason, reasonText: st.reason ? reasonText(st.reason) : undefined, cost: st.cost, input: svc.input || null };
  });
  return {
    pos: s.event.pos,
    band: inn.band,
    rest: { available: !inn.restUsed, hp: rest.hp, mp: rest.mp, used: inn.restUsed },
    shop: { slots, bd40Used: inn.shop.bd40Used, gold: s.gold },
    sell: { items: sellItems, gear: sellGear },
    jobs: Object.entries(content.jobs).map(([id, j]) => ({ id, name: j.name, text: j.text, current: s.job === id })),
    tavern: tav
      ? {
          candidates: tav.candidates.map((id) => ({ id, ...content.companions[id] })),
          recruited: tav.recruited,
          party: s.companions.map((id) => ({ id, ...content.companions[id] })),
          full: s.companions.length >= MAX_COMPANIONS,
          canRecruit: !tav.recruited,
        }
      : null,
    services,
    unscriptedServices: !content.scripts.events[s.event.eventId],
  };
}

function battleView(content, s) {
  const b = s.battle;
  if (!b) return null;
  const def = enemyDef(content, b.enemyId);
  const rec = b.rounds[b.round - 1];
  const heroDef = defenseOf(content, s);
  const cur = b.current;
  const base = cur.attack > 0 ? Math.max(1, cur.attack - heroDef) : 0;
  const heroAtk = attackOf(content, s);
  const items = [];
  const seen = new Set();
  for (const id of s.bag) {
    if (seen.has(id)) continue;
    seen.add(id);
    const sc = content.scripts.items[id];
    if (!sc) {
      items.push({ itemId: id, name: content.items[id].name, enabled: false, reason: 'unscripted', reasonText: REASON_TEXT.unscripted });
      continue;
    }
    const needInput = sc.uses.some((u) => u.where.includes('battle') && (u.inputs || []).some((i) => !i.optional));
    if (needInput) {
      items.push({ itemId: id, name: content.items[id].name, enabled: true, needsInput: true, inputs: sc.uses.flatMap((u) => u.inputs || []) });
      continue;
    }
    const st = itemStatus(content, s, id, b.targets ? { target: b.targets.findIndex((t) => t.real) } : {});
    items.push({ itemId: id, name: content.items[id].name, enabled: st.enabled, reason: st.reason, reasonText: st.reasonText });
  }
  const spells = s.spells.prepared.map((id) => {
    const sp = content.spells[id];
    const cost = battleSpellCost(content, s, id);
    let reason = null;
    if (s.mp < cost) reason = 'insufficientMp';
    else if (sp.kind === 'heal' && s.hp >= maxHpOf(content, s)) reason = 'hpFull';
    return { id, name: sp.name, kind: sp.kind, cost, mpAfter: Math.max(0, s.mp - cost), power: sp.kind === 'finisher' ? sp.power : spellPower(sp, s), text: sp.text, enabled: !reason, reason, reasonText: reason ? REASON_TEXT[reason] : undefined };
  });
  return {
    id: b.id,
    stage: b.stage,
    kind: b.kind,
    round: b.round,
    enemy: { id: b.enemyId, name: def.name, hp: b.enemy.hp, maxHp: b.enemy.maxHp, tell: def.tell, response: def.response, band: b.band, actionTable: statsFor(content, b.enemyId, b.band).phases.map((p) => p.actions.map((a) => ({ order: a.order, name: a.name, kind: a.kind }))) },
    phase: { index: b.phaseIdx, name: cur.phaseName, changed: b.phaseChanged },
    telegraph: {
      name: cur.name,
      kind: cur.kind,
      tell: cur.tell || '',
      attack: cur.attack,
      defense: cur.defense,
      immune: !!cur.immune,
      hits: cur.attack > 0,
      damageIfUnguarded: base,
      damageIfGuarded: base ? Math.ceil(base / 2) : 0,
      heroAttackDamage: Math.max(1, heroAtk - cur.defense),
    },
    targets: b.targets ? b.targets.map((t) => ({ index: t.index, footprint: t.footprint })) : null,
    marks: b.marks.map((m) => ({ id: m.id, owner: m.owner, label: m.label, hook: m.hook, uses: m.uses })),
    dieBonus: b.dieBonus ? { kind: b.dieBonus.kind, amount: b.dieBonus.amount, used: b.dieBonus.used, die: b.dieBonus.die } : null,
    canFlee: b.kind === 'normal',
    history: b.rounds.slice(-3).map((r) => ({ round: r.round, action: r.action, enemy: r.enemyAction.name, hpLost: r.hpLost, dealt: r.dealt })),
    extraActions: b.extraActions.map((x) => ({ id: x.id, label: x.label })),
    spells,
    items,
    companionNotes: s.companions.map((id) => ({ id, ...content.companions[id], used: !!b.flags[`medic:${id}`] || !!(rec && rec.companionActed && rec.companionActed.includes(id)) })),
  };
}

function rewardView(content, s) {
  const r = s.reward;
  if (!r) return null;
  return {
    enemyId: r.enemyId,
    gold: r.gold,
    xp: r.xp,
    gear: { hit: r.gear.hit, id: r.gear.id, name: r.gear.id ? content.gear[r.gear.id].name : null, kind: r.gear.kind, alreadyOwned: r.gear.alreadyOwned },
    item: { hit: r.item.hit, id: r.item.id, name: r.item.id ? content.items[r.item.id].name : null, cls: r.item.cls, state: r.itemState },
    victory: !!s.victory,
  };
}

function chestView(content, s) {
  if (!s.chest) return null;
  return {
    pos: s.chest.pos,
    choices: chestChoiceCount(content, s),
    candidates: s.chest.shown.map((id, index) => {
      const g = content.gear[id];
      const sp = content.spells[id];
      const it = content.items[id];
      if (g) return { index, id, type: 'gear', ...describeGear(content, id), diff: gearDiff(content, s, id), disabled: false };
      if (sp) return { index, id, type: 'spell', ...describeSpell(content, s, id) };
      return { index, id, type: 'item', ...describeItem(content, id), bagFull: bagFree(s) <= 0, name: it.name };
    }),
  };
}

function actionsFor(content, s, parts) {
  const A = [];
  const push = (a) => A.push({ enabled: true, ...a });
  switch (s.phase) {
    case 'board': {
      push({ type: 'roll' });
      for (const g of parts.hero.gear) if (!g.equipped) push({ type: 'equip', iid: g.iid, id: g.id, diff: g.diff });
      push({ type: 'setSpells', slots: PREPARED_SPELL_SLOTS, learned: s.spells.learned });
      A.push(...itemActions(content, s));
      break;
    }
    case 'rolled': {
      push({ type: 'move', preview: previewMove(content, s) });
      for (const o of parts.rolled.adjustOptions) A.push({ type: 'move', adjust: { itemId: o.itemId, params: o.params }, enabled: o.enabled, reason: o.reason, reasonText: o.reasonText, preview: o.preview });
      break;
    }
    case 'event': {
      if (s.event && s.event.unscripted) {
        push({ type: 'skipUnscripted', note: 'unscripted' });
        break;
      }
      if (s.prompt && s.prompt.kind === 'choice') for (const o of parts.prompt.options) A.push({ type: 'chooseOption', optionId: o.optionId, label: o.label, enabled: o.enabled, reason: o.reason, reasonText: o.reasonText, cost: o.cost, afterGold: o.afterGold, shortfall: o.shortfall, input: o.input });
      if (s.prompt && s.prompt.kind === 'pickBagItem') parts.prompt.bag.forEach((b) => push({ type: 'pickBagItem', index: b.index, id: b.id, name: b.name }));
      if (whereOf(s) === 'trap') A.push(...itemActions(content, s).filter((a) => a.itemId === 'AT02'));
      break;
    }
    case 'chest': {
      parts.chest.candidates.forEach((c) => push({ type: 'pickChest', index: c.index, id: c.id }));
      push({ type: 'skipChest' });
      break;
    }
    case 'bagFull': {
      parts.prompt.bag.forEach((b) => push({ type: 'bagSwap', index: b.index, id: b.id, name: b.name }));
      push({ type: 'bagDecline' });
      break;
    }
    case 'inn': {
      if (s.prompt && s.prompt.kind === 'choice') {
        for (const o of parts.prompt.options) A.push({ type: 'chooseOption', optionId: o.optionId, label: o.label, enabled: o.enabled, reason: o.reason, reasonText: o.reasonText, cost: o.cost, input: o.input });
        break;
      }
      const inn = parts.inn;
      A.push({ type: 'rest', enabled: inn.rest.available, reason: inn.rest.available ? undefined : 'used', reasonText: inn.rest.available ? undefined : REASON_TEXT.used });
      for (const sl of inn.shop.slots) A.push({ type: 'buy', slot: sl.slot, id: sl.id, price: sl.price, afterGold: sl.afterGold, enabled: sl.enabled, reason: sl.reason, reasonText: sl.reasonText, shortfall: sl.shortfall });
      inn.sell.items.forEach((x) => push({ type: 'sellItem', index: x.index, id: x.id, price: x.price }));
      inn.sell.gear.forEach((g) => A.push({ type: 'sellGear', iid: g.iid, id: g.id, price: g.price, enabled: g.sellable, reason: g.sellable ? undefined : 'equipped' }));
      for (const j of inn.jobs) A.push({ type: 'changeJob', jobId: j.id, enabled: !j.current, reason: j.current ? 'same' : undefined });
      if (inn.tavern) for (const c of inn.tavern.candidates) A.push({ type: 'recruit', companionId: c.id, needsReplace: inn.tavern.full, enabled: !inn.tavern.recruited, reason: inn.tavern.recruited ? 'recruitUsed' : undefined });
      for (const sv of inn.services) A.push({ type: 'service', serviceId: sv.id, label: sv.label, enabled: sv.enabled, reason: sv.reason, reasonText: sv.reasonText, cost: sv.cost, input: sv.input });
      for (const g of parts.hero.gear) if (!g.equipped) push({ type: 'equip', iid: g.iid, id: g.id, diff: g.diff });
      push({ type: 'setSpells', slots: PREPARED_SPELL_SLOTS, learned: s.spells.learned });
      A.push(...itemActions(content, s));
      push({ type: 'leaveInn' });
      break;
    }
    case 'bossOffer':
      push({ type: 'challenge' });
      push({ type: 'skip' });
      break;
    case 'battle': {
      const b = parts.battle;
      if (b.stage !== 'fight') break;
      const needTarget = !!b.targets;
      if (needTarget) b.targets.forEach((t) => push({ type: 'attack', target: t.index, footprint: t.footprint }));
      else push({ type: 'attack' });
      push({ type: 'guard' });
      for (const sp of b.spells) A.push({ type: 'spell', spellId: sp.id, name: sp.name, cost: sp.cost, mpAfter: sp.mpAfter, enabled: sp.enabled, reason: sp.reason, reasonText: sp.reasonText, needsTarget: needTarget && (sp.kind === 'attack' || sp.kind === 'finisher') });
      for (const it of b.items) A.push({ type: 'item', ...it });
      for (const ex of b.extraActions) push({ type: 'extra', id: ex.id, label: ex.label });
      A.push({ type: 'flee', enabled: b.canFlee, reason: b.canFlee ? undefined : 'noFlee', reasonText: b.canFlee ? undefined : '逃げられません' });
      break;
    }
    case 'battleReward':
      push({ type: 'continue' });
      break;
    case 'gate': {
      push({ type: 'challengeKing' });
      for (const g of parts.hero.gear) if (!g.equipped) push({ type: 'equip', iid: g.iid, id: g.id, diff: g.diff });
      push({ type: 'setSpells', slots: PREPARED_SPELL_SLOTS, learned: s.spells.learned });
      A.push(...itemActions(content, s));
      break;
    }
    case 'retryOffer': {
      if (s.retry.stage === 'offer') {
        push({ type: 'retry' });
        push({ type: 'declineRetry' });
      } else if (s.retry.stage === 'prep') {
        push({ type: 'resumeBattle' });
        for (const g of parts.hero.gear) if (!g.equipped) push({ type: 'equip', iid: g.iid, id: g.id, diff: g.diff });
        push({ type: 'setSpells', slots: PREPARED_SPELL_SLOTS, learned: s.spells.learned });
      }
      break;
    }
    default:
      break;
  }
  return A;
}

export function view(content, s) {
  const route = content.routes[s.route];
  const parts = {};
  parts.hero = heroView(content, s);
  parts.prompt = promptView(content, s);
  parts.inn = innView(content, s);
  parts.battle = battleView(content, s);
  parts.chest = chestView(content, s);
  parts.rolled = s.phase === 'rolled' && s.roll ? { raw: s.roll.raw, die: s.roll.die, adjust: s.roll.adjust, preview: previewMove(content, s), adjustOptions: adjustOptions(content, s), oneAdjustUsed: s.turn.adjustUsed } : null;
  const v = {
    phase: s.phase,
    revision: s.revision,
    runId: s.runId,
    route: { id: route.id, name: route.name, strength: route.strength, summary: route.summary },
    pos: s.pos,
    furthest: s.furthest,
    rolls: s.rolls,
    hero: parts.hero,
    board: boardView(content, s),
    rolled: parts.rolled,
    turn: { die: s.turn.die, rawDie: s.turn.rawDie, adjustUsed: s.turn.adjustUsed, preRoll: !!s.turn.preRoll },
    event: eventView(content, s),
    prompt: parts.prompt,
    chest: parts.chest,
    inn: parts.inn,
    offer: s.offer ? { enemyId: s.offer.enemyId, name: content.enemies[s.offer.enemyId].name, tell: content.enemies[s.offer.enemyId].tell, response: content.enemies[s.offer.enemyId].response } : null,
    battle: parts.battle,
    reward: rewardView(content, s),
    retry: { used: s.retry.used, stage: s.retry.stage },
    victory: s.victory,
    result: s.result,
    reveals: s.reveals.slice(-6),
    reservations: s.reservations.map((r) => ({ rid: r.rid, slot: r.slot, label: r.label, movesLeft: r.withinMoves === null ? null : r.withinMoves - r.movesUsed })),
    unscripted: [...s.unscripted],
    gate: s.phase === 'gate' ? { pos: 100, die: s.turn.die } : null,
  };
  v.actions = actionsFor(content, s, parts);
  return v;
}

void forcedStopFor;
void ownsGear;
