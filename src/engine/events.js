import {finishTrapItem} from './trap-items.js';
// Landing on squares, event options/prompts, chests, bag-full flow.

import { recordLandingKind, finishLandingKinds } from './landing-kind-items.js';
import { clone, fail } from './util.js';
import { knowsSpell, jobDef, ownsGear, bagRemoveOne } from './core.js';
import { arriveAtInn } from './inn.js';
import { grantGear, grantItem, learnSpell } from './ops-basic.js';
import { applyCost, findOption, optionStatus } from './options.js';
import { newScope, runEffects, register } from './runner.js';

import { createPuzzleState, assistPuzzle, resolvePuzzleAnswer, commitPendingWrong } from './puzzles.js';

export const ORIGIN_HANDLERS = Object.create(null); // kind -> (ctx, origin) => void ; registered by battle.js ('reward')

export function resetTurn(s) {
  s.turn = { die: null, rawDie: null, adjustUsed: false, preRoll: null };
  s.roll = null;
}

export function toBoard(ctx) {
  const s = ctx.s;
  s.phase = 'board';
  s.event = null;
  s.chest = null;
  s.prompt = null;
  s.offer = null;
  resetTurn(s);
}

// ---- landing -----------------------------------------------------------------------

export function landOn(ctx, pos) {
  const s = ctx.s;
  const content = ctx.content;
  s.pos = pos;
  if (pos === 100) {
    s.phase = 'gate';
    s.event = null;
    ctx.emit({ t: 'castleReached', pos: 100 });
    return;
  }
  const sq = s.board.squares[pos - 1];
  const ev = content.events[sq.contentId];
  recordLandingKind(ctx,pos,ev.kind);
  ctx.emit({ t: 'landed', pos, eventId: ev.id, kind: ev.kind, name: ev.name });
  if (ev.kind === '宿場') {
    if (!content.scripts.events[ev.id] && !s.unscripted.includes(ev.id)) s.unscripted.push(ev.id);
    arriveAtInn(ctx, pos);
    return;
  }
  startEvent(ctx, pos, ev);
}

function startEvent(ctx, pos, ev) {
  const s = ctx.s;
  const script = ctx.content.scripts.events[ev.id];
  s.event = { pos, eventId: ev.id, kind: ev.kind, stage: 'land' };
  s.phase = 'event';
  if (!script) {
    s.event.unscripted = true;
    if (!s.unscripted.includes(ev.id)) s.unscripted.push(ev.id);
    ctx.emit({ t: 'unscripted', id: ev.id });
    return;
  }
  if (script.puzzle) s.event.puzzle = createPuzzleState(script.puzzle);
  const scope = newScope({ kind: 'event', pos, eventId: ev.id });
  const r = runEffects(ctx, script.onLand || [], scope);
  if (r !== 'done') return;
  presentOptions(ctx, script);
}

function presentOptions(ctx, script) {
  const s = ctx.s;
  const origin = { kind: 'event', pos: s.event.pos, eventId: s.event.eventId };
  if (script.puzzle && script.puzzle.kind !== 'choice') {
    s.event.stage = 'puzzle';
    s.prompt = { kind: 'puzzle' };
    return;
  }
  if (script.options && script.options.length) {
    s.event.stage = 'options';
    s.prompt = { kind: 'choice', top: true, title: null, options: clone(script.options), cont: { rest: [], vars: {}, origin } };
    return;
  }
  finishEvent(ctx);
}

export function finishEvent(ctx) {
  finishSquare(ctx);
}

export function finishSquare(ctx) {
  const s = ctx.s;
  const pos = s.pos;
  finishLandingKinds(ctx);
  s.done[pos] = true;
  s.event = null;
  s.prompt = null;
  const ch = s.chests[pos];
  if (ch && !ch.opened) {
    openChest(ctx, pos);
    return;
  }
  toBoard(ctx);
}

// ---- prompt answers -------------------------------------------------------------------

export function completeOrigin(ctx, origin) {
  const s = ctx.s;
  switch (origin.kind) {
    case 'event': {
      const script = ctx.content.scripts.events[origin.eventId];
      if (s.event && s.event.stage === 'land' && script) return presentOptions(ctx, script);
      return finishEvent(ctx);
    }
    case 'gate':
      s.phase='gate';
      return undefined;
    case 'service':
      s.phase = 'inn';
      return undefined;
    case 'chest':
      return finishChest(ctx, origin.pos, origin.picked);
    default: {
      const h = ORIGIN_HANDLERS[origin.kind];
      if (h) return h(ctx, origin);
      return undefined;
    }
  }
}

function continueCont(ctx, effects, cont) {
  const scope = newScope(cont.origin, { vars: cont.vars });
  const r = runEffects(ctx, effects, scope);
  if (r === 'done') completeOrigin(ctx, cont.origin);
  return r;
}

