import {prepareTrapItem} from './trap-items.js';
import {tickInfoMarks} from './info-items.js';
// Engine entry: createRun / dispatch / view. See docs/dev/engine-api.md.

import { EngineError, clone, fail } from './util.js';
import './ops-basic.js';
import './items.js';
import './battle.js';
import {
  PREPARED_SPELL_SLOTS,
  addXp,
  gearInstance,
  knowsSpell,
  makeCtx,
  slotOfGear,
} from './core.js';
import { moveTarget } from './board.js';
import { normCost } from './options.js';
import { evalCond } from './expr.js';
import {
  acceptRetry,
  battleAction,
  challengeKing,
  challengeOffer,
  continueReward,
  declineRetry,
  resumeBattle,
  runHook,
  skipOffer,
} from './battle.js';
import {
  bagDecline,
  bagSwap,
  chooseOption,
  confirmRecovery,
  confirmGear,
  answerPuzzle,
  commitPuzzleWrong,
  finishEvent,
  landOn,
  pickBagItem,
  pickChest,
  skipChest,
  skipUnscripted,
} from './events.js';
import { checkLeaveInn, doBuy, doChangeJob, doRecruit, doRest, doSellGear, doSellItem, doService } from './inn.js';
import { applyItemUse, applyPreRollRule, whereOf } from './items.js';
import { newScope, runEffects } from './runner.js';
import { createRun, boardFromExample, RULES_VERSION, SCHEMA_VERSION } from './state.js';
import { view } from './view.js';

export { createRun, boardFromExample, view, EngineError, RULES_VERSION, SCHEMA_VERSION };
export { generateBoard, checkBoard, minRollsForBoard, moveTarget, nextStopPos, landingWays } from './board.js';
export { maxHpOf, maxMpOf, attackOf, defenseOf, xpToNext } from './core.js';
export { itemStatus } from './items.js';
export { compareResults, rankResults, applyRunToMeta, createMeta, resultKey } from './results.js';
export { itemSellPrice, gearSellPrice } from './inn.js';
export { previewMove } from './view.js';

const MAX_OPS = 120;

function requirePhase(s, ...phases) {
  if (!phases.includes(s.phase)) fail('illegal_action', `phase ${s.phase}`);
  if (s.prompt && !['choice', 'pickBagItem', 'bagFull'].includes(s.prompt.kind)) fail('illegal_action', 'prompt pending');
}
function noPrompt(s) {
  if (s.prompt) fail('illegal_action', `prompt ${s.prompt.kind} pending`);
}

function doRoll(ctx) {
  const s = ctx.s;
  requirePhase(s, 'board');
  noPrompt(s);
  const raw = 1 + ctx.drawInt(6);
  const die = applyPreRollRule(s, raw);
  s.rolls += 1;
  s.turn.rawDie = raw;
  s.roll = { raw, die, adjust: null, from: s.pos };
  s.phase = 'rolled';
  ctx.emit({ t: 'dieRolled', raw, die, rolls: s.rolls });
}

function runMoveRules(ctx, rules, moveCtx) {
  for (const rule of rules) {
    const env = { ctx, vars: {}, move: moveCtx };
    if (rule.hook !== undefined && rule.hook !== 'moveConfirm') continue;
    if (!evalCond(env, rule.when)) continue;
    runEffects(ctx, rule.effects || [], newScope({ kind: 'rule', owner: 'reservation' }, { move: moveCtx }));
  }
}

