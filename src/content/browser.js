// Browser loader (fetch). Script files are discovered from data/scripts/manifest.json,
// which lists what exists (the data-conversion role extends it when it adds files):
//   { "format": "script-manifest-1", "events": ["events/M1.json", ...], "items": ["items.json"], "equipment": [...] }

import { loadContent } from './index.js';

export function createBrowserLoader(baseUrl = './', fetchImpl = globalThis.fetch) {
  const url = (rel) => new URL(rel, new URL(baseUrl, globalThis.location ? globalThis.location.href : 'http://localhost/')).href;
  return {
    async readJson(rel, opts = {}) {
      const res = await fetchImpl(url(rel));
      if (!res.ok) {
        if (opts.optional) return null;
        throw new Error(`fetch ${rel} failed: ${res.status}`);
      }
      return res.json();
    },
    async scriptFiles() {
      const res = await fetchImpl(url('data/scripts/manifest.json'));
      if (!res.ok) throw new Error(`fetch data/scripts/manifest.json failed: ${res.status}`);
      const m = await res.json();
      if (m.format !== 'script-manifest-1') throw new Error('unknown script manifest format');
      return { events: m.events || [], items: m.items || [], equipment: m.equipment || [] };
    },
  };
}

export async function loadContentInBrowser(baseUrl = './', options = {}) {
  return loadContent(createBrowserLoader(baseUrl), options);
}
