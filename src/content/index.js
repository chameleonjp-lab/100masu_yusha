// Content assembly: base JSON + balance-draft-2 + tuning + encounter patch + scripts -> indices.
// Pure (no fs / fetch). Node and browser loaders live in ./node.js and ./browser.js.

import { fnv1a } from '../engine/util.js';
import { validateScripts } from './validate.js';

export class ContentError extends Error {
  constructor(problems) {
    super(
      'content problems:\n' +
        problems
          .filter((p) => p.level === 'error')
          .slice(0, 40)
          .map((p) => `  [${p.code}] ${p.message}`)
          .join('\n'),
    );
    this.name = 'ContentError';
    this.problems = problems;
  }
}

const KINDS = ['金貨', '装備', '戦闘', '道具', '回復', '宿場', '選択', '罠'];
export const ENEMY_KIND = (id) => (id === 'DK01' ? 'king' : id.startsWith('MB') ? 'optional' : 'normal');

function isSampleFile(name) {
  return /(^|\/)_samples/.test(name);
}

/**
 * Build the content index.
 * raw = {
 *   base, balance, tuning, patch,
 *   scripts: { events: [{name, json}], items: [{name, json}], equipment: [{name, json}] },
 *   tuningSource: 'data'|'stub'
 * }
 * options = { strict: true }  (throw ContentError when any error-level problem exists)
 */
