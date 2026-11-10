// Robustness: a bot plays whole runs choosing among the actions view() marks enabled.
// Invariants are checked after every step, state is round-tripped through JSON (= save/load) each step,
// and the same seed must give the same final state.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, dispatch, maxHpOf, view } from '../src/engine/index.js';
import { newRng, floatAt } from '../src/engine/rng.js';
import { getContent, withScripts } from './fixtures/helpers.mjs';

const content0 = await getContent();

// every 戦闘 event gets a plain battle script so the bot actually fights; everything else stays as it is
function withBattleScripts(content) {
  const events = {};
  for (const e of Object.values(content.events)) {
    if (e.kind !== '戦闘' || content.scripts.events[e.id]) continue;
    const enemy = e.refs.find((r) => /^(EN|MB)/.test(r));
    if (enemy) events[e.id] = { onLand: [{ op: 'battle', enemy }] };
  }
  return withScripts(content, { events });
}
const content = withBattleScripts(content0);

function makeBot(seed) {
  let n = 0;
  const rnd = () => floatAt(seed ^ 0x5bd1e995, n++);
  const pick = (arr) => arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))];
  let innActions = 0;
  let lastInn = null;
  return {
    choose(v, s) {
      const en = v.actions.filter((a) => a.enabled !== false);
      const of = (t) => en.filter((a) => a.type === t);
      switch (v.phase) {
        case 'board':
          if (v.hero.hp < v.hero.maxHp / 2) {
            const heal = of('useItem').find((a) => a.itemId === 'HE01' && !a.needsInput);
            if (heal && false) return heal;
          }
          return { type: 'roll' };
        case 'rolled':
          return { type: 'move' };
        case 'event': {
          if (v.event && v.event.unscripted) return { type: 'skipUnscripted' };
          if (v.prompt && v.prompt.kind === 'pickBagItem') return { type: 'pickBagItem', index: 0 };
          const opts = of('chooseOption');
          const o = pick(opts);
          if (!o) throw new Error(`no enabled option at ${v.event && v.event.id}`);
          const act = { type: 'chooseOption', optionId: o.optionId };
          if (o.input) act.input = o.input.type === 'int' ? o.input.min + Math.floor(rnd() * (o.input.max - o.input.min + 1)) : o.input.values[0];
          return act;
        }
        case 'chest':
          return rnd() < 0.9 ? { type: 'pickChest', index: Math.floor(rnd() * v.chest.candidates.length) } : { type: 'skipChest' };
        case 'bagFull':
          return rnd() < 0.5 ? { type: 'bagSwap', index: Math.floor(rnd() * 6) } : { type: 'bagDecline' };
        case 'inn': {
          if (v.prompt && v.prompt.kind === 'choice') return { type: 'chooseOption', optionId: pick(of('chooseOption')).optionId };
          if (lastInn !== s.event.pos) {
            lastInn = s.event.pos;
            innActions = 0;
          }
          innActions += 1;
          if (innActions > 7) return { type: 'leaveInn' };
          const choices = [...of('rest'), ...of('buy'), ...of('sellItem').slice(0, 1), ...of('service'), ...of('recruit'), ...of('equip'), ...of('changeJob')];
          const c = pick(choices.length ? choices : of('leaveInn'));
          if (c.type === 'service' && c.input) return { type: 'leaveInn' };
          if (c.type === 'equip') return { type: 'equip', iid: c.iid };
          if (c.type === 'recruit') return { type: 'recruit', companionId: c.companionId, ...(c.needsReplace ? { replaceId: s.companions[0] } : {}) };
          return Object.fromEntries(Object.entries(c).filter(([k]) => ['type', 'slot', 'index', 'serviceId', 'jobId', 'iid'].includes(k)));
        }
        case 'bossOffer':
          return { type: rnd() < 0.5 ? 'challenge' : 'skip' };
        case 'battle': {
          const b = v.battle;
          const target = b.targets ? b.targets.find((t) => t.footprint === 'fresh').index : undefined;
          const heal = b.items.find((i) => i.itemId === 'HE01' && i.enabled);
          if (v.hero.hp < v.hero.maxHp * 0.35 && heal && rnd() < 0.8) return { type: 'item', itemId: 'HE01' };
          if (b.canFlee && v.hero.hp < v.hero.maxHp * 0.3 && rnd() < 0.5) return { type: 'flee' };
          const sp = b.spells.find((x) => x.enabled && (x.kind === 'attack' || x.kind === 'finisher'));
          if (sp && rnd() < 0.4) return { type: 'spell', spellId: sp.id, ...(target !== undefined ? { target } : {}) };
          if (b.telegraph.kind === '大技' && rnd() < 0.8) return { type: 'guard' };
          return { type: 'attack', ...(target !== undefined ? { target } : {}) };
        }
        case 'battleReward':
          return { type: 'continue' };
        case 'gate':
          return { type: 'challengeKing' };
        case 'retryOffer':
          if (s.retry.stage === 'offer') return { type: rnd() < 0.85 ? 'retry' : 'declineRetry' };
          return { type: 'resumeBattle' };
        default:
          throw new Error(`bot has no move for phase ${v.phase}`);
      }
    },
  };
}

