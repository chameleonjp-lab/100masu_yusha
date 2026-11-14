// Reviewed VM-only driver: pure synthetic fixtures + actual source APIs.
// No Node APIs, injected host objects, I/O, clocks or installed dependencies.
import { createRun, dispatch, checkBoard, checkCompat, applyRunToMeta, createMeta } from '../src/engine/index.js';
import { makeCtx, discover } from '../src/engine/core.js';
import { finishRun } from '../src/engine/battle.js';
import { createStore } from '../src/save/core.js';
import { createMemoryBackend } from '../src/save/memory.js';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function requireThat(condition, message) { if (!condition) throw new Error(message); }
const findings = [];
const controls = [];
async function control(id, title, fn) {
  try { controls.push({ id, title, status: 'passed', observations: await fn() }); }
  catch (e) { controls.push({ id, title, status: 'failed', error: { name: e.name, message: e.message } }); }
}
async function finding(id, title, fn) {
  try { findings.push({ id, title, status: 'passed', observations: await fn() }); }
  catch (e) { findings.push({ id, title, status: 'failed', error: { name: e.name, message: e.message } }); }
}
async function expectCode(fn, code) {
  let caught;
  try { await fn(); } catch (e) { caught = e; }
  requireThat(caught && caught.code === code, `Expected ${code}, received ${caught ? caught.code || caught.name : 'success'}`);
  return { name: caught.name, code: caught.code, details: clone(caught.details) };
}
function setup() {
  const backend = createMemoryBackend();
  return { backend, a: createStore(backend), b: createStore(backend) };
}
function storage(backend) {
  return Object.fromEntries(Object.entries(backend.stores).map(([name, map]) => [name, [...map].map(([key, value]) => ({ key, value: clone(value) }))]));
}
function briefRun(run) {
  if (!run) return run;
  return {
    runId: run.runId, route: run.route, seed: run.seed, revision: run.revision,
    schema: run.schema, rulesVersion: run.rulesVersion, phase: run.phase,
    rolls: run.rolls, pos: run.pos, roll: clone(run.roll), ops: clone(run.ops),
    discovered: clone(run.discovered), result: clone(run.result),
  };
}
function briefLoad(load) {
  return {
    status: load.status, revision: load.revision, lastOpId: load.lastOpId,
    metaStatus: load.metaStatus, run: briefRun(load.run), meta: clone(load.meta), raw: clone(load.raw),
  };
}
function backupSummary(backend) {
  return [...backend.stores.backup].map(([key, record]) => ({
    key, format: record.format, revision: record.revision, run: briefRun(record.run),
  }));
}

