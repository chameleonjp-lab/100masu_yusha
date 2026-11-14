// A tiny in-memory stand-in for the IndexedDB API subset used by src/save/indexeddb.js
// (open + upgrade, object stores, get/put/delete, transaction complete/abort). Not a general fake.
// Transactions auto-commit once no request is pending after a macrotask, like the real thing,
// and writes are staged so an abort restores the old state.

export function createFakeIndexedDB() {
  const dbs = new Map(); // name -> { stores: {name: Map} }
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const faults = { failPutOnce: false, quota: false };

  function makeDb(name, data) {
    return {
      name,
      objectStoreNames: { contains: (s) => s in data.stores },
      createObjectStore: (s) => {
        data.stores[s] = new Map();
      },
      transaction(names, mode) {
        const staged = new Map(); // store -> Map (copy on write)
        const view = (s) => staged.get(s) || data.stores[s];
        const writable = (s) => {
          if (!staged.has(s)) staged.set(s, new Map(data.stores[s]));
          return staged.get(s);
        };
        let pending = 0;
        let done = false;
        const tx = { oncomplete: null, onabort: null, onerror: null, error: null };
        const finish = () => {
          if (done) return;
          done = true;
          if (tx.error) {
            if (tx.onabort) tx.onabort();
            return;
          }
          for (const [s, m] of staged) data.stores[s] = m;
          if (tx.oncomplete) tx.oncomplete();
        };
        const schedule = () => setTimeout(() => (pending === 0 ? finish() : undefined), 0);
        const request = (fn) => {
          const rq = { result: undefined, error: null, onsuccess: null, onerror: null };
          pending += 1;
          queueMicrotask(() => {
            if (done) return;
            try {
              rq.result = fn();
            } catch (e) {
              rq.error = e;
              tx.error = e;
              pending -= 1;
              if (rq.onerror) rq.onerror();
              schedule();
              return;
            }
            pending -= 1;
            if (rq.onsuccess) rq.onsuccess();
            schedule();
          });
          return rq;
        };
        tx.objectStore = (s) => {
          if (!names.includes(s)) throw new Error(`store ${s} not in transaction`);
          return {
            get: (k) => request(() => clone(view(s).get(k))),
            put: (v, k) =>
              request(() => {
                if (mode === 'readonly') throw new Error('ReadOnlyError');
                if (faults.quota) {
                  const e = new Error('QuotaExceededError');
                  e.name = 'QuotaExceededError';
                  throw e;
                }
                writable(s).set(k, clone(v));
                return k;
              }),
            delete: (k) =>
              request(() => {
                writable(s).delete(k);
              }),
          };
        };
        tx.abort = () => {
          if (done) return;
          tx.error = tx.error || new Error('AbortError');
          finish();
        };
        schedule();
        return tx;
      },
    };
  }

  return {
    faults,
    dbs,
    open(name) {
      const rq = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      queueMicrotask(() => {
        let data = dbs.get(name);
        const fresh = !data;
        if (fresh) {
          data = { stores: {} };
          dbs.set(name, data);
        }
        rq.result = makeDb(name, data);
        if (fresh && rq.onupgradeneeded) rq.onupgradeneeded();
        if (rq.onsuccess) rq.onsuccess();
      });
      return rq;
    },
  };
}