function doMove(ctx, action) {
  const s = ctx.s;
  requirePhase(s, 'rolled');
  noPrompt(s);
  if (action.adjust) {
    const a = action.adjust;
    const { status } = applyItemUse(ctx, a.itemId, a.params || {}, 'afterRoll');
    if (status !== 'done') fail('adjust_prompt');
  }
  const { raw, die, from } = s.roll;
  const to = moveTarget(s, die, from);
  const steps = to - from;
  const discarded = die - steps;
  const innStop = s.inns[to] && !s.inns[to].visited;
  const stop = to === 100 ? 'castle' : innStop ? 'inn' : 'normal';
  const adjust = s.roll.adjust;
  s.turn.die = die;
  s.turn.rawDie = raw;
  s.roll = null;
  s.furthest = Math.max(s.furthest, to);
  ctx.emit({ t: 'moved', from, to, steps, discarded, die, raw, stop, xp: steps });
  addXp(ctx, steps, 'walk');
  const moveCtx = { die, steps, discarded, stop, from, to, adjustItem: adjust ? adjust.itemId : null, adjustDelta: adjust ? adjust.delta : null };
  // gear (equipped) rules on the move
  runGearMoveHooks(ctx, moveCtx);
  // reservations: thisMove rules, arrival effects, expiry
  const keep = [];
  for (const r of s.reservations) {
    if (r.slot === 'thisMove') {
      runMoveRules(ctx, r.rules, moveCtx);
      continue;
    }
    r.movesUsed += 1;
    if (r.withinMoves !== null && r.movesUsed > r.withinMoves) {
      ctx.emit({ t: 'reservationExpired', rid: r.rid, label: r.label });
      continue;
    }
    if (r.slot === 'arrival' && r.pos === to) {
      runEffects(ctx, r.effects, newScope({ kind: 'rule', owner: 'reservation' }, { move: moveCtx }));
      ctx.emit({ t: 'reservationApplied', rid: r.rid, label: r.label });
      continue;
    }
    keep.push(r);
  }
  s.reservations = keep;
  s.reveals = s.reveals.filter(rec => {
    if (rec.remainingMoves === undefined) return true;
    rec.remainingMoves -= 1;
    return rec.remainingMoves > 0;
  });
  tickInfoMarks(ctx.content,s,to);
  s.lastDie = die;
  landOn(ctx, to);
}

function runGearMoveHooks(ctx, moveCtx) {
  runHook(ctx, 'moveConfirm', {}, { move: moveCtx });
}

function doEquip(ctx, iid) {
  const s = ctx.s;
  if (!['board', 'inn', 'gate'].includes(s.phase) && !(s.phase === 'retryOffer' && s.retry.stage === 'prep')) fail('illegal_action', `cannot change equipment in phase ${s.phase}`);
  noPrompt(s);
  const inst = gearInstance(s, iid);
  if (!inst) fail('not_owned', String(iid));
  const slot = slotOfGear(ctx.content.gear[inst.id]);
  const before = s.equipped[slot];
  if (before === iid) fail('already_equipped');
  s.equipped[slot] = iid;
  ctx.emit({ t: 'equipped', slot, iid, id: inst.id, before: before ? gearInstance(s, before).id : null });
}

function doSetSpells(ctx, ids) {
  const s = ctx.s;
  if (!['board', 'inn', 'gate'].includes(s.phase) && !(s.phase === 'retryOffer' && s.retry.stage === 'prep')) fail('illegal_action', `cannot prepare spells in phase ${s.phase}`);
  noPrompt(s);
  if (!Array.isArray(ids) || ids.length > PREPARED_SPELL_SLOTS || new Set(ids).size !== ids.length) fail('bad_spells');
  for (const id of ids) if (!knowsSpell(s, id)) fail('spell_unknown', id);
  s.spells.prepared = [...ids];
  ctx.emit({ t: 'spellsPrepared', ids: [...ids] });
}

function doUseItem(ctx, action) {
  const s = ctx.s;
  if (s.phase === 'battle') return battleAction(ctx, { type: 'item', itemId: action.itemId, params: action.params, target: action.target });
  const where = whereOf(s);
  if (!where) fail('illegal_action', `cannot use items in phase ${s.phase}`);
  if (!['trap','puzzle','puzzleWrong'].includes(where)) noPrompt(s);
  ctx.negateTrap = false;
  const { status } = applyItemUse(ctx, action.itemId, action.params || {}, where);
  if (status !== 'done') fail('item_prompt', action.itemId);
  if (ctx.negateTrap) {
    if (!s.event || s.event.kind !== '罠') fail('item_not_now', action.itemId);
    s.prompt = null;
    ctx.emit({ t: 'trapAvoided', pos: s.event.pos });
    finishEvent(ctx);
  }
  return undefined;
}

