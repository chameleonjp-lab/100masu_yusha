import {temporaryStatusView} from './status.js';
// Consumable use: legality (by dry run), consumption, the die-adjust / shop / reveal ops.
//
// A script `use` = { where:[...], inputs?, requires?, effects, label?, consume? }. Legality is decided by
// running the effects on a throw-away clone, so "no target -> not consumed" falls out of an EngineError.

import { puzzleAssistInputs, puzzleAssistProbe } from './puzzles.js';
import { EngineError, clone, fail } from './util.js';
import { bagRemoveOne, itemCount, changeMp, maxMpOf } from './core.js';
import { evalCond, evalExpr, currentDie } from './expr.js';
import { newScope, register, runEffects, envOf } from './runner.js';
import { REASON_TEXT, substituteTradeOption } from './options.js';
import { forcedStopFor, landingWays, moveTarget } from './board.js';
import { makeCtx } from './core.js';

export function whereOf(s) {
  switch (s.phase) {
    case 'board': return 'board';
    case 'rolled': return 'afterRoll';
    case 'inn': return s.afterRest?.pos===s.event?.pos ? 'afterRest' : 'inn';
    case 'gate': return 'gate';
    case 'battle': return 'battle';
    case 'battleReward': return s.battle?.result === 'win' && s.hp > 0 ? 'victoryConfirm' : null;
    case 'event':
      if (s.event?.puzzle && !s.event.puzzle.resolved) return s.event.puzzle.pendingWrong !== null ? 'puzzleWrong' : 'puzzle';
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
  if(where==='battle' && ctx.s.battle?.scenario?.itemDisabledWhen && evalCond({ctx},ctx.s.battle.scenario.itemDisabledWhen))return {error:'item_disabled_this_turn'};
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
  if(where==='afterRest' && !(script.uses || []).some(u=>u.where.includes('afterRest'))) where='inn';
  if(where==='victoryConfirm' && (s.phase!=='battleReward'||s.battle?.result!=='win'||s.hp<=0||s.battle.victoryItemUsed)) fail('victory_item_not_now');
  const picked = pickUse(ctx, script, where, params);
  if(where==='afterRest' && s.afterRest?.pos!==s.event?.pos) fail('item_not_now');
  if (picked.error) fail(`item_${picked.error}`, itemId, { reason: picked.error });
  const use = picked.use;
  if(s.phase==='inn') delete s.afterRest;
  bagRemoveOne(s, itemId); // consumed first; a thrown EngineError aborts the whole dispatch
  ctx.emit({ t: 'itemUsed', id: itemId, where });
  const scope = newScope({ kind: 'item', itemId }, { vars: { ...(params || {}) }, itemId, where });
  const status = runEffects(ctx, use.effects || [], scope);
  if(where==='victoryConfirm') s.battle.victoryItemUsed=true;
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
  const puzzleDef = content.scripts.events[s.event?.eventId]?.puzzle;
  const isPuzzleAssist = (script.uses || []).some(u=>(u.effects || []).some(op=>op.op==='puzzleAssist'));
  let inputs = puzzleDef && isPuzzleAssist ? puzzleAssistInputs(puzzleDef,itemId) : [];
  let previewParams = inputs.length && params === undefined ? puzzleAssistProbe(puzzleDef,itemId) : (params || {});
  const statusKinds={HE26:{statusId:'turnEndHpLoss'},HE32:{statusId:'defenseDown'},HE46:{attackId:'attackDown',defenseId:'defenseDown'}}[itemId];
  if(statusKinds && where==='battle'){
    inputs=[];previewParams={...(params || {})};
    const statuses=temporaryStatusView(s);
    for(const [id,kind] of Object.entries(statusKinds)){
      const candidates=statuses.filter(x=>(x.kinds || [x.kind]).includes(kind));
      if(candidates.length>1){
        inputs.push({id,type:'enum',values:candidates.map(x=>x.id),labels:Object.fromEntries(candidates.map(x=>[x.id,x.label || x.id]))});
        if(params===undefined)previewParams[id]=candidates[0].id;
      }
    }
  }
  const probe = clone(s);
  const ctx = makeCtx(content, probe, { rolls: [0.5, 0.5, 0.5, 0.5] });
  try {
    applyItemUse(ctx, itemId, previewParams, where);
    out.enabled = true;
    if(inputs.length){out.needsInput=true;out.inputs=inputs;}
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

register('substituteTradeItem', (ctx, op, scope) => {
  if(scope.origin?.itemId !== 'BD36' || !ctx.pendingTrade) fail('trade_not_now');
  ctx.pendingTrade.option = substituteTradeOption(ctx,ctx.pendingTrade.original,scope.vars.substituteId);
});

register('convertRecovery',(ctx,op,scope)=>{
 const pending=ctx.pendingRecovery,groups=scope.vars.groups;
 if(scope.origin?.itemId!=='BD17'||!pending||ctx.s.prompt?.kind!=='recoveryConfirm')fail('recovery_not_now');
 if(!Number.isInteger(groups)||groups<1||groups>4||groups*2>pending.delta||groups>maxMpOf(ctx.content,ctx.s)-ctx.s.mp)fail('recovery_bad_groups');
 pending.delta-=groups*2;changeMp(ctx,groups,0,{reason:'BD17'});
});
register('reserveRecoveryShield',(ctx,op,scope)=>{
 const pending=ctx.pendingRecovery,amount=scope.vars.amount;
 if(scope.origin?.itemId!=='BD38'||!pending||ctx.s.prompt?.kind!=='recoveryConfirm')fail('recovery_not_now');
 if(!Number.isInteger(amount)||amount<1||amount>10||amount>pending.delta)fail('recovery_bad_amount');
 runEffects(ctx,[{op:'reserve',slot:'nextBattle',unique:'BD38',label:'BD38',withinMoves:2,rules:[{id:'BD38-shield',hook:'enemyDamage',stage:'card',when:true,uses:1,effects:[{op:'reduceDamage',amount}]}]}],scope);
 pending.delta-=amount;
});

register('consumeReceivedItem',(ctx,op,scope)=>{
 if(scope.origin?.itemId!=='BD06'||!ctx.receiptAction)fail('receipt_not_now');
 ctx.pendingReceipt={id:scope.vars.receivedId,params:{...scope.vars},used:false};
});
/** Use an offered instant healing consumable without bag insertion or consumption of an owned copy. */
export function consumeOfferedHealing(ctx,id){
 const pending=ctx.pendingReceipt;
 if(!pending)return false;
 if(pending.used||pending.id!==id||ctx.content.items[id]?.category!=='回復用')fail('receipt_bad_item');
 const script=ctx.content.scripts.items[id];
 if(!script)fail('receipt_unscripted');
 const pick=pickUse(ctx,script,'inn',pending.params);
 if(pick.error)fail('receipt_'+pick.error);
 const effects=pick.use.effects || [];
 const safe=list=>list.every(e=>['hp','mp','loseItem'].includes(e.op)||(e.op==='if'&&safe(e.then || [])&&safe(e.else || [])));
 if(!safe(effects))fail('receipt_not_immediate');
 const scope=newScope({kind:'item',itemId:id},{vars:pending.params});
 const beforeHp=ctx.s.hp,beforeMp=ctx.s.mp;
 const result=runEffects(ctx,effects,scope);
 if(result!=='done')fail('receipt_not_immediate');
 if(ctx.s.hp<=beforeHp&&ctx.s.mp<=beforeMp)fail('receipt_no_recovery');
 pending.used=true;
 ctx.emit({t:'offeredItemUsed',id,via:'BD06'});
 return true;
}

/** Read-only preview for BD06 candidate UI; no engine dispatch import/cycle. */
export function receivedItemStatus(content,s,receivedId,params){
 const out={enabled:false,receivedId,inputs:[],reason:'receipt_not_now'};
 if(!s.bag.includes('BD06'))return out;
 const use=content.scripts.items[receivedId]?.uses?.find(u=>u.where.includes('inn'));
 if(!use || content.items[receivedId]?.category!=='回復用')return out;
 out.inputs=(use.inputs || []).map(input=>input.type==='string'&&input.id==='partner'?{...input,type:'enum',values:[...new Set(s.bag)].filter(id=>id!=='BD06'&&id!=='HE47'&&content.items[id]?.category==='回復用')}:{...input});
 let trials=params===undefined?[{}]:[params];
 if(params===undefined)for(const spec of out.inputs){
  const values=spec.type==='enum'?spec.values:spec.type==='int'&&spec.max-spec.min<=16?Array.from({length:spec.max-spec.min+1},(_,i)=>spec.min+i):[];
  trials=trials.flatMap(p=>values.map(v=>({...p,[spec.id]:v})));
 }
 for(const vars of trials){
  const ctx=makeCtx(content,clone(s));bagRemoveOne(ctx.s,'BD06');ctx.pendingReceipt={id:receivedId,params:vars,used:false};
  try{consumeOfferedHealing(ctx,receivedId);return {...out,enabled:true,reason:undefined,needsInput:out.inputs.length>0};}
  catch(e){if(!(e instanceof EngineError))throw e;out.reason=e.code;}
 }
 return out;
}

register('prepareGearBonus',(ctx,op,scope)=>{
 const s=ctx.s,p=s.prompt;
 if(scope.origin?.itemId!=='BD28'||p?.kind!=='gearConfirm'||!['event','chest'].includes(s.phase)||s.gear.some(g=>g.id===p.gearId)||p.paidGold>0)fail('gear_receipt_not_now');
 if(s.reservations.some(r=>r.unique==='BD28'))fail('already_reserved');
 ctx.gearReceiptBonus=true;
});
register('declareFirstAction',(ctx,op,scope)=>{
 const s=ctx.s,declaration=scope.vars.declaration;
 if(scope.origin?.itemId!=='BD46'||!ctx.challengeItemAction||s.phase!=='bossOffer'||!s.offer||s.offer.enemyId==='DK01')fail('challenge_item_not_now');
 if(!['attack','guard'].includes(declaration))fail('bad_declaration');
 const attack=declaration==='attack';
 const rule={id:'BD46-'+declaration,hook:attack?'heroAttackDamage':'enemyDamage',stage:'card',uses:1,
  when:{and:[{eq:[{ref:'battle.heroAction',abs:1},declaration]},...(attack?[{eq:[{ref:'battle.round'},1]},{eq:[{ref:'battle.attackKind'},'attack']}]:[true])]},
  effects:[{op:attack?'addDamage':'reduceDamage',amount:12}]};
 s.offer.params.rules=[...(s.offer.params.rules || []),rule];
});