// Synthetic content supports real board generation, board validation, shop
// generation and rolling. It is NOT the shipped content dataset or balance.
function syntheticContent() {
  const c = {
    version: 'synthetic-save-repro-1',
    base: { economy: { startingGold: 300, regionalGuaranteedStock: {} } },
    levelTable: [{ level: 1, maxHp: 20, maxMp: 10, attack: 5, defense: 2, totalXp: 0 }],
    routes: {}, bands: [], events: {}, eventsByRB: {}, items: {}, gear: {},
    itemPool: {}, gearPool: {}, spells: {},
  };
  const kinds = ['金貨', '装備', '戦闘', '道具', '回復', '宿場', '選択', '罠'];
  const counts = { 金貨: 3, 装備: 3, 戦闘: 3, 道具: 3, 回復: 2, 宿場: 1, 選択: 2, 罠: 3 };
  const ranges = [[2, 20], [21, 40], [41, 60], [61, 80], [81, 99]];
  for (let i = 1; i <= 5; i++) {
    c.bands.push({ id: i, randomRange: ranges[i - 1], range: [20 * (i - 1) + 1, 20 * i] });
    c.itemPool[i] = { 戦闘用: ['AT01', 'AT02', 'AT03'], 回復用: ['HE01', 'HE02', 'HE03'], すごろく用: ['BD01', 'BD02', 'BD03'] };
    c.gearPool[i] = { 剣: ['SW01', 'SW02', 'SW03'], 防具: ['AR01', 'AR02', 'AR03'] };
  }
  for (const route of ['M', 'F']) {
    c.routes[route] = { slotsInTwenty: clone(counts) };
    for (const band of c.bands) {
      const group = c.eventsByRB[`${route}:${band.id}`] = {};
      for (const [k, kind] of kinds.entries()) {
        group[kind] = [];
        for (let n = 1; n <= 8; n++) {
          const id = `SYN-${route}-${band.id}-${k}-${n}`;
          group[kind].push(id);
          c.events[id] = { id, route, band: band.id, kind, name: 'synthetic fixture' };
        }
      }
    }
  }
  for (const ids of Object.values(c.itemPool[1])) for (const id of ids) c.items[id] = { id, price: 10 };
  for (const [category, ids] of Object.entries(c.gearPool[1])) for (const id of ids) c.gear[id] = { id, category, price: 10, baseStat: 1 };
  return c;
}
const content = syntheticContent();
function newRun(route = 'M', seed = 7, runId) {
  const opts = { route, seed, runId: runId === undefined ? `fixture-${route}-${seed}` : runId };
  if (runId !== undefined) opts.runId = runId;
  return createRun(content, opts);
}
function rolled(run, opId, raw = 0.5) {
  return dispatch(content, run, { type: 'roll', opId }, { rolls: [raw] }).state;
}
function terminalFixture(run) {
  const finished = clone(run);
  const ctx = makeCtx(content, finished);
  discover(ctx, 'enemies', 'SYNTHETIC-ENEMY');
  finishRun(ctx, 'declined');
  return finished;
}

await control('C01', 'Synthetic boards validate; actual createRun/dispatch is compatible and input-immutable', async () => {
  const out = [];
  for (const route of ['M', 'F']) {
    const run = newRun(route);
    const before = clone(run);
    const problems = checkBoard(content, route, run.board);
    const compatibility = checkCompat(content, run);
    const next = rolled(run, `${route}-roll`);
    requireThat(problems.length === 0 && compatibility.ok, 'Synthetic board or run rejected');
    requireThat(same(run, before) && next.revision === 1 && next.phase === 'rolled' && next.roll.raw === 4, 'Unexpected real dispatch behavior');
    out.push({ route, boardProblems: problems, compatibility, before: briefRun(run), after: briefRun(next) });
  }
  return out;
});

await control('C02', 'Empty store, initial save and reload round-trip', async () => {
  const { a } = setup();
  const empty = await a.load();
  const run = newRun('M', 10, 'round-trip');
  const meta = createMeta();
  const saved = await a.commit({ run, meta });
  const loaded = await a.load();
  requireThat(empty.status === 'empty' && saved.ok && same(loaded.run, run) && same(loaded.meta, meta), 'Round-trip mismatch');
  return { initialStatus: empty.status, save: saved, loaded: briefLoad(loaded) };
});