const ACTIONS = {
  roll: (ctx) => doRoll(ctx),
  move: (ctx, a) => doMove(ctx, a),
  useItem: (ctx, a) => doUseItem(ctx, a),
  equip: (ctx, a) => doEquip(ctx, a.iid),
  setSpells: (ctx, a) => doSetSpells(ctx, a.ids),
  chooseOption: (ctx, a) => {
    if(['BD19','BD20','BD25'].includes(a.itemId)){
      const original=ctx.s.prompt?.options?.find(o=>o.id===a.optionId);
      if(!ctx.s.prompt?.top)fail('trap_item_not_now');
      prepareTrapItem(ctx,original);
      const used=applyItemUse(ctx,a.itemId,a.params || {},'trapChoice');
      if(used.status!=='done')fail('item_prompt');
      ctx.s.prompt.options=ctx.s.prompt.options.map(o=>o.id===a.optionId?ctx.pendingTrap.option:o);
    } else if(a.itemId === 'BD06'){
      if(!ctx.s.prompt || ctx.s.prompt.kind!=='choice')fail('receipt_not_now');
      ctx.receiptAction=true;
      const used=applyItemUse(ctx,'BD06',a.params || {},'receiveItem');
      if(used.status!=='done')fail('item_prompt');
    } else if(a.itemId === 'BD36') {
      const original=ctx.s.prompt?.options?.find(o=>o.id===a.optionId);
      ctx.pendingTrade={original};
      const used=applyItemUse(ctx,'BD36',a.params || {},'trade');
      if(used.status!=='done' || !ctx.pendingTrade.option) fail('trade_not_applied');
      ctx.s.prompt.options=ctx.s.prompt.options.map(o=>o.id===a.optionId?ctx.pendingTrade.option:o);
      delete ctx.pendingTrade;
    } else if(a.itemId) {
      const option=ctx.s.prompt?.options?.find(o=>o.id===a.optionId);
      const cost=normCost(option?.cost);
      if(ctx.s.event?.kind!=='罠' || !ctx.s.prompt?.top || !cost.hp) fail('trap_item_not_now');
      ctx.trapAid=hook=>{
        if(hook.loss<=0) fail('trap_no_loss');
        const result=applyItemUse(ctx,a.itemId,{...(a.params || {}),trapLoss:hook.loss,trapHasOtherCost:!!(cost.gold || cost.mp || cost.items?.length)},'trapLoss');
        if(result.status!=='done') fail('item_prompt');
      };
    }
    const result=chooseOption(ctx,a.optionId,a.input);
    if(ctx.trapAid || ctx.pendingTrap) fail('trap_item_not_applied');
    if(ctx.receiptAction && !ctx.pendingReceipt?.used)fail('receipt_not_applied');
    return result;
  },
  confirmGear: (ctx,a) => {
    if(a.itemId){
      if(a.itemId!=='BD28')fail('gear_receipt_bad_item');
      const result=applyItemUse(ctx,'BD28',a.params || {},'receiveGear');
      if(result.status!=='done')fail('item_prompt');
    }
    return confirmGear(ctx);
  },
  confirmRecovery: (ctx,a) => {
    const p=ctx.s.prompt;
    if(ctx.s.phase!=='event'||p?.kind!=='recoveryConfirm')fail('recovery_not_now');
    ctx.pendingRecovery={delta:p.amount};
    if(a.itemId){
      if(!['BD17','BD38'].includes(a.itemId))fail('recovery_bad_item');
      const result=applyItemUse(ctx,a.itemId,a.params || {},'recoveryConfirm');
      if(result.status!=='done')fail('item_prompt');
      ctx.s.event.recoveryItemUsed=true;
    }
    const delta=ctx.pendingRecovery.delta;delete ctx.pendingRecovery;
    return confirmRecovery(ctx,delta);
  },
  answerPuzzle: (ctx,a) => answerPuzzle(ctx,a.answer),
  commitPuzzleWrong: (ctx) => commitPuzzleWrong(ctx),
  pickBagItem: (ctx, a) => pickBagItem(ctx, a.index),
  skipUnscripted: (ctx) => skipUnscripted(ctx),
  pickChest: (ctx, a) => {
    if(a.itemId){
      if(a.itemId!=='BD06')fail('receipt_bad_item');
      ctx.receiptAction=true;
      const used=applyItemUse(ctx,'BD06',a.params || {},'receiveItem');
      if(used.status!=='done')fail('item_prompt');
    }
    const result=pickChest(ctx,a.index);
    if(ctx.receiptAction && !ctx.pendingReceipt?.used)fail('receipt_not_applied');
    return result;
  },
  skipChest: (ctx) => skipChest(ctx),
  bagSwap: (ctx, a) => bagSwap(ctx, a.index),
  bagDecline: (ctx) => bagDecline(ctx),
  // inn
  rest: (ctx,a) => doRest(ctx,a),
  buy: (ctx, a) => doBuy(ctx, a.slot),
  sellItem: (ctx, a) => doSellItem(ctx, a.index),
  sellGear: (ctx, a) => doSellGear(ctx, a.iid),
  changeJob: (ctx, a) => doChangeJob(ctx, a.jobId),
  recruit: (ctx, a) => doRecruit(ctx, a.companionId, a.replaceId, a),
  service: (ctx, a) => {
    if(a.itemId){
      if(a.itemId!=='BD06')fail('receipt_bad_item');
      ctx.receiptAction=true;
      const used=applyItemUse(ctx,'BD06',a.params || {},'receiveItem');
      if(used.status!=='done')fail('item_prompt');
    }
    const r = doService(ctx, a.serviceId, a.input);
    if(ctx.receiptAction && !ctx.pendingReceipt?.used)fail('receipt_not_applied');
    void r;
  },
  leaveInn: (ctx) => {
    checkLeaveInn(ctx);
    finishEvent(ctx);
  },
  // battle
  challenge: (ctx,a) => {
    if(a.itemId){
      if(a.itemId!=='BD46')fail('challenge_bad_item');
      ctx.challengeItemAction=true;
      const result=applyItemUse(ctx,'BD46',a.params || {},'challengeConfirm');
      if(result.status!=='done')fail('item_prompt');
    }
    return challengeOffer(ctx);
  },
  skip: (ctx) => skipOffer(ctx),
  challengeKing: (ctx) => challengeKing(ctx),
  attack: (ctx, a) => battleAction(ctx, { type: 'attack', target: a.target, targets:a.targets, choiceId: a.choiceId }),
  guard: (ctx,a) => battleAction(ctx, { type: 'guard', choiceId: a.choiceId }),
  spell: (ctx, a) => battleAction(ctx, { type: 'spell', spellId: a.spellId, target: a.target }),
  item: (ctx, a) => battleAction(ctx, { type: 'item', itemId: a.itemId, params: a.params, target: a.target }),
  flee: (ctx,a) => battleAction(ctx, { type: 'flee', itemId:a.itemId, params:a.params }),
  extra: (ctx, a) => battleAction(ctx, { type: 'extra', id: a.id }),
  continue: (ctx) => continueReward(ctx),
  retry: (ctx) => acceptRetry(ctx),
  resumeBattle: (ctx) => resumeBattle(ctx),
  declineRetry: (ctx) => declineRetry(ctx),
};

