// Static validation of script files against the format vocabulary (src/engine/formats.js).
// Used by buildContent (errors make strict loading fail) and importable by tools/validate-content.mjs.

import { COST_KEYS, EXPR_NODES, HOOKS, ITEM_WHERE, OPS, REFS, REF_PREFIXES, RULE_KEYS, STAGES } from '../engine/formats.js';
import { validatePuzzle } from '../engine/puzzles.js';
import { CUSTOM } from '../engine/custom/index.js';

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

export function validateScripts(content, problems) {
  const err = (code, message) => problems.push({ level: 'error', code, message });
  const warn = (code, message) => problems.push({ level: 'warn', code, message });
  const knownId = (id) => content.items[id] || content.gear[id] || content.enemies[id] || content.spells[id];

  function expr(e, where, scopeVars) {
    if (e === null || ['number', 'string', 'boolean'].includes(typeof e)) return;
    if (Array.isArray(e)) return e.forEach((x) => expr(x, where, scopeVars));
    if (!isObj(e)) return err('script-expr', `${where}: bad expression ${JSON.stringify(e)}`);
    if ('ref' in e) {
      const name = e.ref;
      const isVar = REF_PREFIXES.some((p) => String(name).startsWith(p));
      if (!REFS[name] && !isVar) err('script-ref', `${where}: unknown ref "${name}"`);
      if (isVar && scopeVars && !scopeVars.has(String(name).slice(4))) err('script-var', `${where}: ref ${name} has no matching input/var in scope`);
      if (e.id !== undefined && REFS[name] && !(REFS[name].args || []).includes('id')) err('script-ref', `${where}: ref ${name} takes no id`);
      if (e.die !== undefined) expr(e.die, where, scopeVars);
      return;
    }
    const keys = Object.keys(e);
    if (keys.length !== 1 || !EXPR_NODES.includes(keys[0])) return err('script-expr', `${where}: unknown or malformed node ${JSON.stringify(e).slice(0, 80)}`);
    const v = e[keys[0]];
    if (keys[0] === 'actions') return;
    expr(v, where, scopeVars);
  }

  function rule(r, where, isMark, scopeVars) {
    if (!isObj(r)) return err('script-rule', `${where}: rule must be an object`);
    for (const k of Object.keys(r)) if (!RULE_KEYS.includes(k)) err('script-rule', `${where}: unknown rule key "${k}"`);
    if (!HOOKS[r.hook]) err('script-hook', `${where}: unknown hook "${r.hook}"`);
    else if (!HOOKS[r.hook].wired) warn('script-hook-unwired', `${where}: hook "${r.hook}" is reserved but not wired in the engine yet`);
    if (r.stage && !STAGES.includes(r.stage)) err('script-stage', `${where}: unknown stage "${r.stage}"`);
    if (r.when !== undefined) expr(r.when, `${where}.when`, scopeVars);
    if (r.cancelWhen !== undefined) expr(r.cancelWhen, `${where}.cancelWhen`, scopeVars);
    if (!Array.isArray(r.effects)) err('script-rule', `${where}: effects must be an array`);
    else effects(r.effects, `${where}.effects`, { rule: true, scopeVars });
    if (!isMark && (r.expires || r.uses !== undefined || r.unique)) err('script-rule', `${where}: expires/uses/unique are only valid on marks`);
  }

  function cost(c, where) {
    if (c === undefined) return;
    if (!isObj(c)) return err('script-cost', `${where}: cost must be an object`);
    for (const k of Object.keys(c)) if (!COST_KEYS.includes(k)) err('script-cost', `${where}: unknown cost key "${k}"`);
    for (const id of c.items || []) if (!content.items[id]) err('script-cost', `${where}: unknown item ${id}`);
  }

  function options(list, where, ev, scopeVars) {
    if (!Array.isArray(list)) return err('script-options', `${where}: options must be an array`);
    const ids = new Set();
    list.forEach((o, i) => {
      const w = `${where}[${i}]`;
      if (!o.id || typeof o.id !== 'string') err('script-options', `${w}: id required`);
      if (ids.has(o.id)) err('script-options', `${w}: duplicate option id ${o.id}`);
      ids.add(o.id);
      if (!o.label || typeof o.label !== 'string') err('script-options', `${w}: label required`);
      const vars = new Set(scopeVars || []);
      if (o.input) {
        if (!o.input.var || !['int', 'enum'].includes(o.input.type)) err('script-options', `${w}: input needs var and type int|enum`);
        else vars.add(o.input.var);
      }
      cost(o.cost, `${w}.cost`);
      if (o.requires !== undefined) {
        const reqs = Array.isArray(o.requires) ? o.requires : [o.requires];
        reqs.forEach((r) => expr(r && r.when !== undefined ? r.when : r, `${w}.requires`, vars));
      }
      if (!Array.isArray(o.effects)) err('script-options', `${w}: effects must be an array`);
      else effects(o.effects, `${w}.effects`, { ev, scopeVars: vars });
    });
  }

  function effects(list, where, c = {}) {
    if (!Array.isArray(list)) return err('script-effects', `${where}: effects must be an array`);
    list.forEach((op, i) => {
      const w = `${where}[${i}]`;
      if (!isObj(op) || typeof op.op !== 'string') return err('script-op', `${w}: effect needs an "op"`);
      const def = OPS[op.op];
      if (!def) return err('script-op', `${w}: unknown op "${op.op}"`);
      if (!def.wired) warn('script-op-unwired', `${w}: op "${op.op}" is reserved but not wired`);
      switch (op.op) {
        case 'awardGold': {
          const ev = c.ev;
          if (!ev) err('script-award', `${w}: awardGold only inside an event option / onLand`);
          else if (!ev.goldAward || ev.directGold == null) err('script-award', `${w}: ${ev.id} has no goldAward`);
          else if (op.amount !== ev.directGold) err('script-award', `${w}: amount ${op.amount} != directGold ${ev.directGold}`);
          break;
        }
        case 'giveItem':
          if (!content.items[op.id]) err('script-id', `${w}: unknown item ${op.id}`);
          break;
        case 'giveGear':
          if (!content.gear[op.id]) err('script-id', `${w}: unknown gear ${op.id}`);
          if (op.paidGold !== undefined) expr(op.paidGold, w, c.scopeVars);
          break;
        case 'learnSpell':
          if (!content.spells[op.id]) err('script-id', `${w}: unknown spell ${op.id}`);
          break;
        case 'loseItem':
          if (!op.choose && typeof op.id === 'string' && !content.items[op.id]) err('script-id', `${w}: unknown item ${op.id}`);
          if (typeof op.id === 'object') expr(op.id, w, c.scopeVars);
          break;
        case 'setEnemyAction': {
          const a=op.action || {};
          for(const k of Object.keys(a)) if(!['name','tell','kind','attack','defense','heal','hits','rawDamage'].includes(k)) err('script-battle', `${w}: unknown enemy action field ${k}`);
          for(const k of ['attack','defense','heal','rawDamage']) if(a[k] !== undefined && (!Number.isFinite(a[k]) || a[k]<0)) err('script-battle', `${w}: invalid enemy action ${k}`);
          if(a.hits !== undefined && (!Number.isInteger(a.hits) || a.hits<1 || a.hits>10)) err('script-battle', `${w}: hits must be 1..10`);
          break;
        }
        case 'battle':
          if (!content.enemies[op.enemy]) err('script-id', `${w}: unknown enemy ${op.enemy}`);
          if (i !== list.length - 1) err('script-battle', `${w}: battle must be the last effect of its list`);
          (op.rules || []).forEach((r, j) => rule(r, `${w}.rules[${j}]`, true, c.scopeVars));
          if (op.onWin) effects(op.onWin, `${w}.onWin`, c);
          if(op.scenario?.itemDisabledWhen)expr(op.scenario.itemDisabledWhen,w,c.scopeVars);
          const scenarioRounds = new Set();
          for(const entry of op.scenario?.announcements || []) {
            if(!entry.id)err('script-battle', `${w}: announcement id required`);
            if(entry.when !== undefined)expr(entry.when, `${w}.announcement.when`, c.scopeVars);
          }
          for (const entry of [...(op.scenario?.roundActions || []),...(op.scenario?.announcements || []).map((x,i)=>({...x,round:10000+i}))]) {
            if (!Number.isInteger(entry.round) || entry.round < 1 || scenarioRounds.has(entry.round)) err('script-battle', `${w}: scenario round must be a unique positive integer`);
            scenarioRounds.add(entry.round);
            const a = entry.action || {};
            if (a.hits !== undefined && (!Number.isInteger(a.hits) || a.hits < 1 || a.hits > 10)) err('script-battle', `${w}: hits must be 1..10`);
            for (const k of Object.keys(a)) if (!['name','tell','kind','attack','defense','heal','hits','rawDamage'].includes(k)) err('script-battle', `${w}: unknown scenario action field ${k}`);
            for (const k of ['attack','defense','heal','rawDamage']) if (a[k] !== undefined && (!Number.isFinite(a[k]) || a[k] < 0)) err('script-battle', `${w}: invalid scenario ${k}`);
          }
          for (const type of ['attack', 'guard']) {
            const list = op.scenario?.[`${type}Choices`] || [];
            const ids = new Set();
            for (const ch of list) {
              if (!ch.id || !ch.label || ids.has(ch.id)) err('script-battle', `${w}: scenario choices need unique id and label`);
              ids.add(ch.id);
              if (ch.damageMode !== undefined && !['normal', 'none', 'pierce'].includes(ch.damageMode)) err('script-battle', `${w}: unsupported scenario damageMode ${ch.damageMode}`);
              if (ch.bonus !== undefined && !Number.isFinite(ch.bonus)) err('script-battle', `${w}: scenario bonus must be finite`);
              if (ch.when !== undefined) expr(ch.when, `${w}.scenario.when`, c.scopeVars);
              effects(ch.effects || [], `${w}.scenario.effects`, { ...c });
            }
          }
          for (const ex of op.extraActions || []) {
            if (!ex.id || !ex.label) err('script-battle', `${w}: extraActions need id and label`);
            if (ex.when !== undefined) expr(ex.when, `${w}.extra.when`, c.scopeVars);
            effects(ex.effects || [], `${w}.extra.effects`, { ...c });
          }
          break;
        case 'if':
          expr(op.cond, `${w}.cond`, c.scopeVars);
          effects(op.then || [], `${w}.then`, c);
          if (op.else) effects(op.else, `${w}.else`, c);
          break;
        case 'choice':
          options(op.options, `${w}.options`, c.ev, c.scopeVars);
          break;
        case 'addMark':
          if (!op.mark) err('script-op', `${w}: addMark needs mark`);
          else rule(op.mark, `${w}.mark`, true, c.scopeVars);
          break;
        case 'reserve':
          if(op.slot==='nextTrapLoss' && (!['hp','mp'].includes(op.resource) || !Number.isFinite(op.amount) || op.amount<0))err('script-op', `${w}: invalid trap resource/amount`);
          if (!['thisMove', 'nextBattle', 'arrival', 'nextTrapLoss'].includes(op.slot)) err('script-op', `${w}: reserve.slot must be thisMove|nextBattle|arrival`);
          (op.rules || []).forEach((r, j) => (op.slot === 'thisMove' ? rule({ hook: 'moveConfirm', ...r }, `${w}.rules[${j}]`, false, c.scopeVars) : rule(r, `${w}.rules[${j}]`, true, c.scopeVars)));
          if (op.onStart) effects(op.onStart, `${w}.onStart`, c);
          if (op.effects) effects(op.effects, `${w}.effects`, { ...c });
          if (op.pos !== undefined) expr(op.pos, w, c.scopeVars);
          break;
        case 'reveal':
          if(op.expires && (!Number.isInteger(op.expires.moves) || op.expires.moves<1 || op.expires.moves>3)) err('script-op', `${w}: reveal expires.moves must be an integer 1..3`);
          if(op.maxPos!==undefined && (!Number.isInteger(op.maxPos) || op.maxPos<1 || op.maxPos>100)) err('script-op', `${w}: reveal maxPos must be an integer 1..100`);
          if (!['nextGold','nextInn','allBattles','nearestSquares','gearCandidates','battleHint','nextBattleEnemy', 'kingPhaseHint', 'remainingTraps', 'ownedArmorComparison', 'strongEnemiesAhead', 'nearestBattles', 'nearestTraps', 'nextEnemyAction', 'squaresAhead', 'sixOutcomes', 'nextGearInBand', 'nextTrapInBand', 'nextItemInBand', 'nextBattleInBand', 'ownedSwordComparison'].includes(op.info)) err('script-op', `${w}: unknown reveal info "${op.info}"`);
          break;
        case 'custom':
          if (!CUSTOM[op.id]) err('script-custom', `${w}: no custom handler "${op.id}" in src/engine/custom/`);
          break;
        case 'healEnemy':
        case 'enemyDefense':
        case 'hp':
        case 'mp':
        case 'addDamage':
        case 'subDamage':
        case 'reduceTrapLoss':
        case 'reduceDamage':
        case 'increaseDamage':
        case 'absorbDamage':
        case 'capDamage':
        case 'reduceCost':
        case 'dealDamage':
        case 'payGold':
        case 'xp':
          if (op.delta !== undefined) expr(op.delta, w, c.scopeVars);
          if (op.amount !== undefined) expr(op.amount, w, c.scopeVars);
          if (['reduceTrapLoss', 'addDamage', 'subDamage', 'reduceDamage', 'increaseDamage', 'dealDamage', 'payGold', 'xp'].includes(op.op) && op.amount === undefined) err('script-op', `${w}: ${op.op} needs amount`);
          if ((op.op === 'hp' || op.op === 'mp') && op.delta === undefined) err('script-op', `${w}: ${op.op} needs delta`);
          break;
        case 'adjustDie':
          if (op.to === undefined) err('script-op', `${w}: adjustDie needs "to"`);
          else expr(op.to, w, c.scopeVars);
          break;
        case 'setDieRule':
          if (!isObj(op.table)) err('script-op', `${w}: setDieRule needs table`);
          break;
        default:
          break;
      }
    });
  }

  // ---- events ----
  for (const [id, sc] of Object.entries(content.scripts.events)) {
    const ev = content.events[id];
    if (!ev) continue;
    const w = `event ${id}`;
    for (const k of Object.keys(sc)) if (!['id', 'onLand', 'options', 'inn', 'notes', 'checks', 'puzzle'].includes(k)) err('script-key', `${w}: unknown key "${k}"`);
    if (!sc.puzzle && !sc.onLand && !(sc.options && sc.options.length) && ev.kind !== '宿場') err('script-empty', `${w}: no onLand and no options (a bare "next" button is not allowed)`);
    if (ev.kind === '宿場' && !sc.inn && !sc.onLand && !sc.options) warn('script-inn', `${w}: inn without services is fine but has no one-time perk`);
    if (sc.onLand) effects(sc.onLand, `${w}.onLand`, { ev, scopeVars: new Set() });
    if (sc.puzzle) {
      for (const message of validatePuzzle(sc.puzzle)) err('script-puzzle', `${w}: ${message}`);
      effects(sc.puzzle.onCorrect || [], `${w}.puzzle.onCorrect`, {ev,scopeVars:new Set()});
      effects(sc.puzzle.onWrong || [], `${w}.puzzle.onWrong`, {ev,scopeVars:new Set()});
    }
    if (sc.options) options(sc.options, `${w}.options`, ev, new Set());
    if (sc.inn) {
      if(sc.inn.restOptions)options(sc.inn.restOptions, `${w}.inn.restOptions`, ev, new Set());
      for (const [i, sv] of (sc.inn.services || []).entries()) {
        const sw = `${w}.inn.services[${i}]`;
        if (!sv.id || !sv.label) err('script-inn', `${sw}: id and label required`);
        cost(sv.cost, `${sw}.cost`);
        const vars = new Set(sv.input ? [sv.input.var] : []);
        effects(sv.effects || [], `${sw}.effects`, { ev, scopeVars: vars });
      }
    }
    if (ev.kind === '罠') {
      let hasLoss = false;
      const scan = (list) =>
        (list || []).forEach((op) => {
          if (op.trapLoss) hasLoss = true;
          if (op.then) scan(op.then);
          if (op.else) scan(op.else);
          if (op.options) op.options.forEach((o) => scan(o.effects));
        });
      scan(sc.onLand);
      for (const o of sc.options || []) {
        if (o.cost && (o.cost.trapLoss || o.cost.hp || o.cost.mp || o.cost.gold || o.cost.items)) hasLoss = true;
        scan(o.effects);
      }
      if (!hasLoss) warn('script-trap-loss', `${w}: a 罠 event should mark its loss (cost.* or trapLoss:true)`);
    }
  }

  // ---- items ----
  for (const [id, sc] of Object.entries(content.scripts.items)) {
    const w = `item ${id}`;
    if (!Array.isArray(sc.uses) || !sc.uses.length) {
      err('script-item', `${w}: uses[] required`);
      continue;
    }
    sc.uses.forEach((u, i) => {
      const uw = `${w}.uses[${i}]`;
      if (!Array.isArray(u.where) || !u.where.length) err('script-item', `${uw}: where[] required`);
      for (const wh of u.where || []) {
        if (!ITEM_WHERE[wh]) err('script-where', `${uw}: unknown where "${wh}"`);
        else if (!ITEM_WHERE[wh].wired) warn('script-where-unwired', `${uw}: where "${wh}" is reserved but not wired`);
      }
      const vars = new Set((u.inputs || []).map((x) => x.id));
      if ((u.where || []).includes('restConfirm')) vars.add('restHpOverflow');
      if ((u.where || []).includes('trapLoss')) { vars.add('trapLoss'); vars.add('trapHasOtherCost'); }
      for (const inp of u.inputs || []) if (!inp.id || !['int', 'enum', 'string', 'sequence', 'ints'].includes(inp.type)) err('script-item', `${uw}: bad input ${JSON.stringify(inp)}`);
      for (const r of u.requires || []) expr(r.when, `${uw}.requires`, vars);
      effects(u.effects || [], `${uw}.effects`, { scopeVars: vars });
    });
  }

  // ---- equipment ----
  for (const [id, sc] of Object.entries(content.scripts.equipment)) {
    const w = `equipment ${id}`;
    if (!Array.isArray(sc.rules)) {
      err('script-gear', `${w}: rules[] required (use [] for a stat-only piece)`);
      continue;
    }
    sc.rules.forEach((r, i) => rule(r, `${w}.rules[${i}]`, false, new Set()));
  }
  void knownId;
}