await finding('F01', 'Stale metadata is rejected atomically', async () => {
  const { a, b, backend } = setup();
  await a.commit({ run: newRun('M', 7, 'meta-A'), meta: createMeta() });
  const a0 = await a.load(), b0 = await b.load();
  const done = terminalFixture(rolled(a0.run, 'meta-A-1'));
  const merged = applyRunToMeta(a0.meta, done);
  await a.commit({run:done, meta:merged.meta, expectedRevision:a0.revision, expectedMetaRevision:a0.metaRevision, opId:'meta-A-1'});
  const before = storage(backend);
  const stale = clone(b0.meta); stale.settings.volume = .25;
  await expectCode(() => b.saveMeta(stale, {expectedMetaRevision:b0.metaRevision}), 'stale_meta_revision');
  requireThat(same(before, storage(backend)), 'Rejected metadata changed storage');
  const current = await b.load();
  requireThat(current.meta.bests.M && current.meta.dex.enemies.length === 1, 'Progress absent');
  // Same run revision, stale meta: entire commit must roll back.
  const next = clone(current.run); next.revision += 1;
  await expectCode(() => b.commit({run:next, meta:stale, expectedRevision:current.revision, expectedMetaRevision:b0.metaRevision}), 'stale_meta_revision');
  await expectCode(() => b.startNew({run:newRun('F',8,'replacement-meta'), meta:stale, expectedMetaRevision:b0.metaRevision, confirmReplace:true}), 'stale_meta_revision');
  await expectCode(() => b.saveMeta(stale), 'stale_meta_revision');
  requireThat(same(before, storage(backend)), 'Omitted revision bypassed guard');
  return {preserved:true};
});

await control('C03', 'Settings save from freshly loaded metadata preserves recorded progress', async () => {
  const { a, b } = setup();
  const run = terminalFixture(rolled(newRun('M', 8, 'fresh-meta'), 'fresh-1'));
  const meta = applyRunToMeta(createMeta(), run).meta;
  await a.commit({ run, meta });
  const fresh = await b.load();
  fresh.meta.settings.volume = 0.25;
  await b.saveMeta(fresh.meta, {expectedMetaRevision:fresh.metaRevision});
  const after = await b.load();
  requireThat(same(after.meta.dex, meta.dex) && same(after.meta.bests, meta.bests) && same(after.meta.recordedRuns, meta.recordedRuns), 'Fresh metadata was lost');
  return { before: meta, after: after.meta };
});

await finding('F02', 'Missing/empty run IDs are rejected, not derived from seed', async () => {
  for (const runId of [undefined, '', ' ', 7, null]) {
    await expectCode(() => createRun(content, {route:'M', seed:7, runId}), 'bad_run_id');
  }
  return {invalidIdsRejected:5};
});

await control('C04', 'Explicit distinct run IDs reject stale writes after replacement', async () => {
  const { a, b, backend } = setup();
  const old = newRun('M', 7, 'unique-M');
  await a.commit({ run: old });
  const pending = rolled(old, 'unique-M-roll');
  await b.startNew({ run: newRun('F', 7, 'unique-F'), confirmReplace: true });
  const before = storage(backend);
  const error = await expectCode(() => a.commit({ run: pending, expectedRevision: 0, opId: 'unique-M-roll' }), 'run_replaced');
  requireThat(same(before, storage(backend)), 'Rejected commit changed storage');
  return { error, stored: briefLoad(await b.load()), allStorageUnchanged: true };
});

await control('C05', 'Distinct run IDs record both route results; actual repeat remains idempotent', async () => {
  const first = applyRunToMeta(createMeta(), terminalFixture(newRun('M', 7, 'result-M')));
  const second = applyRunToMeta(first.meta, terminalFixture(newRun('F', 7, 'result-F')));
  const repeat = applyRunToMeta(second.meta, terminalFixture(newRun('F', 7, 'result-F')));
  requireThat(first.recorded && second.recorded && second.meta.bests.M && second.meta.bests.F && second.meta.recordedRuns.length === 2 && !repeat.recorded && same(repeat.meta, second.meta), 'Unique-ID result control failed');
  return { firstRecorded: first.recorded, secondRecorded: second.recorded, repeatedRecorded: repeat.recorded, meta: second.meta };
});

