import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { buildContent, ContentError, coverage, isScripted, loadContent } from '../src/content/index.js';
import { createNodeLoader } from '../src/content/node.js';
import { createBrowserLoader } from '../src/content/browser.js';
import { listCustomHandlers } from '../src/engine/custom/index.js';
import { OPS, HOOKS, ITEM_WHERE } from '../src/engine/formats.js';
import { getContent } from './fixtures/helpers.mjs';

const content = await getContent();
const ROOT = new URL('..', import.meta.url).pathname;

test('the patch file matches balance-draft-2 and is applied to exactly the five events', async () => {
  const patch = JSON.parse(await readFile(`${ROOT}data/patches/encounters-balance-draft-2.json`, 'utf8'));
  const draft = JSON.parse(await readFile(`${ROOT}data/balance-draft-2.json`, 'utf8'));
  assert.equal(patch.events.length, 5);
  for (const p of patch.events) {
    const src = draft.proposedNormalEncounterEvents.find((x) => x.candidateEventId === p.id);
    for (const f of ['name', 'scene', 'action', 'result']) assert.equal(p[f], src[f]);
    assert.deepEqual(p.refs, src.refs);
    // id / route / band / kind / count are kept
    const ev = content.events[p.id];
    const orig = content.base.events.find((e) => e.id === p.id);
    assert.deepEqual([ev.id, ev.route, ev.band, ev.kind], [orig.id, orig.route, orig.band, orig.kind]);
    assert.notEqual(ev.name, orig.name);
    // the original enemy still has another candidate in the same route/band
    const left = Object.values(content.events).filter((e) => e.id !== p.id && e.route === ev.route && e.band === ev.band && e.refs.includes(p.originalEnemyId));
    assert.ok(left.length > 0, `${p.originalEnemyId} must remain on ${ev.route}${ev.band}`);
  }
  assert.equal(Object.keys(content.events).length, 1000);
  assert.deepEqual(content.bands.map((b) => b.enemyIds.filter((id) => /^EN(09|1[0-3])$/.test(id))), [['EN09'], ['EN10'], ['EN11'], ['EN12'], ['EN13']]);
  // the base data object itself stays untouched
  assert.equal(content.base.events.find((e) => e.id === 'M1-24').name, '口笛まねっこ');
});

test('a patch that breaks the rules is rejected (wrong kind, enemy removed from the band)', async () => {
  const loader = createNodeLoader();
  const raw = async () => ({
    base: await loader.readJson('data/adventure-content.json'),
    balance: await loader.readJson('data/balance-draft-2.json'),
    tuning: await loader.readJson('data/tuning.json'),
    patch: await loader.readJson('data/patches/encounters-balance-draft-2.json'),
    scripts: { events: [], items: [], equipment: [] },
    tuningSource: 'data',
  });
  const r1 = await raw();
  r1.patch.events[0].id = 'M1-01'; // a 金貨 event
  assert.throws(() => buildContent(r1), (e) => e instanceof ContentError && e.problems.some((p) => p.code === 'patch-kind'));
  const r2 = await raw();
  r2.patch.bandEnemyAdditions = {};
  assert.throws(() => buildContent(r2), (e) => e.problems.some((p) => p.code === 'patch-band-missing'));
});

test('script merging: files named _samples are overridden by real files, duplicates between real files are errors', async () => {
  const loader = createNodeLoader();
  const sample = { name: 'events/_samples.json', json: { format: 'event-scripts-1', events: { 'M1-42': { options: [{ id: 'x', label: 'x', effects: [{ op: 'hp', delta: 1 }] }] } } } };
  const real = { name: 'events/M1.json', json: { format: 'event-scripts-1', events: { 'M1-42': { options: [{ id: 'y', label: 'y', effects: [{ op: 'hp', delta: 2 }] }] } } } };
  const dup = { name: 'events/M1b.json', json: real.json };
  const raw = async (events) => ({
    base: await loader.readJson('data/adventure-content.json'),
    balance: await loader.readJson('data/balance-draft-2.json'),
    tuning: await loader.readJson('data/tuning.json'),
    patch: await loader.readJson('data/patches/encounters-balance-draft-2.json'),
    scripts: { events, items: [], equipment: [] },
    tuningSource: 'data',
  });
  const c = buildContent(await raw([sample, real]));
  assert.equal(c.scripts.events['M1-42'].options[0].id, 'y');
  assert.equal(c.scriptSource.events['M1-42'], 'events/M1.json');
  const c2 = buildContent(await raw([real, sample]));
  assert.equal(c2.scripts.events['M1-42'].options[0].id, 'y');
  await assert.rejects(async () => buildContent(await raw([real, dup])), (e) => e instanceof ContentError && e.problems.some((p) => p.code === 'script-dup'));
});

