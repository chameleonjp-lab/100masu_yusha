// Node loader (fs). Reads data/ relative to the repo root.
// Script files are discovered by listing the directories (the manifest is for the browser).

import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from './index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..');

export function createNodeLoader(root = REPO_ROOT) {
  return {
    root,
    async readJson(rel, opts = {}) {
      try {
        return JSON.parse(await readFile(join(root, rel), 'utf8'));
      } catch (e) {
        if (e && e.code === 'ENOENT' && opts.optional) return null;
        throw e;
      }
    },
    async sha256(rel) {
      return createHash('sha256')
        .update(await readFile(join(root, rel)))
        .digest('hex');
    },
    async scriptFiles() {
      const dir = join(root, 'data', 'scripts');
      const out = { events: [], items: [], equipment: [] };
      const list = async (sub) => {
        try {
          return (await readdir(sub)).filter((f) => f.endsWith('.json')).sort();
        } catch (e) {
          if (e.code === 'ENOENT') return [];
          throw e;
        }
      };
      for (const f of await list(join(dir, 'events'))) out.events.push(`events/${f}`);
      for (const f of await list(dir)) {
        if (f === 'manifest.json') continue;
        if (/^(_samples-)?items\.json$/.test(f)) out.items.push(f);
        else if (/^(_samples-)?equipment\.json$/.test(f)) out.equipment.push(f);
      }
      return out;
    },
  };
}

/** Convenience: build the full content from the repo on disk. */
export async function loadContentFromDisk(options = {}, root = REPO_ROOT) {
  return loadContent(createNodeLoader(root), options);
}