export function buildContent(raw, options = {}) {
  const strict = options.strict !== false;
  const problems = [];
  const err = (code, message, extra) => problems.push({ level: 'error', code, message, ...extra });
  const warn = (code, message, extra) => problems.push({ level: 'warn', code, message, ...extra });

  const base = raw.base;
  const settings = raw.balance || {};
  const tuning = raw.tuning || {};
  const patch = raw.patch || null;

  if (!base || base.schemaVersion !== '2.0') err('base-schema', 'base content missing or schemaVersion != 2.0');
  if (!base) throw new ContentError(problems);

  // ---- plain indices -------------------------------------------------------
  const byId = (arr, what) => {
    const m = {};
    for (const x of arr) {
      if (m[x.id]) err('dup-id', `duplicate ${what} id ${x.id}`);
      m[x.id] = x;
    }
    return m;
  };
  const items = byId(base.items, 'item');
  const gear = byId(base.equipment, 'equipment');
  const spells = {};
  for (const sb of base.spellBooks) spells[sb.id] = { ...sb };
  const events = byId(base.events.map((e) => ({ ...e })), 'event');
  const routes = Object.fromEntries(base.routes.map((r) => [r.id, r]));
  const routeIds = base.routes.map((r) => r.id);
  const bands = base.bands.map((b) => ({ ...b, enemyIds: [...b.enemyIds] }));
  const levelTable = base.levelTable;
  if (levelTable.length !== 20) err('level-table', 'levelTable must have 20 rows');

  if (Object.keys(events).length !== 1000) err('event-count', `expected 1000 events, got ${Object.keys(events).length}`);

  // ---- tuning: spells, jobs, companions -----------------------------------
  for (const id of Object.keys(spells)) {
    const t = tuning.spells && tuning.spells[id];
    if (!t) {
      err('tuning-spell', `tuning.spells.${id} missing`);
      continue;
    }
    Object.assign(spells[id], { mpCost: t.mpCost, kind: t.kind, power: t.power, text: t.text });
  }
  for (const j of ['JB00', 'JB01', 'JB02', 'JB03']) if (!tuning.jobs || !tuning.jobs[j]) err('tuning-job', `tuning.jobs.${j} missing`);
  const jobs = tuning.jobs || {};
  const companions = tuning.companions || {};
  const taverns = tuning.taverns || {};

  // ---- enemies ------------------------------------------------------------
  const enemies = {};
  for (const r of base.battleRewards) {
    enemies[r.id] = {
      id: r.id,
      name: r.name,
      kind: ENEMY_KIND(r.id),
      bands: [...r.bands],
      encounter: r.encounter,
      tell: r.tell,
      response: r.response,
      rewards: {
        goldOnWin: r.goldOnWin,
        xpOnWin: r.xpOnWin,
        gearChancePct: r.gearChancePct,
        itemChancePct: r.itemChancePct,
        swordWeightPct: r.swordWeightPct,
        armorWeightPct: r.armorWeightPct,
        itemClassWeightsPct: { ...r.itemClassWeightsPct },
      },
      maxHp: null,
      phases: null,
      phaseTwoThresholdHp: null,
      traits: { ...(tuning.enemyTraits && tuning.enemyTraits[r.id]) },
      statSource: null,
    };
  }
  for (const b of settings.bosses || []) {
    const e = enemies[b.id];
    if (!e) {
      err('boss-unknown', `balance-draft-2 boss ${b.id} has no battleRewards entry`);
      continue;
    }
    e.maxHp = b.maxHp;
    e.phases = b.phases.map((p) => ({ name: p.name, actions: p.actions.map((a) => ({ ...a, tell: a.tell || '' })) }));
    e.phaseTwoThresholdHp = b.phaseTwoThresholdHp;
    e.strategy = b.strategy;
    e.statSource = 'balance-draft-2';
    // the draft restates rewards; they must agree with base
    if (e.rewards.goldOnWin !== b.goldOnWin || e.rewards.xpOnWin !== b.xpOnWin) err('boss-reward-mismatch', `${b.id} reward differs between base and balance-draft-2`);
  }
  for (const m of settings.addedNormalMonsters || []) {
    if (enemies[m.id]) err('dup-id', `added monster ${m.id} already exists`);
    enemies[m.id] = {
      id: m.id,
      name: m.name,
      kind: 'normal',
      bands: [...m.bands],
      encounter: m.encounter,
      tell: m.tell,
      response: m.response,
      rewards: {
        goldOnWin: m.goldOnWin,
        xpOnWin: m.xpOnWin,
        gearChancePct: m.gearChancePct,
        itemChancePct: m.itemChancePct,
        swordWeightPct: m.swordWeightPct,
        armorWeightPct: m.armorWeightPct,
        itemClassWeightsPct: { ...m.itemClassWeightsPct },
      },
      maxHp: m.maxHp,
      phases: [{ name: '通常', actions: m.actions.map((a) => ({ ...a })) }],
      phaseTwoThresholdHp: null,
      traits: { ...(tuning.enemyTraits && tuning.enemyTraits[m.id]) },
      statSource: 'balance-draft-2',
    };
  }
  for (const [id, t] of Object.entries(tuning.normalEnemies || {})) {
    const e = enemies[id];
    if (!e) {
      err('tuning-enemy-unknown', `tuning.normalEnemies.${id} has no matching enemy`);
      continue;
    }
    if (e.statSource) {
      err('tuning-enemy-dup', `${id} stats exist in both ${e.statSource} and tuning`);
      continue;
    }
    e.maxHp = t.maxHp;
    e.phases = [{ name: '通常', actions: t.actions.map((a) => ({ ...a })) }];
    e.statSource = 'tuning';
  }
  for (const e of Object.values(enemies)) {
    if (!e.phases || !e.maxHp) err('enemy-stats', `enemy ${e.id} (${e.name}) has no maxHp/actions (tuning missing?)`);
    else {
      for (const ph of e.phases) {
        const orders = ph.actions.map((a) => a.order);
        if (orders.join() !== orders.map((_, i) => i + 1).join()) err('enemy-order', `${e.id} action orders must be 1..n`);
      }
    }
  }

  // ---- encounter patch (EN09-13) -----------------------------------------
  const patchedEventIds = [];
  if (patch) {
    if (patch.baseContentSha256 && settings.baseContentSha256 && patch.baseContentSha256 !== settings.baseContentSha256) {
      err('patch-base', 'encounter patch baseContentSha256 differs from balance-draft-2');
    }
    const proposals = Object.fromEntries((settings.proposedNormalEncounterEvents || []).map((p) => [p.candidateEventId, p]));
    for (const pe of patch.events || []) {
      const ev = events[pe.id];
      if (!ev) {
        err('patch-event', `patch targets unknown event ${pe.id}`);
        continue;
      }
      if (ev.kind !== '戦闘') err('patch-kind', `${pe.id} is ${ev.kind}, expected 戦闘`);
      if (pe.route && ev.route !== pe.route) err('patch-route', `${pe.id} route mismatch`);
      if (pe.band && ev.band !== pe.band) err('patch-band', `${pe.id} band mismatch`);
      for (const f of ['name', 'scene', 'action', 'result', 'refs']) if (pe[f] === undefined) err('patch-field', `${pe.id} patch lacks ${f}`);
      const prop = proposals[pe.id];
      if (prop) {
        for (const f of ['name', 'scene', 'action', 'result']) if (prop[f] !== pe[f]) err('patch-diverges', `${pe.id}.${f} differs from balance-draft-2 proposal`);
        if (JSON.stringify(prop.refs) !== JSON.stringify(pe.refs)) err('patch-diverges', `${pe.id}.refs differs from balance-draft-2 proposal`);
      } else warn('patch-unproposed', `${pe.id} is patched but not listed in balance-draft-2 proposals`);
      const original = pe.originalEnemyId || (prop && prop.originalEnemyId);
      events[pe.id] = { ...ev, name: pe.name, scene: pe.scene, action: pe.action, result: pe.result, refs: [...pe.refs], patched: true, originalEnemyId: original || null };
      patchedEventIds.push(pe.id);
      if (original) {
        const survivors = Object.values(events).filter((x) => x.id !== pe.id && x.route === ev.route && x.band === ev.band && (x.refs || []).includes(original));
        if (!survivors.length) err('patch-original-gone', `original enemy ${original} no longer appears on route ${ev.route} band ${ev.band} after patching ${pe.id}`);
      }
    }
    const adds = patch.bandEnemyAdditions || {};
    for (const [bandId, ids] of Object.entries(adds)) {
      const b = bands.find((x) => String(x.id) === String(bandId));
      if (!b) {
        err('patch-band-unknown', `bandEnemyAdditions for unknown band ${bandId}`);
        continue;
      }
      for (const id of ids) {
        if (!enemies[id]) err('patch-enemy-unknown', `bandEnemyAdditions mentions unknown enemy ${id}`);
        else if (!b.enemyIds.includes(id)) b.enemyIds.push(id);
      }
    }
    // every added monster must appear in the bands it declares
    for (const m of settings.addedNormalMonsters || []) {
      for (const bn of m.bands) {
        const b = bands.find((x) => x.id === bn);
        if (!b || !b.enemyIds.includes(m.id)) err('patch-band-missing', `${m.id} is not in bands[${bn}].enemyIds after patch`);
      }
    }
  } else if ((settings.addedNormalMonsters || []).length) {
    warn('patch-missing', 'balance-draft-2 adds monsters but no encounter patch was supplied');
  }

  // ---- refs ---------------------------------------------------------------
  const known = (id) => items[id] || gear[id] || enemies[id] || spells[id];
  for (const e of Object.values(events)) for (const r of e.refs || []) if (!known(r)) err('ref-unknown', `event ${e.id} refs unknown id ${r}`);
  for (const b of bands) for (const id of b.enemyIds) if (!enemies[id]) err('band-enemy-unknown', `band ${b.id} lists unknown enemy ${id}`);

  // ---- event/route indices ------------------------------------------------
  const eventsByRB = {};
  for (const e of Object.values(events)) {
    const key = `${e.route}:${e.band}`;
    ((eventsByRB[key] ??= {})[e.kind] ??= []).push(e.id);
  }
  for (const r of routeIds) {
    for (const b of bands) {
      const group = eventsByRB[`${r}:${b.id}`] || {};
      const total = KINDS.reduce((s, k) => s + (group[k] ? group[k].length : 0), 0);
      if (total !== 50) err('band-candidates', `route ${r} band ${b.id} has ${total} candidates (expected 50)`);
      for (const k of KINDS) {
        const want = routes[r].candidatesPerBand[k];
        const got = group[k] ? group[k].length : 0;
        if (want !== got) err('band-candidates-kind', `route ${r} band ${b.id} ${k}: ${got} != candidatesPerBand ${want}`);
      }
    }
  }
  const gearPool = {};
  for (const g of Object.values(gear)) ((gearPool[g.band] ??= {})[g.category] ??= []).push(g.id);
  const itemPool = {};
  for (const it of Object.values(items)) ((itemPool[it.band] ??= {})[it.category] ??= []).push(it.id);

  // ---- scripts ------------------------------------------------------------
  const scripts = { events: {}, items: {}, equipment: {} };
  const scriptSource = { events: {}, items: {}, equipment: {} };
  const scriptHash = [];
  const mergeScripts = (kind, files, rootKey, formatName) => {
    const sorted = [...(files || [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const f of sorted) {
      const json = f.json;
      if (!json || typeof json !== 'object') {
        err('script-file', `${f.name}: not a JSON object`);
        continue;
      }
      if (json.format !== formatName) err('script-format', `${f.name}: format must be "${formatName}" (got ${json.format})`);
      const map = json[rootKey];
      if (!map || typeof map !== 'object' || Array.isArray(map)) {
        err('script-file', `${f.name}: "${rootKey}" must be an object keyed by id`);
        continue;
      }
      scriptHash.push(`${kind}:${f.name}:${fnv1a(JSON.stringify(json))}`);
      for (const [id, sc] of Object.entries(map)) {
        if (sc && sc.id !== undefined && sc.id !== id) err('script-id', `${f.name}: key ${id} != id ${sc.id}`);
        const script = { ...sc, id };
        const prevSrc = scriptSource[kind][id];
        if (prevSrc) {
          const prevSample = isSampleFile(prevSrc);
          const curSample = isSampleFile(f.name);
          if (prevSample && !curSample) {
            // real file overrides sample
          } else if (!prevSample && curSample) {
            continue; // keep the real one
          } else {
            err('script-dup', `${kind} script ${id} defined in both ${prevSrc} and ${f.name}`);
            continue;
          }
        }
        scripts[kind][id] = script;
        scriptSource[kind][id] = f.name;
      }
    }
  };
  mergeScripts('events', raw.scripts && raw.scripts.events, 'events', 'event-scripts-1');
  mergeScripts('items', raw.scripts && raw.scripts.items, 'items', 'item-scripts-1');
  mergeScripts('equipment', raw.scripts && raw.scripts.equipment, 'equipment', 'equipment-scripts-1');
  for (const id of Object.keys(scripts.events)) if (!events[id]) err('script-unknown', `event script for unknown event ${id}`);
  for (const id of Object.keys(scripts.items)) if (!items[id]) err('script-unknown', `item script for unknown item ${id}`);
  for (const id of Object.keys(scripts.equipment)) if (!gear[id]) err('script-unknown', `equipment script for unknown gear ${id}`);

  const version =
    'c-' +
    fnv1a(
      JSON.stringify([
        settings.baseContentSha256 || base.title,
        settings.settingsVersion,
        tuning.tuningVersion,
        patch && patch.patchVersion,
        patchedEventIds.sort(),
        scriptHash.sort(),
      ]),
    );

  const content = {
    version,
    baseSchemaVersion: base.schemaVersion,
    settingsVersion: settings.settingsVersion || null,
    tuningVersion: tuning.tuningVersion || null,
    tuningSource: raw.tuningSource || 'unknown',
    patchVersion: patch ? patch.patchVersion || null : null,
    base,
    settings,
    tuning,
    routes,
    routeIds,
    bands,
    levelTable,
    events,
    eventsByRB,
    items,
    gear,
    spells,
    enemies,
    jobs,
    companions,
    taverns,
    gearPool,
    itemPool,
    patchedEventIds,
    scripts,
    scriptSource,
    problems,
  };

  validateScripts(content, problems);

  if (strict && problems.some((p) => p.level === 'error')) throw new ContentError(problems);
  return content;
}

/** Load through an abstract loader (see ./node.js, ./browser.js). */
export async function loadContent(loader, options = {}) {
  const base = await loader.readJson('data/adventure-content.json');
  const balance = await loader.readJson('data/balance-draft-2.json');
  let tuning = null;
  let tuningSource = 'data';
  for (const [i, path] of (loader.tuningPaths || ['data/tuning.json']).entries()) {
    tuning = await loader.readJson(path, { optional: true });
    if (tuning) {
      tuningSource = i === 0 ? 'data' : 'stub';
      break;
    }
  }
  if (!tuning) throw new Error('no tuning file found (data/tuning.json or the fixture stub)');
  const patch = await loader.readJson('data/patches/encounters-balance-draft-2.json', { optional: true });
  const files = await loader.scriptFiles();
  const read = async (list) => {
    const out = [];
    for (const name of list) {
      const json = await loader.readJson(`data/scripts/${name}`, { optional: true });
      if (json === null || json === undefined) throw new Error(`script file listed but not readable: ${name}`);
      out.push({ name, json });
    }
    return out;
  };
  const scripts = { events: await read(files.events), items: await read(files.items), equipment: await read(files.equipment) };
  const raw = { base, balance, tuning, patch, scripts, tuningSource };
  const content = buildContent(raw, options);
  if (loader.sha256 && balance.baseContentSha256) {
    const sha = await loader.sha256('data/adventure-content.json');
    if (sha && sha !== balance.baseContentSha256) content.problems.push({ level: 'warn', code: 'base-sha', message: `adventure-content.json sha256 ${sha} != balance-draft-2 baseContentSha256` });
  }
  return content;
}

// ---- coverage ---------------------------------------------------------------

export function isScripted(content, kind, id) {
  const m = kind === 'event' ? content.scripts.events : kind === 'item' ? content.scripts.items : kind === 'gear' || kind === 'equipment' ? content.scripts.equipment : null;
  if (!m) throw new Error(`unknown script kind ${kind}`);
  return Object.prototype.hasOwnProperty.call(m, id);
}

/**
 * What still has no script. The UI and the validator must use this and show
 * "unscripted" honestly; the engine never invents a behaviour for these.
 */
export function coverage(content) {
  const mk = (all, scripts) => {
    const ids = Object.keys(all);
    const unscripted = ids.filter((id) => !Object.prototype.hasOwnProperty.call(scripts, id));
    return { total: ids.length, scripted: ids.length - unscripted.length, unscripted };
  };
  const events = mk(content.events, content.scripts.events);
  const items = mk(content.items, content.scripts.items);
  const equipment = mk(content.gear, content.scripts.equipment);
  return {
    events,
    items,
    equipment,
    complete: events.unscripted.length === 0 && items.unscripted.length === 0 && equipment.unscripted.length === 0,
  };
}
