import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HOOKS, ITEM_WHERE, OPS, REFS } from '../src/engine/formats.js';
import { loadContentFromDisk, REPO_ROOT } from '../src/content/node.js';

/** Release gate: samples and reserved vocabulary are never completion evidence. */
export function completionReport(content, manifest) {
  const problems = content.problems.map(p => /unwired/.test(p.code) ? { ...p, level: 'error' } : p);
  const coverage = {};
  const inspect = (node, path) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, table] of [['hook',HOOKS],['op',OPS],['ref',REFS]]) {
      if (typeof node[key] === 'string' && !(key === 'ref' && node[key].startsWith('var.'))) {
        const def=table[node[key]];
        if (!def || def.wired === false) problems.push({level:'error',code:'vocabulary-unavailable',message:`${path}: ${key} ${node[key]}`});
      }
    }
    if (Array.isArray(node.where)) for (const name of node.where) if (!ITEM_WHERE[name] || ITEM_WHERE[name].wired === false) problems.push({level:'error',code:'vocabulary-unavailable',message:`${path}: where ${name}`});
    for (const [key,value] of Object.entries(node)) inspect(value,`${path}.${key}`);
  };
  inspect(content.scripts,'scripts');
  for (const [kind, all, expected] of [['events',content.events,1000],['items',content.items,150],['equipment',content.gear,100]]) {
    const ids = Object.keys(all);
    const missing = ids.filter(id => !content.scripts[kind][id] || /(?:^|\/)\_samples/.test(content.scriptSource[kind][id] || ''));
    coverage[kind] = { total: ids.length, implemented: ids.length - missing.length, missing };
    if (ids.length !== expected) problems.push({level:'error',code:'canonical-count',message:`${kind}: expected ${expected}, found ${ids.length}`});
    if (missing.length) problems.push({level:'error',code:'coverage-incomplete',message:`${kind}: ${missing.length} unimplemented IDs`,ids:missing});
    const listed = new Set(manifest?.[kind] || []);
    for (const file of new Set(Object.values(content.scriptSource[kind]))) {
      if (!listed.has(file)) problems.push({level:'error',code:'manifest-missing',message:`${kind}: ${file} is not browser-loadable`});
    }
  }
  return { complete: !problems.some(p => p.level === 'error'), coverage, problems };
}
export async function validateContent(root = REPO_ROOT) {
  const content = await loadContentFromDisk({strict:false}, root);
  const manifest = JSON.parse(await readFile(resolve(root,'data/scripts/manifest.json'),'utf8'));
  return completionReport(content,manifest);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await validateContent();
    console.log(JSON.stringify(report,null,2));
    process.exitCode = report.complete ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({complete:false,error:error.message}));
    process.exitCode = 1;
  }
}