export function chooseOption(ctx, optionId, input) {
  const puzzle = ctx.s.event?.puzzle;
  if (puzzle && ctx.s.prompt?.top && !puzzle.resolved) {
    const def = ctx.content.scripts.events[ctx.s.event.eventId].puzzle;
    const result = resolvePuzzleAnswer(def, puzzle, optionId, { offerRetry: ctx.s.bag.includes('BD39') });
    ctx.s.event.puzzle = result.state;
    if (result.outcome === 'wrongPending') { ctx.s.event.pendingPuzzleOption = { optionId, input }; return; }
  }
  return applyChosenOption(ctx,optionId,input);
}
function applyChosenOption(ctx, optionId, input) {
  const s = ctx.s;
  const p = s.prompt;
  if (!p || p.kind !== 'choice') fail('illegal_action', 'no choice pending');
  const opt = findOption(p.options, optionId);
  const cont = p.cont;
  const scope0 = newScope(cont.origin, { vars: cont.vars });
  const st = optionStatus(ctx, scope0, opt, input, true);
  if (!st.enabled) fail(`option_${st.reason}`, optionId);
  s.prompt = null;
  if (p.top && s.event) s.event.stage = 'option';
  const isTrap = !!(s.event && s.event.kind === '罠');
  applyCost(ctx, opt.cost, isTrap);
  finishTrapItem(ctx);
  const vars = { ...cont.vars };
  if (opt.input) vars[opt.input.var] = input;
  ctx.emit({ t: 'optionChosen', id: optionId });
  return continueCont(ctx, [...(opt.effects || []), ...cont.rest], { ...cont, vars });
}

export function pickBagItem(ctx, index) {
  const s = ctx.s;
  const p = s.prompt;
  if (!p || p.kind !== 'pickBagItem') fail('illegal_action', 'no pick pending');
  if (!Number.isInteger(index) || index < 0 || index >= s.bag.length) fail('bad_index', String(index));
  const id = s.bag.splice(index, 1)[0];
  ctx.emit({ t: 'itemLost', id, reason: p.reason || 'loss' });
  s.prompt = null;
  return continueCont(ctx, p.cont.rest, p.cont);
}

export function bagSwap(ctx, index) {
  const s = ctx.s;
  const p = s.prompt;
  if (!p || p.kind !== 'bagFull') fail('illegal_action', 'no bag prompt pending');
  if (!Number.isInteger(index) || index < 0 || index >= s.bag.length) fail('bad_index', String(index));
  const out = s.bag.splice(index, 1)[0];
  s.bag.push(p.itemId);
  ctx.emit({ t: 'itemLost', id: out, reason: 'swap' });
  ctx.emit({ t: 'itemGained', id: p.itemId, source: 'swap' });
  s.phase = p.prevPhase || 'event';
  s.prompt = null;
  return continueCont(ctx, p.cont.rest, p.cont);
}

export function bagDecline(ctx) {
  const s = ctx.s;
  const p = s.prompt;
  if (!p || p.kind !== 'bagFull') fail('illegal_action', 'no bag prompt pending');
  ctx.emit({ t: 'itemForfeited', id: p.itemId, reason: 'declined' });
  s.phase = p.prevPhase || 'event';
  s.prompt = null;
  if (p.cont.origin.kind === 'chest') {
    // the chest stays open: pick again or skip
    s.phase = 'chest';
    return 'chest';
  }
  return continueCont(ctx, p.cont.rest, p.cont);
}

export function skipUnscripted(ctx) {
  const s = ctx.s;
  if (!s.event || !s.event.unscripted) fail('illegal_action', 'event is scripted');
  ctx.emit({ t: 'unscriptedSkipped', id: s.event.eventId });
  finishEvent(ctx);
}

// ---- chests ----------------------------------------------------------------------------

export function chestChoiceCount(content, s) {
  const j = jobDef(content, s);
  return j.chestChoices || content.base.mapPolicy.chestChoices['通常'];
}

export function openChest(ctx, pos) {
  const s = ctx.s;
  const content = ctx.content;
  const tre = s.board.squares[pos - 1].treasure;
  const n = chestChoiceCount(content, s);
  const shown = [];
  const fallbacks = [...tre.fallbackItemIds];
  const unavailable = (id) => (content.gear[id] && ownsGear(s, id)) || (content.spells[id] && knowsSpell(s, id));
  for (const id of tre.candidateIds.slice(0, n)) {
    if (unavailable(id)) {
      let fb = null;
      while (fallbacks.length) {
        const c = fallbacks.shift();
        if (!shown.includes(c) && !tre.candidateIds.slice(0, n).includes(c)) {
          fb = c;
          break;
        }
      }
      shown.push(fb || id);
    } else shown.push(id);
  }
  s.chests[pos] = { opened: true, shown: [...shown], taken: null };
  s.chest = { pos, shown: [...shown] };
  s.phase = 'chest';
  ctx.emit({ t: 'chestOpened', pos, shown: [...shown], choices: n });
}