test('the manifest lists every script file that exists (the browser cannot list directories)', async () => {
  const manifest = JSON.parse(await readFile(`${ROOT}data/scripts/manifest.json`, 'utf8'));
  assert.equal(manifest.format, 'script-manifest-1');
  const listed = new Set([...manifest.events, ...manifest.items, ...manifest.equipment]);
  const onDisk = createNodeLoader();
  const files = await onDisk.scriptFiles();
  const found = new Set([...files.events, ...files.items, ...files.equipment]);
  assert.deepEqual([...listed].sort(), [...found].sort());
  for (const f of listed) assert.ok(JSON.parse(await readFile(`${ROOT}data/scripts/${f}`, 'utf8')));
  void readdir;
});

test('the browser loader builds the same content through fetch + manifest', async () => {
  const fakeFetch = async (url) => {
    const path = new URL(url).pathname.replace(/^\//, '');
    try {
      const body = await readFile(`${ROOT}${path}`, 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    } catch {
      return { ok: false, status: 404, json: async () => null };
    }
  };
  const loader = createBrowserLoader('http://localhost/', fakeFetch);
  const viaBrowser = await loadContent(loader);
  assert.equal(viaBrowser.version, content.version);
  assert.deepEqual(Object.keys(viaBrowser.scripts.events).sort(), Object.keys(content.scripts.events).sort());
  assert.equal(viaBrowser.tuningSource, 'data');
});

test('coverage lists what has no script, per kind; isScripted agrees', () => {
  // Deliberately remove a script in a fixture; real coverage grows as content is implemented.
  const events = { ...content.scripts.events };
  delete events['M1-02'];
  const partial = { ...content, scripts: { ...content.scripts, events } };
  const cov = coverage(partial);
  assert.equal(cov.events.total, 1000);
  assert.equal(cov.items.total, 150);
  assert.equal(cov.equipment.total, 100);
  assert.equal(cov.events.scripted + cov.events.unscripted.length, 1000);
  for (const id of ['M1-42', 'B3-26', 'B5-30', 'H1-37']) assert.ok(isScripted(content, 'event', id));
  for (const id of ['HE01', 'AT02', 'BD50']) assert.ok(isScripted(content, 'item', id));
  for (const id of ['SW01', 'SW50', 'AR29']) assert.ok(isScripted(content, 'gear', id));
  assert.ok(!isScripted(partial, 'event', 'M1-02'));
  assert.equal(cov.events.unscripted.includes('M1-42'), false);
  assert.equal(cov.complete, false);
});

test('every required sample is converted and validates with no errors', () => {
  const events = 'M1-01 M1-42 M1-48 B2-02 B2-43 B2-48 F5-13 H1-37 M1-18 B3-26 B5-30 F1-12 H3-46 F2-20 M3-44 M1-24 H2-11 F3-27 B4-27 M5-25'.split(' ');
  const items = 'HE01 HE02 HE11 AT01 AT02 AT03 AT11 BD01 BD02 BD09 BD11 BD40 BD41 BD42 BD43 BD49 BD50'.split(' ');
  const gear = 'SW01 AR01 SW07 SW50 AR07 AR29'.split(' ');
  for (const id of events) assert.ok(content.scripts.events[id], `event ${id}`);
  for (const id of items) assert.ok(content.scripts.items[id], `item ${id}`);
  for (const id of gear) assert.ok(content.scripts.equipment[id], `gear ${id}`);
  assert.deepEqual(content.problems.filter((p) => p.level === 'error'), []);
});

test('format vocabulary: every wired op / hook / where has a doc string; custom handlers are listed', () => {
  for (const [k, v] of Object.entries(OPS)) assert.ok(v.doc && typeof v.wired === 'boolean', k);
  for (const [k, v] of Object.entries(HOOKS)) assert.ok(v.doc && typeof v.wired === 'boolean', k);
  for (const [k, v] of Object.entries(ITEM_WHERE)) assert.ok(v.doc && typeof v.wired === 'boolean', k);
  assert.ok(listCustomHandlers().includes('example.noop'));
});
