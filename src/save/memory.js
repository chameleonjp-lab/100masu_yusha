// In-memory backend for tests (same transactional behaviour as IndexedDB: staged writes, all-or-nothing).

import { createStore } from './core.js';

export function createMemoryBackend() {
  const stores = { run: new Map(), meta: new Map(), backup: new Map() };
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const backend = {
    stores,
    /** test hook: make the next write transaction fail after its callback ran (like a quota error) */
    failNextWrite: false,
    async transaction(mode, fn) {
      const staged = [];
      const tx = {
        async get(store, key) {
          for (let i = staged.length - 1; i >= 0; i--) if (staged[i].store === store && staged[i].key === key) return staged[i].op === 'delete' ? undefined : clone(staged[i].value);
          return clone(stores[store].get(key));
        },
        async put(store, key, value) {
          staged.push({ op: 'put', store, key, value: clone(value) });
        },
        async delete(store, key) {
          staged.push({ op: 'delete', store, key });
        },
      };
      const result = await fn(tx);
      if (mode === 'write') {
        if (backend.failNextWrite) {
          backend.failNextWrite = false;
          const e = new Error('QuotaExceededError');
          e.name = 'QuotaExceededError';
          throw e;
        }
        for (const w of staged) {
          if (w.op === 'put') stores[w.store].set(w.key, w.value);
          else stores[w.store].delete(w.key);
        }
      }
      return result;
    },
  };
  return backend;
}

export function createMemoryStore() {
  const backend = createMemoryBackend();
  const store = createStore(backend);
  store.backend = backend;
  return store;
}
