import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url).pathname;

async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await files(p)));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('the rule engine and content assembly depend on no DOM, clock, Math.random or Node-only API', async () => {
  const banned = /Math\.random|Date\.now|new Date\(|performance\.now|\bdocument\.|\bwindow\.|localStorage|sessionStorage|\bprocess\.|require\(|from 'node:|from "node:/;
  const checked = [...(await files(`${ROOT}src/engine`)), `${ROOT}src/content/index.js`, `${ROOT}src/content/validate.js`, `${ROOT}src/content/browser.js`, ...(await files(`${ROOT}src/save`))];
  for (const f of checked) {
    const text = (await readFile(f, 'utf8')).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.ok(!banned.test(text), `${f} uses a forbidden API`);
  }
  // only the Node loader may touch fs
  const node = await readFile(`${ROOT}src/content/node.js`, 'utf8');
  assert.match(node, /node:fs/);
});

test('engine modules import only each other, the content layer never imports the UI', async () => {
  for (const f of await files(`${ROOT}src/engine`)) {
    const text = await readFile(f, 'utf8');
    for (const m of text.matchAll(/from '([^']+)'/g)) {
      const spec = m[1];
      assert.ok(spec.startsWith('./') || spec === '../content/index.js' || spec.startsWith('../'), `${f}: ${spec}`);
      assert.ok(!/ui|screens|main/.test(spec), `${f} imports ${spec}`);
    }
  }
});
