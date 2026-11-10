// Results, ranking, dex, personal bests (R49/R50). Pure functions over plain JSON.

import { clone } from './util.js';

export const META_VERSION = 1;

export function createMeta() {
  return {
    metaVersion: META_VERSION,
    settings: {},
    dex: { enemies: [], companions: [], gear: [] },
    bests: {}, // per route, plus "all"
    recordedRuns: [],
  };
}

/**
 * Compare two results: > 0 when `a` ranks better than `b`, < 0 when worse, 0 for the same rank.
 * Order: defeated the demon king first, then further square reached, then fewer rolls.
 */
export function compareResults(a, b) {
  if (!!a.defeated !== !!b.defeated) return a.defeated ? 1 : -1;
  if (a.furthest !== b.furthest) return a.furthest > b.furthest ? 1 : -1;
  if (a.rolls !== b.rolls) return a.rolls < b.rolls ? 1 : -1;
  return 0;
}

export const resultKey = (r) => `${r.defeated ? 1 : 0}:${String(r.furthest).padStart(3, '0')}:${String(9999 - r.rolls).padStart(4, '0')}`;

/** Standard competition ranking: ties share a rank and the next rank skips by the tie size (1,2,2,4). */
export function rankResults(results) {
  const sorted = [...results].sort((x, y) => compareResults(y, x));
  const out = [];
  sorted.forEach((r, i) => {
    const rank = i > 0 && compareResults(sorted[i - 1], r) === 0 ? out[i - 1].rank : i + 1;
    out.push({ rank, result: r });
  });
  return out;
}

function mergeUnique(a, b) {
  const out = [...a];
  for (const x of b) if (!out.includes(x)) out.push(x);
  return out;
}

/**
 * Merge a run's discoveries and (once) its result into meta.
 * Returns { meta, discoveries:{enemies,companions,gear}, newBest, recorded }.
 * Idempotent: recording the same finished run twice changes nothing the second time.
 */
export function applyRunToMeta(meta, run) {
  const m = clone(meta);
  const disc = { enemies: [], companions: [], gear: [] };
  for (const k of ['enemies', 'companions', 'gear']) {
    for (const id of run.discovered[k]) if (!m.dex[k].includes(id)) disc[k].push(id);
    m.dex[k] = mergeUnique(m.dex[k], run.discovered[k]);
  }
  let newBest = false;
  let recorded = false;
  if (run.result && !m.recordedRuns.includes(run.runId)) {
    recorded = true;
    m.recordedRuns.push(run.runId);
    if (m.recordedRuns.length > 200) m.recordedRuns.shift();
    for (const key of [run.result.route, 'all']) {
      const cur = m.bests[key];
      if (!cur || compareResults(run.result, cur) > 0) {
        m.bests[key] = clone(run.result);
        if (key === 'all') newBest = true;
      }
    }
  }
  return { meta: m, discoveries: disc, newBest, recorded };
}