export function pickChest(ctx, index) {
  const s = ctx.s;
  if (s.phase !== 'chest' || !s.chest) fail('illegal_action', 'no chest');
  if (s.chests[s.chest.pos].taken) fail('chest_taken');
  const id = s.chest.shown[index];
  if (id === undefined) fail('bad_index', String(index));
  const pos = s.chest.pos;
  const content = ctx.content;
  if(content.gear[id] && s.bag.includes('BD28') && !ownsGear(s,id)){
    s.prompt={kind:'gearConfirm',gearId:id,paidGold:null,from:'chest',cont:{rest:[],vars:{},origin:{kind:'chest',pos,picked:id}}};return;
  }
  if (content.gear[id]) grantGear(ctx, id, null, 'chest');
  else if (content.spells[id]) learnSpell(ctx, id);
  else {
    const r = grantItem(ctx, id, 'chest');
    if (r.pause) {
      s.prompt = { ...r.pause, prevPhase: 'chest', cont: { rest: [], vars: {}, origin: { kind: 'chest', pos, picked: id } } };
      s.phase = 'bagFull';
      return;
    }
  }
  s.chests[pos].taken = id;
  finishChest(ctx, pos);
}

export function finishChest(ctx, pos, picked) {
  const rec = ctx.s.chests[pos];
  if (picked) rec.taken = picked; // bagFull swap path carries the picked id in the prompt origin
  ctx.emit({ t: 'chestTaken', pos, id: rec.taken });
  toBoard(ctx);
}

export function skipChest(ctx) {
  const s = ctx.s;
  if (s.phase !== 'chest' || !s.chest) fail('illegal_action', 'no chest');
  const pos = s.chest.pos;
  s.chests[pos].taken = null;
  s.chests[pos].skipped = true;
  ctx.emit({ t: 'chestSkipped', pos });
  toBoard(ctx);
}

void bagRemoveOne;

// Puzzle helpers do not execute rewards during previews or the retry window.
register('puzzleAssist', (ctx,op,scope) => {
  const state=ctx.s.event?.puzzle, def=ctx.content.scripts.events[ctx.s.event?.eventId]?.puzzle;
  if(!state||!def||ctx.s.phase!=='event') fail('puzzle_assist_unavailable');
  const result=assistPuzzle(def,state,op.itemId || scope.itemId,scope.vars || {});
  ctx.s.event.puzzle=result.state;
  if((op.itemId || scope.itemId)==='BD39') delete ctx.s.event.pendingPuzzleOption;
  ctx.emit({t:'puzzleHint',...result.hint});
});
export function answerPuzzle(ctx,answer) {
  const s=ctx.s,script=ctx.content.scripts.events[s.event?.eventId];
  if(s.phase!=='event'||s.prompt?.kind!=='puzzle'||!script?.puzzle) fail('puzzle_not_now');
  const result=resolvePuzzleAnswer(script.puzzle,s.event.puzzle,answer,{offerRetry:s.bag.includes('BD39')});
  s.event.puzzle=result.state;
  if(result.outcome==='wrongPending') return;
  return finishPuzzleOutcome(ctx,script,result.outcome);
}
function finishPuzzleOutcome(ctx,script,outcome) {
  const s=ctx.s,origin={kind:'event',pos:s.pos,eventId:s.event.eventId};
  s.prompt=null;s.event.stage='option';
  return continueCont(ctx,outcome==='correct'?(script.puzzle.onCorrect || []):(script.puzzle.onWrong || []),{origin,vars:{},rest:[]});
}
export function commitPuzzleWrong(ctx) {
  const s=ctx.s,script=ctx.content.scripts.events[s.event?.eventId];
  if(s.phase!=='event'||!script?.puzzle) fail('puzzle_not_now');
  const result=commitPendingWrong(script.puzzle,s.event.puzzle);s.event.puzzle=result.state;
  const pending=s.event.pendingPuzzleOption;
  if(pending){delete s.event.pendingPuzzleOption;return applyChosenOption(ctx,pending.optionId,pending.input);}
  return finishPuzzleOutcome(ctx,script,'wrong');
}

export function confirmRecovery(ctx,delta) {
 const p=ctx.s.prompt;
 if(ctx.s.phase!=='event'||p?.kind!=='recoveryConfirm')fail('recovery_not_now');
 ctx.s.prompt=null;
 return continueCont(ctx,[{...p.recoveryOp,delta,recoveryConfirmed:true},...p.cont.rest],p.cont);
}

export function confirmGear(ctx){
 const p=ctx.s.prompt;
 if(p?.kind!=='gearConfirm'||!['event','chest'].includes(ctx.s.phase))fail('gear_receipt_not_now');
 ctx.s.prompt=null;
 grantGear(ctx,p.gearId,p.paidGold,p.from);
 return continueCont(ctx,p.cont.rest,p.cont);
}
