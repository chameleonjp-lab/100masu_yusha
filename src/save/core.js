// Save store logic shared by the IndexedDB and memory backends.
//
// A backend only has to provide  transaction(mode, async (tx) => result)  where tx = {get, put, delete}
// over three stores: 'run' (key 'current'), 'meta' (key 'meta'), 'backup' (anything we must never lose).
// The whole callback is ONE atomic transaction: either every put lands or none does.
//
// Rules (R48, plan T01):
//  - commit() writes {run, meta} together and checks expectedRevision, so a stale tab is rejected;
//  - the same opId twice is accepted once (idempotent replay);
//  - a record in an unknown format/version is never overwritten or deleted: it is reported by load()
//    and, if a new run is started over it, moved to the 'backup' store first.

import { createMeta } from '../engine/results.js';

export const SAVE_FORMAT = 1;

export class SaveError extends Error {
  constructor(code, message, details) {
    super(message ? `${code}: ${message}` : code);
    this.name = 'SaveError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const RUN_KEY = 'current';
const META_KEY = 'meta';

export function createStore(backend) {
  const store = {
    /**
     * -> { status: 'empty' | 'ok' | 'unsupported', run, meta, revision, raw? }
     * 'unsupported' leaves the record untouched; the UI decides (offer export / start fresh with backup).
     */
    async load() {
      return backend.transaction('read', async (tx) => {
        const rec = await tx.get('run', RUN_KEY);
        const metaRec = await tx.get('meta', META_KEY);
        let meta = createMeta();
        let metaStatus = 'ok';
        if (metaRec) {
          if (metaRec.format === SAVE_FORMAT) meta = metaRec.meta;
          else metaStatus = 'unsupported';
        }
        if (!rec) return { status: 'empty', run: null, meta, metaStatus, revision: null };
        if (rec.format !== SAVE_FORMAT || !rec.run) return { status: 'unsupported', run: null, meta, metaStatus, revision: null, raw: rec };
        return { status: 'ok', run: rec.run, meta, metaStatus, revision: rec.revision, lastOpId: rec.lastOpId || null };
      });
    },

    /**
     * Persist the run and (optionally) the meta in one transaction.
     * expectedRevision = the revision this tab last read/wrote (null for the very first save of a run).
     * -> { ok: true, revision, replay? }  | throws SaveError(stale_revision | run_replaced | unsupported_record | ...)
     */
    async commit({ run, meta, expectedRevision = null, opId = null }) {
      if (!run || typeof run.revision !== 'number') throw new SaveError('bad_run');
      return backend.transaction('write', async (tx) => {
        const cur = await tx.get('run', RUN_KEY);
        if (cur && (cur.format !== SAVE_FORMAT || !cur.run)) throw new SaveError('unsupported_record', 'an unreadable record is stored; it is kept untouched');
        if (cur && opId && cur.lastOpId === opId) return { ok: true, replay: true, revision: cur.revision };
        if (cur && cur.run.runId !== run.runId) throw new SaveError('run_replaced', 'another run was started in this slot', { stored: cur.run.runId, mine: run.runId });
        const curRev = cur ? cur.revision : null;
        if (expectedRevision !== curRev) throw new SaveError('stale_revision', `expected ${expectedRevision}, stored ${curRev}`, { expected: expectedRevision, stored: curRev });
        if (cur && run.revision <= curRev) throw new SaveError('stale_revision', 'revision must increase', { expected: expectedRevision, stored: curRev });
        await tx.put('run', RUN_KEY, { format: SAVE_FORMAT, revision: run.revision, lastOpId: opId, run });
        if (meta) await putMeta(tx, meta);
        return { ok: true, revision: run.revision };
      });
    },

    /**
     * Start a new run over the stored one. The caller has already asked the player
     * ("はじめから" shows the current position and asks); confirmReplace must be true.
     * The replaced record is kept in 'backup'. Old tabs then fail with run_replaced.
     */
    async startNew({ run, meta, confirmReplace = false }) {
      return backend.transaction('write', async (tx) => {
        const cur = await tx.get('run', RUN_KEY);
        if (cur && !confirmReplace) throw new SaveError('replace_unconfirmed', 'a run exists; ask the player first');
        if (cur) {
          let key = 'previous-run';
          if (!(cur.format === SAVE_FORMAT && cur.run)) {
            // an unreadable record is never discarded: park it under a free key
            let n = 1;
            while (await tx.get('backup', `unsupported-${n}`)) n += 1;
            key = `unsupported-${n}`;
          }
          await tx.put('backup', key, cur);
        }
        await tx.put('run', RUN_KEY, { format: SAVE_FORMAT, revision: run.revision, lastOpId: null, run });
        if (meta) await putMeta(tx, meta);
        return { ok: true, revision: run.revision, replaced: !!cur };
      });
    },

    /** Settings / dex / bests only (e.g. a volume change). */
    async saveMeta(meta) {
      return backend.transaction('write', async (tx) => {
        const rec = await tx.get('meta', META_KEY);
        if (rec && rec.format !== SAVE_FORMAT) throw new SaveError('unsupported_record', 'unreadable meta is kept untouched');
        await putMeta(tx, meta);
        return { ok: true };
      });
    },

    async loadBackup(key = 'previous-run') {
      return backend.transaction('read', async (tx) => tx.get('backup', key));
    },
  };
  return store;
}

async function putMeta(tx, meta) {
  const cur = await tx.get('meta', META_KEY);
  if (cur && cur.format !== SAVE_FORMAT) throw new SaveError('unsupported_record', 'unreadable meta is kept untouched');
  await tx.put('meta', META_KEY, { format: SAVE_FORMAT, metaRevision: (cur ? cur.metaRevision : 0) + 1, meta });
}