await finding('F03', 'Same opId across distinct runs returns false replay success before run identity check', async () => {
  const { a, b, backend } = setup();
  const a0 = newRun('M', 11, 'op-run-A');
  await a.commit({ run: a0 });
  const a1 = rolled(a0, 'op-1');
  const savedA = await a.commit({ run: a1, expectedRevision: 0, opId: 'op-1' });
  const b0 = newRun('F', 12, 'op-run-B');
  await b.startNew({ run: b0, confirmReplace: true });
  const b1 = rolled(b0, 'op-1', 0.01);
  const savedB = await b.commit({ run: b1, expectedRevision: 0, opId: 'op-1' });
  const beforeRetry = await b.load();
  const wholeBefore = storage(backend);
  const retryA = await expectCode(() => a.commit({ run: a1, expectedRevision: 0, opId: 'op-1' }), 'run_replaced');
  const afterRetry = await b.load();
  requireThat(a1.runId !== b1.runId && retryA.code === 'run_replaced', 'False cross-run replay absent');
  requireThat(same(wholeBefore, storage(backend)) && afterRetry.run.runId === b1.runId, 'Unexpected write in replay path');
  return { aSubmitted: briefRun(a1), bSubmitted: briefRun(b1), savedA, savedB, beforeRetry: briefLoad(beforeRetry), retryA, afterRetry: briefLoad(afterRetry), allStorageUnchanged: true, failureType: 'False success acknowledgement, not an overwrite in this case' };
});

await control('C06', 'Same-run same-opId replay succeeds without writing twice', async () => {
  const { a, backend } = setup();
  const r0 = newRun('M', 13, 'same-run');
  await a.commit({ run: r0 });
  const r1 = rolled(r0, 'op-1');
  await a.commit({ run: r1, expectedRevision: 0, opId: 'op-1' });
  const before = storage(backend);
  const replay = await a.commit({ run: r1, expectedRevision: 0, opId: 'op-1' });
  requireThat(replay.replay === true && same(before, storage(backend)), 'Same-run replay broken');
  return { replay, allStorageUnchanged: true };
});

await control('C07', 'Cross-run retry with different opId rejects run_replaced', async () => {
  const { a, b, backend } = setup();
  const a0 = newRun('M', 14, 'distinct-op-A');
  await a.commit({ run: a0 });
  const a1 = rolled(a0, 'A-op-1');
  await a.commit({ run: a1, expectedRevision: 0, opId: 'A-op-1' });
  const b0 = newRun('F', 15, 'distinct-op-B');
  await b.startNew({ run: b0, confirmReplace: true });
  await b.commit({ run: rolled(b0, 'B-op-1'), expectedRevision: 0, opId: 'B-op-1' });
  const before = storage(backend);
  const error = await expectCode(() => a.commit({ run: a1, expectedRevision: 0, opId: 'A-op-1' }), 'run_replaced');
  requireThat(same(before, storage(backend)), 'Cross-run rejection wrote data');
  return { error, allStorageUnchanged: true };
});

await finding('F04', 'Malformed format-1 remains protected through replacements', async () => {
  const { a, backend } = setup();
  const raw = { format:1, revision:0, run:{runId:'old',revision:0} };
  backend.stores.run.set('current', clone(raw));
  requireThat((await a.load()).status === 'unsupported', 'Malformed record accepted');
  await expectCode(() => a.commit({run:newRun('M',16,'commit')}), 'unsupported_record');
  await a.startNew({run:newRun('M',16,'replacement-1'), confirmReplace:true});
  await a.startNew({run:newRun('F',17,'replacement-2'), confirmReplace:true});
  requireThat(same(await a.loadBackup('unsupported-1'),raw), 'Malformed raw lost');
  return {preserved:true};
});

