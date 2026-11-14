// Effect runner + op registry. Modules register the ops they own (see ops-basic.js, battle.js,
// itemops.js); src/engine/index.js imports them all. This file imports nothing from them,
// so there is no import cycle.

import { clone, fail } from './util.js';
import { evalCond } from './expr.js';

export const HANDLERS = Object.create(null);

export function register(name, fn) {
  if (HANDLERS[name]) throw new Error(`op registered twice: ${name}`);
  HANDLERS[name] = fn;
}

export function envOf(ctx, scope) {
  return { ctx, vars: scope && scope.vars, hook: scope && scope.hook, move: scope && scope.move };
}

export function newScope(origin, extra = {}) {
  return { vars: {}, origin, ...extra };
}

/**
 * Run a list of effect ops against ctx.s.
 * Returns 'done' | 'paused' (a prompt was stored in ctx.s.prompt) | 'handoff' (a battle/offer took over).
 * `if` is flattened into the queue so a pause inside a branch resumes with the right remainder.
 */
export function runEffects(ctx, effects, scope) {
  const queue = [...effects];
  while (queue.length) {
    const op = queue.shift();
    if (!op || typeof op !== 'object') fail('script_op', `bad effect ${JSON.stringify(op)}`);
    if (op.op === 'if') {
      const branch = evalCond(envOf(ctx, scope), op.cond) ? op.then : op.else;
      if (branch) queue.unshift(...branch);
      continue;
    }
    const h = HANDLERS[op.op];
    if (!h) fail('script_op_unknown', String(op.op));
    const r = h(ctx, op, scope);
    if (r && r.pause) {
      const p = { ...r.pause, cont: { rest: clone(queue), vars: scope.vars ? clone(scope.vars) : {}, origin: scope.origin } };
      if (p.kind === 'bagFull') p.prevPhase = ctx.s.phase;
      ctx.s.prompt = p;
      if (p.kind === 'bagFull') ctx.s.phase = 'bagFull';
      return 'paused';
    }
    if (r && r.handoff) return 'handoff';
  }
  return 'done';
}
