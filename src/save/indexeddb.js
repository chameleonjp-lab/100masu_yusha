// IndexedDB backend: every call of transaction() is one IDBTransaction over run/meta/backup,
// so {run, meta} are written together or not at all (an abort, e.g. quota, leaves the old record).

import { SaveError, createStore } from './core.js';

export function createIndexedDbBackend({ indexedDB = globalThis.indexedDB, name = 'yusha100', version = 1 } = {}) {
  if (!indexedDB) throw new SaveError('no_indexeddb', 'IndexedDB is not available');
  let opening = null;
  const open = () => {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const rq = indexedDB.open(name, version);
        rq.onupgradeneeded = () => {
          const db = rq.result;
          for (const s of ['run', 'meta', 'backup']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        };
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(new SaveError('open_failed', String(rq.error && rq.error.message)));
        rq.onblocked = () => reject(new SaveError('open_blocked'));
      }).catch((e) => {
        opening = null;
        throw e;
      });
    }
    return opening;
  };
  const req = (rq) =>
    new Promise((resolve, reject) => {
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error || new SaveError('request_failed'));
    });
  return {
    async transaction(mode, fn) {
      const db = await open();
      return new Promise((resolve, reject) => {
        let tx;
        try {
          tx = db.transaction(['run', 'meta', 'backup'], mode === 'write' ? 'readwrite' : 'readonly');
        } catch (e) {
          reject(new SaveError('transaction_failed', String(e && e.message)));
          return;
        }
        let result;
        let failure = null;
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(failure || new SaveError('storage_failed', String((tx.error && tx.error.message) || 'aborted')));
        tx.onerror = () => {};
        const api = {
          get: (store, key) => req(tx.objectStore(store).get(key)),
          put: (store, key, value) => req(tx.objectStore(store).put(value, key)),
          delete: (store, key) => req(tx.objectStore(store).delete(key)),
        };
        Promise.resolve()
          .then(() => fn(api))
          .then(
            (r) => {
              result = r;
            },
            (e) => {
              failure = e;
              try {
                tx.abort();
              } catch {
                reject(e);
              }
            },
          );
      });
    },
  };
}

export function createIndexedDbStore(options) {
  return createStore(createIndexedDbBackend(options));
}