const PHASES = new Set(['board', 'rolled', 'event', 'chest', 'bagFull', 'inn', 'bossOffer', 'battle', 'battleReward', 'gate', 'retryOffer', 'finished']);

function checkInvariants(s, step) {
  const where = `step ${step} phase ${s.phase} pos ${s.pos}`;
  assert.ok(PHASES.has(s.phase), where);
  assert.ok(s.hp >= 0 && s.hp <= maxHpOf(content, s), `${where}: hp ${s.hp}`);
  assert.ok(s.mp >= 0, `${where}: mp ${s.mp}`);
  assert.ok(s.gold >= 0 && Number.isInteger(s.gold), `${where}: gold ${s.gold}`);
  assert.ok(s.bag.length <= 6, `${where}: bag ${s.bag.length}`);
  for (const id of s.bag) assert.ok(content.items[id], `${where}: bag item ${id}`);
  assert.ok(s.companions.length <= 2);
  assert.ok(s.spells.prepared.length <= 2 && s.spells.prepared.every((id) => s.spells.learned.includes(id)));
  assert.ok(s.level >= 1 && s.level <= 20);
  assert.ok(s.pos >= s.furthest || s.furthest === s.pos);
  assert.ok(s.equipped.sword && s.equipped.armor);
  assert.equal(new Set(s.gear.map((g) => g.id)).size, s.gear.length, `${where}: duplicate gear`);
  if (s.phase === 'bagFull') assert.ok(s.prompt && s.prompt.kind === 'bagFull');
  if (s.phase === 'battle') assert.ok(s.battle && s.battle.enemy.hp > 0);
  if (s.phase === 'finished') assert.ok(s.result);
  assert.ok(s.rolls <= s.furthest * 2 + 200);
}

function play(route, seed, { strong = false, maxSteps = 4000 } = {}) {
  let s = createRun(content, { route, seed });
  if (strong) {
    // a hero that can plausibly win: level 20, good gear, healing items
    s.level = 20;
    s.xp = 912;
    s.hp = 78;
    s.mp = 48;
    s.gear.push({ iid: 'g3', id: 'SW49', paidGold: null, from: 'drop' }, { iid: 'g4', id: 'AR50', paidGold: null, from: 'drop' });
    s.equipped = { sword: 'g3', armor: 'g4' };
    s.bag = ['HE41', 'HE41', 'HE01', 'HE01', 'HE02', 'HE02'];
    s.gold = 5000;
  }
  const bot = makeBot(seed * 31 + route.charCodeAt(0));
  const log = [];
  for (let step = 0; step < maxSteps && s.phase !== 'finished'; step++) {
    s = JSON.parse(JSON.stringify(s)); // every step starts from a "reloaded" state
    const v = view(content, s);
    const action = bot.choose(v, s);
    let r;
    try {
      r = dispatch(content, s, { ...action, opId: `op-${step}` }, {});
    } catch (e) {
      throw new Error(`step ${step} (${s.phase}) action ${JSON.stringify(action)} threw ${e.message}\nlast: ${log.slice(-5).join(' | ')}`);
    }
    // replaying the same op id is a no-op
    const replay = dispatch(content, r.state, { ...action, opId: `op-${step}` });
    assert.equal(replay.replay, true);
    s = r.state;
    log.push(`${action.type}${action.optionId ? ':' + action.optionId : ''}@${s.pos}`);
    checkInvariants(s, step);
  }
  return { s, steps: log.length, log };
}

const SEEDS = Number(process.env.FUZZ_SEEDS || 6); // FUZZ_SEEDS=60 node --test tests/playthrough.test.mjs for a longer soak

for (const route of ['M', 'F', 'B', 'H']) {
  test(`playthrough ${route}: bot runs reach the end without errors, invariants hold at every step`, () => {
    let finished = 0;
    let victories = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { s } = play(route, seed);
      if (s.phase === 'finished') finished++;
      assert.equal(s.phase, 'finished', `${route} seed ${seed} did not finish (phase ${s.phase} pos ${s.pos})`);
      if (s.result.defeated) victories++;
    }
    assert.equal(finished, SEEDS);
    void victories;
  });

  test(`playthrough ${route}: a strong hero can win; the result and the reward flow are consistent`, () => {
    let wins = 0;
    for (let seed = 1; seed <= Math.max(4, SEEDS / 2); seed++) {
      const { s } = play(route, seed, { strong: true });
      assert.equal(s.phase, 'finished');
      if (s.result.defeated) {
        wins++;
        assert.equal(s.result.furthest, 100);
        assert.equal(s.victory.enemyId, 'DK01');
      }
    }
    assert.ok(wins >= 1, `${route}: no strong run won`);
  });
}

test('determinism: the same seed and the same bot choices give the same final state', () => {
  const a = play('B', 5);
  const b = play('B', 5);
  assert.deepEqual(a.s, b.s);
  assert.equal(a.steps, b.steps);
  const c = play('B', 6);
  assert.notDeepEqual(a.s.board, c.s.board);
  void newRng;
});
