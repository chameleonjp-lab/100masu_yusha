// Options (event choices, choice prompts, inn services): legality, costs, disabled reasons.

import { EngineError, fail } from './util.js';
import { bagRemoveOne, changeGold, changeHp, changeMp, itemCount, ownsGear } from './core.js';
import { evalCond, evalExpr } from './expr.js';

export const REASON_TEXT = {
  insufficientGold: 'お金が足りません',
  missingItem: '必要な品を持っていません',
  insufficientMp: '魔力が足りません',
  alreadyOwned: 'すでに持っています',
  alreadyLearned: 'すでに覚えています',
  used: 'この宿ではもう使いました',
  inputInvalid: '入力が正しくありません',
  unscripted: 'この処理はまだ用意されていません',
  bagFull: '袋がいっぱいです',
  hpFull: '体力が満タンです',
  mpFull: '魔力が満タンです',
  nothingToRestore: '回復する分がありません',
  alreadyActive: 'すでに同じ効果が働いています',
  noTarget: '対象がありません',
  notNow: '今は使えません',
};

export function reasonText(code, custom) {
  if (custom) return custom;
  return REASON_TEXT[code] || code;
}

export function normCost(cost) {
  const c = cost || {};
  const out = {};
  if (c.gold !== undefined) out.gold = c.gold;
  if (c.hp !== undefined) out.hp = typeof c.hp === 'number' ? { amount: c.hp, floor: 1 } : { amount: c.hp.amount, floor: c.hp.floor === undefined ? 1 : c.hp.floor };
  if (c.mp !== undefined) {
    out.mp = typeof c.mp === 'number' ? { amount: c.mp, floor: 0, strict: false } : { amount: c.mp.amount, floor: c.mp.floor === undefined ? 0 : c.mp.floor, strict: !!c.mp.strict };
  }
  if (c.items) out.items = [...c.items];
  if (c.trapLoss) out.trapLoss = true;
  return out;
}

function costValues(env, cost) {
  const out = normCost(cost);
  if (out.gold !== undefined) out.gold = evalExpr(env, out.gold);
  if (out.hp) out.hp = { ...out.hp, amount: evalExpr(env, out.hp.amount) };
  if (out.mp) out.mp = { ...out.mp, amount: evalExpr(env, out.mp.amount) };
  return out;
}

function requireList(req) {
  if (req === undefined) return [];
  if (Array.isArray(req)) return req.map((r) => (r && r.when !== undefined ? r : { when: r, reason: 'notNow' }));
  return [{ when: req, reason: 'notNow' }];
}

export function inputSpec(opt) {
  return opt.input || null;
}

function inputError(spec, value) {
  if (!spec) return value === undefined ? null : null;
  if (value === undefined || value === null) return 'inputInvalid';
  if (spec.type === 'int') return Number.isInteger(value) && value >= spec.min && value <= spec.max ? null : 'inputInvalid';
  if (spec.type === 'enum') return spec.values.some((v) => JSON.stringify(v) === JSON.stringify(value)) ? null : 'inputInvalid';
  return null;
}

/**
 * Evaluate whether `opt` can be taken now.
 * Returns { enabled, reason?, reasonText?, cost, shortfall?, afterGold? }.
 * `inputValue` is optional: without it the input is not validated (listing mode).
 */
export function optionStatus(ctx, scope, opt, inputValue, validateInput = false) {
  const s = ctx.s;
  const env = { ctx, vars: { ...(scope && scope.vars), ...(opt.input && inputValue !== undefined ? { [opt.input.var]: inputValue } : {}) } };
  const cost = costValues({ ctx, vars: scope && scope.vars }, opt.cost);
  const res = { enabled: true, cost };
  const no = (reason, extra = {}, custom) => {
    res.enabled = false;
    res.reason = reason;
    res.reasonText = reasonText(reason, custom);
    Object.assign(res, extra);
    return res;
  };
  if (opt.input && validateInput) {
    const bad = inputError(opt.input, inputValue);
    if (bad) return no(bad);
  }
  for (const r of requireList(opt.requires)) {
    let ok;
    try {
      ok = evalCond(env, r.when);
    } catch (e) {
      if (e instanceof EngineError && e.code === 'script_var_missing') ok = true; // depends on an input we do not have yet
      else throw e;
    }
    if (!ok) return no(r.reason || 'notNow', {}, r.text);
  }
  if (cost.gold !== undefined) {
    res.afterGold = s.gold - cost.gold;
    if (s.gold < cost.gold) return no('insufficientGold', { shortfall: cost.gold - s.gold });
  }
  if (cost.mp && cost.mp.strict && s.mp < cost.mp.amount) return no('insufficientMp', { shortfall: cost.mp.amount - s.mp });
  if (cost.items) {
    const need = {};
    for (const id of cost.items) need[id] = (need[id] || 0) + 1;
    for (const [id, n] of Object.entries(need)) if (itemCount(s, id) < n) return no('missingItem', { missing: id });
  }
  // paying cash for gear you already own is blocked (free gifts stay selectable so a choice can never soft-lock)
  if (cost.gold > 0) {
    for (const eff of opt.effects || []) {
      if (eff && eff.op === 'giveGear' && ownsGear(s, eff.id)) return no('alreadyOwned');
    }
  }
  return res;
}

export function applyCost(ctx, cost, defaultTrapLoss) {
  const c = normCost(cost);
  const env = { ctx, vars: {} };
  const trapLoss = c.trapLoss || defaultTrapLoss || false;
  if (c.gold !== undefined) {
    const g = evalExpr(env, c.gold);
    if (g > 0) changeGold(ctx, -g, 'pay');
  }
  if (c.hp) changeHp(ctx, -evalExpr(env, c.hp.amount), c.hp.floor, { trapLoss, reason: 'cost' });
  if (c.mp) {
    const amount = evalExpr(env, c.mp.amount);
    if (c.mp.strict && ctx.s.mp < amount) fail('insufficient_mp');
    changeMp(ctx, -amount, c.mp.floor, { trapLoss, reason: 'cost' });
  }
  if (c.items) {
    for (const id of c.items) {
      bagRemoveOne(ctx.s, id);
      ctx.emit({ t: 'itemLost', id, reason: 'cost' });
    }
  }
}

export function findOption(options, id) {
  const o = options.find((x) => x.id === id);
  if (!o) fail('bad_option', String(id));
  return o;
}

/** BD36 applies only to an explicit one-consumable handover, never a purchase/cash reward. */
export function substituteTradeOption(ctx, opt, substituteId) {
  const cost = normCost(opt?.cost);
  const hasCashReward = value => value && typeof value === 'object' &&
    (value.op === 'awardGold' || Object.values(value).some(hasCashReward));
  if(ctx.s.phase !== 'event' || !ctx.s.prompt?.top || ctx.s.event?.puzzle ||
    !opt || cost.items?.length !== 1 || cost.gold !== undefined || cost.trapLoss ||
    hasCashReward(opt.effects) || hasCashReward(ctx.s.prompt.cont?.rest)) fail('trade_not_allowed');
  const original = ctx.content.items[cost.items[0]];
  const substitute = ctx.content.items[substituteId];
  if(!original || !substitute || original.id === substitute.id ||
    original.band !== substitute.band || original.category !== substitute.category ||
    substitute.price < original.price || itemCount(ctx.s,substituteId) < 1) fail('trade_bad_substitute');
  return {...opt,cost:{...cost,items:[substituteId]}};
}
