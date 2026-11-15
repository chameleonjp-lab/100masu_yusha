import {temporaryStatusView} from './status.js';
import {evalCond} from './expr.js';
import {previewBoardItem} from './info-items.js';
import {puzzlePublicState,puzzleAnswerInput} from './puzzles.js';
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
import { receivedItemStatus, itemStatus, shopView, applyItemUse, whereOf } from './items.js';
import { REASON_TEXT, optionStatus, reasonText, substituteTradeOption } from './options.js';
import { doRest, gearSellPrice, innServices, itemSellPrice, restHalf, serviceStatus, slotStatus } from './inn.js';
import { battleSpellCost, enemyDef, spellPower, battleScenarioChoices, battleActionPreview, scoutDecoyTargets, enemyActionForecast } from './battle.js';
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
    currentName: s.pos===0 ? "旅の入口" : s.pos===100 ? content.base.fixedSquares[1].name : content.events[s.board.squares[s.pos-1]?.contentId]?.name || "旅の入口",
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
    let where = whereOf(s);
    if(where==='afterRest' && sc && !sc.uses.some(u=>u.where.includes('afterRest'))) where='inn';
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
    const dynamic=itemStatus(content,s,id);
    if(dynamic.needsInput){out.push({...base,...dynamic});return;}
    const needInput = uses.some((u) => (u.inputs || []).some((i) => !i.optional));
    if (needInput && ['BD03','BD10','BD13','BD15','BD32','BD47'].includes(id)){const specs=uses.flatMap(u=>u.inputs||[]);const spec=specs[0];const candidates=spec.id==='kind'?['装備','道具','回復']:Array.from({length:99-s.pos},(_,i)=>s.pos+i+1);const labels={};const values=candidates.filter(value=>{try{const data=previewBoardItem(content,s,{id,[spec.id]:value});labels[value]=data.square?`${data.square.pos}マス：${data.square.name}`:value;return true}catch{return false}});out.push({...base,enabled:values.length>0,reasonText:values.length?undefined:'この先に対象のマスがありません',needsInput:true,inputs:[{...spec,type:'enum',values,labels}]});return;}
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
  if(p.kind==='gearConfirm')return {kind:p.kind,gearId:p.gearId,gear:describeGear(content,p.gearId),title:`${content.gear[p.gearId].name}を受け取ります`};
  if(p.kind==='recoveryConfirm')return {kind:p.kind,amount:p.amount,title:`体力 ${p.amount} 回復する前に道具を選べます`};
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
    action: s.event.puzzle && !s.event.puzzle.resolved ? content.scripts.events[s.event.eventId].puzzle.prompt || "見本と手掛かりを確認して答えを選んでください" : ev.action,
    result: s.event.puzzle && !s.event.puzzle.resolved ? null : ev.result,
    directGold: ev.directGold,
    refs: ev.refs,
    patched: !!ev.patched,
    unscripted: !!s.event.unscripted,
    awarded: s.awards[String(s.event.pos)] || 0,
    stage: s.event.stage || null,
    puzzle: s.event.puzzle ? {...puzzlePublicState(s.event.puzzle),kind:content.scripts.events[s.event.eventId].puzzle.kind,labels:content.scripts.events[s.event.eventId].puzzle.labels||{},display:clone(content.scripts.events[s.event.eventId].puzzle.display||{}),prompt:content.scripts.events[s.event.eventId].puzzle.prompt||""} : null,
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
    rest: { available: !inn.restUsed, hp: rest.hp, mp: rest.mp, used: inn.restUsed, choices:(content.scripts.events[s.event.eventId]?.inn?.restOptions||[]).map(opt=>{const probe=clone(s);try{doRest(makeCtx(content,probe),{choiceId:opt.id});return {choiceId:opt.id,label:opt.label,cost:opt.cost,enabled:true,preview:{hp:probe.hp-s.hp,mp:probe.mp-s.mp,gold:probe.gold-s.gold}}}catch(e){return {choiceId:opt.id,label:opt.label,cost:opt.cost,enabled:false,reason:e.code||e.message}}}) },
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
  const base = cur.rawDamage !== undefined ? cur.rawDamage : cur.attack > 0 ? Math.max(1, cur.attack - heroDef) : 0;
  const hits = cur.hits ?? (base > 0 ? 1 : 0);
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
    const dynamic=itemStatus(content,s,id);
    if(dynamic.needsInput){items.push({itemId:id,name:content.items[id].name,...dynamic});continue;}
    if(id==='AT31'&&b.targets){const scout=scoutDecoyTargets(s);items.push({itemId:id,name:content.items[id].name,enabled:true,inputs:[{id:'target',type:'enum',values:scout.candidates,labels:Object.fromEntries(scout.candidates.map(i=>[i,`${i+1}番の影`]))}],excludedTarget:scout.excluded});continue;}
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
    temporaryStatuses:temporaryStatusView(s),
    forecast:{unguarded:enemyActionForecast(content,s,false),guarded:enemyActionForecast(content,s,true)},
    enemy: { id: b.enemyId, name: def.name, hp: b.enemy.hp, maxHp: b.enemy.maxHp, tell: def.tell, response: def.response, band: b.band },
    phase: { index: b.phaseIdx, name: cur.phaseName, changed: b.phaseChanged },
    telegraph: {
      predictions: ['attack','guard'].flatMap(type=>{const choices=battleScenarioChoices(content,s,type);const actions=choices.length?choices.map(c=>({type,choiceId:c.id,label:c.label})):[{type,label:type==='attack'?'通常攻撃':'防御'}];return actions.map(action=>({action,label:action.label,...battleActionPreview(content,s,action)}));}),
      name: cur.name,
      kind: cur.kind,
      tell: cur.tell || '',
      attack: cur.attack,
      defense: cur.defense,
      immune: !!cur.immune,
      hits: hits > 0,
      hitCount: hits,
      heal: cur.heal || 0,
      damageIfUnguarded: base * hits,
      damageIfGuarded: base ? Math.ceil(base / 2) * hits : 0,
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

function attachedItems(content,s,where) {
  return [...new Set(s.bag)].flatMap(itemId=>{
    const uses=(content.scripts.items[itemId]?.uses || []).filter(u=>u.where.includes(where));
    return uses.length ? [{itemId,name:content.items[itemId].name,inputs:uses.flatMap(u=>u.inputs || []),requiresConfirmation:true}] : [];
  });
}
function receiptActions(content,s,base,effects,vars={}) {
 if(!s.bag.includes('BD06'))return [];
 const ids=[];const walk=list=>{for(const op of list||[]){if(op.op==='giveItem')ids.push(op.id);else if(op.op==='if'){try{walk(evalCond({ctx:makeCtx(content,clone(s)),vars},op.cond)?op.then:op.else)}catch{}}}};walk(effects);
 return [...new Set(ids)].flatMap(receivedId=>{const st=receivedItemStatus(content,s,receivedId);return st.enabled?[{...base,itemId:'BD06',params:{receivedId},inputs:st.inputs||[],label:`${base.label||'受け取る'}（${content.items[receivedId].name}をその場で使用・${content.items.BD06.name}を消費）`}]:[]});
}
function actionsFor(content, s, parts) {
  const A = [];
  const push = (a) => A.push({ enabled: true, ...a });
  if(s.prompt?.kind==='gearConfirm')return [{type:'confirmGear',label:'装備の受け取りを確定',enabled:true,itemOptions:attachedItems(content,s,'receiveGear')}];
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
      if(s.prompt?.kind==='recoveryConfirm'){push({type:'confirmRecovery',label:'回復を確定',itemOptions:attachedItems(content,s,'recoveryConfirm')});break;}
      if (s.event && s.event.unscripted) {
        push({ type: 'skipUnscripted', note: 'unscripted' });
        break;
      }
      if(s.event?.puzzle?.pendingWrong!==null && s.event?.puzzle?.pendingWrong!==undefined){push({type:'commitPuzzleWrong',label:'結果を確定'});A.push(...itemActions(content,s));break;}
      if(s.prompt?.kind==='puzzle'){push({type:'answerPuzzle',label:'答えを確定',input:puzzleAnswerInput(content.scripts.events[s.event.eventId].puzzle)});A.push(...itemActions(content,s));break;}
      if (s.prompt && s.prompt.kind === 'choice') for (const o of parts.prompt.options) A.push({ type: 'chooseOption', optionId: o.optionId, label: o.label, enabled: o.enabled, reason: o.reason, reasonText: o.reasonText, cost: o.cost, afterGold: o.afterGold, shortfall: o.shortfall, input: o.input, itemOptions:s.event?.kind==='罠' && s.prompt?.top && o.cost?.hp ? attachedItems(content,s,'trapLoss') : [] });
      if(s.prompt?.kind==='choice')for(const option of parts.prompt.options.filter(o=>o.enabled)){const raw=s.prompt.options.find(o=>o.id===option.optionId);A.push(...receiptActions(content,s,{type:'chooseOption',optionId:option.optionId,label:option.label,enabled:true,cost:option.cost,input:option.input},raw.effects,s.prompt.cont?.vars));}
      if(s.bag.includes('BD36')&&s.prompt?.kind==='choice')for(const opt of s.prompt.options)for(const substituteId of new Set(s.bag)){const copy=clone(s);copy.bag.splice(copy.bag.indexOf('BD36'),1);try{const ctx=makeCtx(content,copy),sub=substituteTradeOption(ctx,opt,substituteId),st=optionStatus(ctx,newScope(s.prompt.cont.origin,{vars:s.prompt.cont.vars}),sub,undefined,false);if(st.enabled)push({type:'chooseOption',optionId:opt.id,itemId:'BD36',params:{substituteId},label:`${opt.label}（${content.items[substituteId].name}で代用・${content.items.BD36.name}を消費）`,cost:st.cost,input:opt.input||null});}catch{}}
      if (s.prompt && s.prompt.kind === 'pickBagItem') parts.prompt.bag.forEach((b) => push({ type: 'pickBagItem', index: b.index, id: b.id, name: b.name }));
      if (whereOf(s) === 'trap' || s.event?.puzzle) A.push(...itemActions(content, s).filter((a) => a.reason !== 'notNow')); // items that can act on a trap (AT02)
      break;
    }
    case 'chest': {
      parts.chest.candidates.forEach((c) => push({ type: 'pickChest', index: c.index, id: c.id }));
      for(const c of parts.chest.candidates)if(c.type==='item')A.push(...receiptActions(content,s,{type:'pickChest',index:c.index,id:c.id,enabled:true,label:'宝箱の品を受け取る'},[{op:'giveItem',id:c.id}]));
      push({ type: 'skipChest' });
      break;
    }
    case 'bagFull': {
      parts.prompt.bag.forEach((b) => push({ type: 'bagSwap', index: b.index, id: b.id, name: b.name }));
      push({ type: 'bagDecline' });
      break;
    }
    case 'inn': {
      if (s.prompt?.kind === 'pickBagItem') {
        parts.prompt.bag.forEach(b => push({type:'pickBagItem',index:b.index,id:b.id,name:b.name}));
        break;
      }
      if (s.prompt && s.prompt.kind === 'choice') {
        for (const o of parts.prompt.options) A.push({ type: 'chooseOption', optionId: o.optionId, label: o.label, enabled: o.enabled, reason: o.reason, reasonText: o.reasonText, cost: o.cost, input: o.input });
      if(s.prompt?.kind==='choice')for(const option of parts.prompt.options.filter(o=>o.enabled)){const raw=s.prompt.options.find(o=>o.id===option.optionId);A.push(...receiptActions(content,s,{type:'chooseOption',optionId:option.optionId,label:option.label,enabled:true,cost:option.cost,input:option.input},raw.effects,s.prompt.cont?.vars));}
        break;
      }
      const inn = parts.inn;
      if(inn.rest.choices.length)for(const choice of inn.rest.choices)A.push({type:'rest',...choice,itemOptions:inn.rest.available?attachedItems(content,s,'restConfirm'):[]});else A.push({ type: 'rest', itemOptions:inn.rest.available ? attachedItems(content,s,'restConfirm') : [], enabled: inn.rest.available, reason: inn.rest.available ? undefined : 'used', reasonText: inn.rest.available ? undefined : REASON_TEXT.used });
      for (const sl of inn.shop.slots) A.push({ type: 'buy', slot: sl.slot, id: sl.id, price: sl.price, afterGold: sl.afterGold, enabled: sl.enabled, reason: sl.reason, reasonText: sl.reasonText, shortfall: sl.shortfall });
      inn.sell.items.forEach((x) => push({ type: 'sellItem', index: x.index, id: x.id, price: x.price }));
      inn.sell.gear.forEach((g) => A.push({ type: 'sellGear', iid: g.iid, id: g.id, price: g.price, enabled: g.sellable, reason: g.sellable ? undefined : 'equipped' }));
      for (const j of inn.jobs) A.push({ type: 'changeJob', jobId: j.id, enabled: !j.current, reason: j.current ? 'same' : undefined });
      if (inn.tavern) for (const c of inn.tavern.candidates) A.push({ type: 'recruit', itemOptions:!inn.tavern.recruited?attachedItems(content,s,'recruit'):[], companionId: c.id, needsReplace: inn.tavern.full, enabled: !inn.tavern.recruited, reason: inn.tavern.recruited ? 'recruitUsed' : undefined });
      for (const sv of inn.services) A.push({ type: 'service', serviceId: sv.id, label: sv.label, enabled: sv.enabled, reason: sv.reason, reasonText: sv.reasonText, cost: sv.cost, input: sv.input });
      for(const sv of inn.services.filter(x=>x.enabled)){const raw=innServices(makeCtx(content,clone(s))).find(x=>x.id===sv.id);A.push(...receiptActions(content,s,{type:'service',serviceId:sv.id,label:sv.label,enabled:true,cost:sv.cost,input:sv.input},raw?.effects));}
      for (const g of parts.hero.gear) if (!g.equipped) push({ type: 'equip', iid: g.iid, id: g.id, diff: g.diff });
      push({ type: 'setSpells', slots: PREPARED_SPELL_SLOTS, learned: s.spells.learned });
      A.push(...itemActions(content, s));
      push({ type: 'leaveInn' });
      break;
    }
    case 'bossOffer':
      push({ type: 'challenge', itemOptions:attachedItems(content,s,'challengeConfirm') });
      push({ type: 'skip' });
      break;
    case 'battle': {
      const b = parts.battle;
      if (b.stage !== 'fight') break;
      const needTarget = !!b.targets;
      const attackChoices=battleScenarioChoices(content,s,'attack');
      const guardChoices=battleScenarioChoices(content,s,'guard');
      if(attackChoices.length) attackChoices.forEach(c=>push({type:'attack',choiceId:c.id,label:c.label}));
      else if(needTarget&&s.battle.flags.doubleTargetRound===s.battle.round)push({type:'attack',needsTargets:true});
      else if (needTarget) b.targets.forEach((t) => push({ type: 'attack', target: t.index, footprint: t.footprint }));
      else push({ type: 'attack' });
      if(guardChoices.length) guardChoices.forEach(c=>push({type:'guard',choiceId:c.id,label:c.label}));
      else push({ type: 'guard' });
      for (const sp of b.spells) A.push({ type: 'spell', spellId: sp.id, name: sp.name, cost: sp.cost, mpAfter: sp.mpAfter, enabled: sp.enabled, reason: sp.reason, reasonText: sp.reasonText, needsTarget: needTarget && (sp.kind === 'attack' || sp.kind === 'finisher') });
      for (const it of b.items) A.push({ type: 'item', ...it });
      for (const ex of b.extraActions) push({ type: 'extra', id: ex.id, label: ex.label });
      A.push({ type: 'flee', itemOptions:b.canFlee?attachedItems(content,s,'flee'):[], enabled: b.canFlee, reason: b.canFlee ? undefined : 'noFlee', reasonText: b.canFlee ? undefined : '逃げられません' });
      break;
    }
    case 'battleReward':
      A.push(...itemActions(content,s));
      push({ type: 'continue' });
      break;
    case 'gate': {
      if(s.prompt?.kind==='choice'){for(const o of parts.prompt.options)A.push({type:'chooseOption',optionId:o.optionId,label:o.label,enabled:o.enabled,reasonText:o.reasonText,cost:o.cost,input:o.input});
      if(s.prompt?.kind==='choice')for(const option of parts.prompt.options.filter(o=>o.enabled)){const raw=s.prompt.options.find(o=>o.id===option.optionId);A.push(...receiptActions(content,s,{type:'chooseOption',optionId:option.optionId,label:option.label,enabled:true,cost:option.cost,input:option.input},raw.effects,s.prompt.cont?.vars));}
      break;}
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
