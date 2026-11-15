import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRunToMeta, createMeta, dispatch } from '../src/engine/index.js';
import { SaveError, createIndexedDbStore, createMemoryStore } from '../src/save/index.js';
import { createFakeIndexedDB } from './fixtures/fake-idb.mjs';
import { exampleRun, getContent, landOnEvent } from './fixtures/helpers.mjs';

const content = await getContent();

const backends = {
  memory: () => {
    const store = createMemoryStore();
    return { store, seed: (key, value, name = 'run') => store.backend.stores[name].set(key, value), failNext: () => (store.backend.failNextWrite = true), backup: (k) => store.backend.stores.backup.get(k) };
  },
  indexeddb: () => {
    const idb = createFakeIndexedDB();
    const store = createIndexedDbStore({ indexedDB: idb, name: 't' });
    return {
      store,
      seed: async (key, value, name = 'run') => {
        await store.load(); // make sure the database exists
        idb.dbs.get('t').stores[name].set(key, value);
      },
      failNext: () => (idb.faults.quota = true),
      clearFault: () => (idb.faults.quota = false),
      backup: (k) => idb.dbs.get('t').stores.backup.get(k),
    };
  },
};

for (const [name, make] of Object.entries(backends)) {
  test(`[${name}] empty store, first commit, reload gives the same run and meta`, async () => {
    const { store } = make();
    assert.equal((await store.load()).status, 'empty');
    const run = exampleRun(content, 'M');
    const meta = createMeta();
    const r = await store.commit({ run, meta, expectedRevision: null, opId: null });
    assert.deepEqual(r, { ok: true, revision: 0 });
    const loaded = await store.load();
    assert.equal(loaded.status, 'ok');
    assert.deepEqual(loaded.run, run);
    assert.deepEqual(loaded.meta, meta);
    assert.equal(loaded.revision, 0);
    // a second first-save is a stale write
    await assert.rejects(store.commit({ run, expectedRevision: null }), (e) => e instanceof SaveError && e.code === 'stale_revision');
  });

  test(`[${name}] a stale tab is rejected and cannot overwrite the newer revision`, async () => {
    const { store } = make();
    const run0 = exampleRun(content, 'M');
    await store.commit({ run: run0, meta: createMeta(), expectedRevision: null });
    // two tabs read revision 0
    const a = (await store.load()).run;
    const b = (await store.load()).run;
    const stepB = dispatch(content, b, { type: 'roll', opId: 'b-1' }, { rolls: [0.5] }).state;
    await store.commit({ run: stepB, expectedRevision: 0, opId: 'b-1' });
    const stepA = dispatch(content, a, { type: 'roll', opId: 'a-1' }, { rolls: [0.01] }).state;
    await assert.rejects(store.commit({ run: stepA, expectedRevision: 0, opId: 'a-1' }), (e) => e.code === 'stale_revision' && e.details.stored === 1);
    const kept = (await store.load()).run;
    assert.equal(kept.revision, 1);
    assert.equal(kept.roll.raw, stepB.roll.raw);
    // an old revision is not accepted even with a matching expectedRevision claim
    const again = dispatch(content, stepB, { type: 'move', opId: 'b-2' }).state;
    await store.commit({ run: again, expectedRevision: 1, opId: 'b-2' });
    await assert.rejects(store.commit({ run: stepB, expectedRevision: 2, opId: 'b-x' }), (e) => e.code === 'stale_revision');
  });

  test(`[${name}] the same opId is accepted once (replay returns the stored revision, nothing is written twice)`, async () => {
    const { store } = make();
    await store.commit({ run: exampleRun(content, 'M'), meta: createMeta(), expectedRevision: null });
    const run = (await store.load()).run;
    const s1 = dispatch(content, run, { type: 'roll', opId: 'op-7' }, { rolls: [0.5] }).state;
    assert.deepEqual(await store.commit({ run: s1, expectedRevision: 0, opId: 'op-7' }), { ok: true, revision: 1 });
    const replay = await store.commit({ run: s1, expectedRevision: 0, opId: 'op-7' });
    assert.deepEqual(replay, { ok: true, replay: true, revision: 1 });
    assert.equal((await store.load()).run.revision, 1);
  });

  test(`[${name}] a failed write keeps the previous run AND meta (single transaction)`, async () => {
    const h = make();
    const { store } = h;
    const run0 = exampleRun(content, 'M');
    await store.commit({ run: run0, meta: createMeta(), expectedRevision: null });
    const s1 = dispatch(content, run0, { type: 'roll' }, { rolls: [0.5] }).state;
    const meta2 = { ...createMeta(), settings: { volume: 3 } };
    h.failNext();
    await assert.rejects(store.commit({ run: s1, meta: meta2, expectedMetaRevision: 1, expectedRevision: 0, opId: 'x' }));
    if (h.clearFault) h.clearFault();
    const loaded = await store.load();
    assert.equal(loaded.run.revision, 0);
    assert.deepEqual(loaded.meta.settings, {});
    // the operation can simply be retried
    assert.deepEqual(await store.commit({ run: s1, meta: meta2, expectedMetaRevision: 1, expectedRevision: 0, opId: 'x' }), { ok: true, revision: 1 });
    assert.deepEqual((await store.load()).meta.settings, { volume: 3 });
  });

  test(`[${name}] unknown record versions are never wiped: load reports them, commit refuses, startNew parks them in backup`, async () => {
    const h = make();
    const { store } = h;
    const weird = { format: 99, run: { runId: 'old', future: true }, revision: 7 };
    await h.seed('current', weird);
    const l = await store.load();
    assert.equal(l.status, 'unsupported');
    assert.deepEqual(l.raw, weird);
    await assert.rejects(store.commit({ run: exampleRun(content, 'M'), expectedRevision: null }), (e) => e.code === 'unsupported_record');
    await assert.rejects(store.startNew({ run: exampleRun(content, 'M') }), (e) => e.code === 'replace_unconfirmed');
    assert.equal((await store.load()).status, 'unsupported'); // still there
    const res = await store.startNew({ run: exampleRun(content, 'M'), meta: createMeta(), confirmReplace: true });
    assert.equal(res.replaced, true);
    assert.deepEqual(await h.backup('unsupported-1'), weird);
    assert.equal((await store.load()).status, 'ok');
  });

  test(`[${name}] starting over needs confirmation, keeps the old run as backup and locks out the old tab`, async () => {
    const { store } = make();
    const first = exampleRun(content, 'M', 1);
    await store.commit({ run: first, meta: createMeta(), expectedRevision: null });
    const second = { ...exampleRun(content, 'F', 2), runId: 'r-new' };
    await assert.rejects(store.startNew({ run: second }), (e) => e.code === 'replace_unconfirmed');
    await store.startNew({ run: second, meta: createMeta(), expectedMetaRevision: 1, confirmReplace: true });
    assert.equal((await store.load()).run.runId, 'r-new');
    assert.equal((await store.loadBackup()).run.runId, first.runId);
    const step = dispatch(content, first, { type: 'roll' }, { rolls: [0.5] }).state;
    await assert.rejects(store.commit({ run: step, expectedRevision: 0 }), (e) => e.code === 'run_replaced');
  });

  test(`[${name}] play, save, reload, continue: M1-42 pays once across reloads; dex and bests are kept in meta`, async () => {
    const { store } = make();
    const base = exampleRun(content, 'M');
    const landed = landOnEvent(content, base, 'M1-42', { pos: 10, die: 3 });
    let rev = null;
    let meta = createMeta();
    let res = await store.commit({ run: landed.state, meta, expectedRevision: rev });
    rev = res.revision;
    // "close the tab" and come back
    const back = await store.load();
    const paid = dispatch(content, back.run, { type: 'chooseOption', optionId: 'wage', opId: 'p1' });
    await store.commit({ run: paid.state, meta, expectedMetaRevision: back.metaRevision, expectedRevision: back.revision, opId: 'p1' });
    // a double tap / second tab sends the same operation again: it is not applied twice
    const again = await store.commit({ run: paid.state, expectedRevision: back.revision, opId: 'p1' });
    assert.equal(again.replay, true);
    const after = await store.load();
    assert.equal(after.run.gold, 350);
    assert.throws(() => dispatch(content, after.run, { type: 'chooseOption', optionId: 'wage' }), /illegal_action/);
    // dex / bests
    const m = applyRunToMeta(meta, after.run);
    meta = m.meta;
    await store.saveMeta(meta, {expectedMetaRevision:after.metaRevision});
    assert.deepEqual((await store.load()).meta.dex.gear, ['SW01', 'AR01']);
  });

  test(`[${name}] stale metadata rejects saveMeta, commit and startNew atomically`, async () => {
    const { store } = make();
    const first = exampleRun(content, 'M');
    await store.commit({run:first, meta:createMeta()});
    const stale = await store.load();
    const progress = applyRunToMeta(stale.meta, first).meta;
    await store.saveMeta(progress, {expectedMetaRevision:stale.metaRevision});
    const before = await store.load();
    const next = dispatch(content, first, {type:'roll', opId:'next'}, {rolls:[.5]}).state;
    const rejectsStale = e => e.code === 'stale_meta_revision';
    await assert.rejects(store.saveMeta(stale.meta, {expectedMetaRevision:stale.metaRevision}), rejectsStale);
    await assert.rejects(store.saveMeta(stale.meta), rejectsStale);
    await assert.rejects(store.commit({run:next, meta:stale.meta, expectedRevision:before.revision, expectedMetaRevision:stale.metaRevision}), rejectsStale);
    await assert.rejects(store.startNew({run:exampleRun(content,'F'), meta:stale.meta, confirmReplace:true, expectedMetaRevision:stale.metaRevision}), rejectsStale);
    assert.deepEqual(await store.load(), before);
    assert.equal(await store.loadBackup(), undefined);
    // Freshly recomputed settings apply without discarding discoveries.
    const fresh = await store.load();
    fresh.meta.settings.volume = .25;
    await store.saveMeta(fresh.meta, {expectedMetaRevision:fresh.metaRevision});
    const after = await store.load();
    assert.deepEqual(after.meta.dex, progress.dex);
    assert.equal(after.meta.settings.volume, .25);
    assert.equal(after.metaRevision, before.metaRevision + 1);
  });

  test(`[${name}] another run with the same operation ID is never a replay`, async () => {
    const { store } = make();
    const a = exampleRun(content,'M');
    await store.commit({run:a});
    const a1 = dispatch(content,a,{type:'roll',opId:'one'},{rolls:[.5]}).state;
    await store.commit({run:a1,expectedRevision:0,opId:'one'});
    const b = exampleRun(content,'F');
    await store.startNew({run:b,confirmReplace:true});
    const b1 = dispatch(content,b,{type:'roll',opId:'one'},{rolls:[.5]}).state;
    await store.commit({run:b1,expectedRevision:0,opId:'one'});
    const before=await store.load();
    await assert.rejects(store.commit({run:a1,expectedRevision:0,opId:'one'}),e=>e.code==='run_replaced');
    assert.deepEqual(await store.load(),before);
  });

  test(`[${name}] malformed format 1 is retained exactly after two replacements`, async () => {
    const h=make(), store=h.store;
    const raw={format:1,revision:0,run:{runId:'old',revision:0}};
    await h.seed('current',raw);
    assert.equal((await store.load()).status,'unsupported');
    await assert.rejects(store.commit({run:exampleRun(content,'M')}),e=>e.code==='unsupported_record');
    await store.startNew({run:exampleRun(content,'M'),confirmReplace:true});
    await store.startNew({run:exampleRun(content,'F'),confirmReplace:true});
    assert.deepEqual(await store.loadBackup('unsupported-1'),raw);
  });

}