await control('C08', 'Unknown format-99 is rejected, then retained under unsupported-1 through two replacements', async () => {
  const { a, backend } = setup();
  const raw = { format: 99, revision: 0, run: { runId: 'old', revision: 0 } };
  backend.stores.run.set('current', clone(raw));
  const loaded = await a.load();
  const before = storage(backend);
  const commitError = await expectCode(() => a.commit({ run: newRun('M', 18, 'fmt99-1') }), 'unsupported_record');
  const replaceError = await expectCode(() => a.startNew({ run: newRun('M', 18, 'fmt99-1') }), 'replace_unconfirmed');
  requireThat(loaded.status === 'unsupported' && same(loaded.raw, raw) && same(before, storage(backend)), 'Unknown raw changed before consent');
  await a.startNew({ run: newRun('M', 18, 'fmt99-1'), confirmReplace: true });
  await a.startNew({ run: newRun('F', 19, 'fmt99-2'), confirmReplace: true });
  requireThat(same(await a.loadBackup('unsupported-1'), raw) && backend.stores.backup.size === 2, 'Unknown raw backup lost');
  return { raw, status: loaded.status, commitError, replaceError, afterTwoReplacements: backupSummary(backend), exactRawPreserved: true };
});

await control('C09', 'Format-1 without a truthy run also receives protected unsupported backup', async () => {
  const { a, backend } = setup();
  const raw = { format: 1, revision: 0, run: null };
  backend.stores.run.set('current', clone(raw));
  requireThat((await a.load()).status === 'unsupported', 'Missing run not rejected');
  await a.startNew({ run: newRun('M', 20, 'missing-1'), confirmReplace: true });
  await a.startNew({ run: newRun('F', 21, 'missing-2'), confirmReplace: true });
  requireThat(same(await a.loadBackup('unsupported-1'), raw), 'Missing-run raw lost');
  return { raw, afterTwoReplacements: backupSummary(backend), exactRawPreserved: true };
});

await control('C10', 'Ordinary same-run stale revision is rejected without changes', async () => {
  const { a, b, backend } = setup();
  const r0 = newRun('M', 22, 'revision-control');
  await a.commit({ run: r0 });
  await b.commit({ run: rolled(r0, 'B-roll'), expectedRevision: 0, opId: 'B-roll' });
  const before = storage(backend);
  const error = await expectCode(() => a.commit({ run: rolled(r0, 'A-roll'), expectedRevision: 0, opId: 'A-roll' }), 'stale_revision');
  requireThat(same(before, storage(backend)), 'Stale revision changed data');
  return { error, allStorageUnchanged: true };
});

await control('C11', 'Memory backend failure preserves both run and meta atomically', async () => {
  const { a, backend } = setup();
  const r0 = newRun('M', 23, 'atomic-control');
  await a.commit({ run: r0, meta: createMeta() });
  const before = storage(backend);
  backend.failNextWrite = true;
  let error;
  try { await a.commit({ run: rolled(r0, 'atomic-1'), meta: { ...createMeta(), settings: { volume: 0.9 } }, expectedRevision: 0, expectedMetaRevision: 1, opId: 'atomic-1' }); }
  catch (e) { error = { name: e.name, message: e.message }; }
  requireThat(error && error.name === 'QuotaExceededError' && same(before, storage(backend)), 'Atomic failure control failed');
  return { error, allStorageUnchanged: true };
});

export const resultsJson = JSON.stringify({
  fixture: {
    kind: 'Synthetic content constructed inside VM; actual generated 100-square boards and shops',
    contentVersion: content.version, routes: ['M', 'F'],
    terminalTransition: 'Actual finishRun(makeCtx(...), declined) on cloned synthetic runs; no full gameplay or score submission',
    tabModel: 'Two createStore instances share one unmodified memory backend; operations awaited sequentially in a controlled interleaving',
  },
  findings, controls,
  summary: {
    reproducedFindings: findings.filter(f => f.status === 'passed').length,
    findingCount: findings.length,
    passedControls: controls.filter(c => c.status === 'passed').length,
    controlCount: controls.length,
    unexpectedFailures: findings.filter(f => f.status !== 'passed').length + controls.filter(c => c.status !== 'passed').length,
    meaning: 'Exit 0 means four regression checks and listed controls passed on local patch, not full product/CI acceptance.',
  },
});

if (JSON.parse(resultsJson).summary.unexpectedFailures) throw new Error('Save regression/control failure: ' + resultsJson);