const PHASE_OF = {
  roll: ['board'],
  move: ['rolled'],
  chooseOption: ['event', 'inn', 'gate'],
  pickBagItem: ['event', 'inn'],
  skipUnscripted: ['event'],
  pickChest: ['chest'],
  skipChest: ['chest'],
  bagSwap: ['bagFull'],
  bagDecline: ['bagFull'],
  rest: ['inn'],
  buy: ['inn'],
  sellItem: ['inn'],
  sellGear: ['inn'],
  changeJob: ['inn'],
  recruit: ['inn'],
  service: ['inn'],
  leaveInn: ['inn'],
  challenge: ['bossOffer'],
  skip: ['bossOffer'],
  challengeKing: ['gate'],
  attack: ['battle'],
  guard: ['battle'],
  spell: ['battle'],
  item: ['battle'],
  flee: ['battle'],
  extra: ['battle'],
  continue: ['battleReward'],
  retry: ['retryOffer'],
  resumeBattle: ['retryOffer'],
  declineRetry: ['retryOffer'],
};

/**
 * dispatch(content, run, action, opts?) -> { state, effects, replay? }
 *   action = { type, opId?, ...params }
 *   opts.rolls: array of floats consumed before the run RNG (tests / injected rolls)
 * The input state is never modified. Illegal actions throw EngineError and change nothing.
 */
export function dispatch(content, run, action, opts = {}) {
  if (!action || typeof action.type !== 'string') fail('bad_action');
  if (action.opId && run.ops.includes(action.opId)) return { state: run, effects: [], replay: true };
  const handler = ACTIONS[action.type];
  if (!handler) fail('unknown_action', action.type);
  if (run.phase === 'finished') fail('illegal_action', 'run is finished');
  const allowed = PHASE_OF[action.type];
  if (allowed && !allowed.includes(run.phase)) fail('illegal_action', `${action.type} in phase ${run.phase}`);
  const s = clone(run);
  const ctx = makeCtx(content, s, opts);
  if(action.type!=='useItem') delete s.afterRest;
  handler(ctx, action);
  s.revision += 1;
  if (action.opId) {
    s.ops.push(action.opId);
    if (s.ops.length > MAX_OPS) s.ops.splice(0, s.ops.length - MAX_OPS);
  }
  return { state: s, effects: ctx.fx };
}

/** Whether a stored run can be resumed by this build (never auto-wipes; the caller decides what to do). */
export function checkCompat(content, run) {
  if (!run || run.schema !== SCHEMA_VERSION) return { ok: false, reason: 'unsupported-schema' };
  if (run.rulesVersion !== RULES_VERSION) return { ok: false, reason: 'unsupported-rules-version' };
  return { ok: true, contentChanged: run.contentVersion !== content.version };
}

void finishEvent;
void bagDecline;
void bagSwap;
void addXp;
