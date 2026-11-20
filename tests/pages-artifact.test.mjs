import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {servedVerifier} from './browser/pages-served-bytes.mjs';
import { validateSource } from '../tools/build-pages.mjs';

// Fixtures are synthetic existence markers, not game/ranking implementations.
// Every negative starts in a new directory; nothing is removed or cleaned up.
// Each suite owns a fresh parent beneath this test directory, independent of
// cwd or pre-created artifact directories. Retain it and never reuse/delete it.
const fixtures = fs.mkdtempSync(path.join(
  path.dirname(fileURLToPath(import.meta.url)), '.pages-artifact-fixtures-',
));
const cli = fileURLToPath(new URL('../tools/build-pages.mjs', import.meta.url));
const boot = ['index.html', 'src/style.css', 'src/ui/app.js', 'src/ui/ranking.js', 'src/ranking/local.js'];
const locales = ['ja', 'en', 'es', 'pt-BR', 'zh-Hans', 'fr', 'de', 'ko', 'ru', 'it', 'zh-Hant', 'id', 'tr', 'vi', 'th'];
const scripts = {
  events: ['events/main.json', 'events/_samples.json'],
  items: ['items.json', '_samples-items.json'],
  equipment: ['equipment.json', '_samples-equipment.json'],
};
const manifestPath = 'data/scripts/manifest.json';
const blob = value => createHash('sha1').update(`blob ${Buffer.byteLength(value)}\0`).update(value).digest('hex');

function snapshot(root) {
  const entries = [];
  function walk(dir, rel = '') {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name), r = rel ? `${rel}/${name}` : name, s = fs.lstatSync(p);
      if (s.isSymbolicLink()) entries.push([r, 'symlink', fs.readlinkSync(p)]);
      else if (s.isDirectory()) { entries.push([r, 'directory']); walk(p, r); }
      else entries.push([r, s.mode, createHash('sha256').update(fs.readFileSync(p)).digest('hex')]);
    }
  }
  walk(root);
  return entries;
}

function fixture({ omit = [], manifest, rawManifest, overrides = {}, symlinks = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(fixtures, 'source-'));
  const files = Object.fromEntries(boot.map(p => [p, '// synthetic marker only\n']));
  for (const list of Object.values(scripts)) for (const p of list) files[`data/scripts/${p}`] = '{}\n';
  for (const locale of locales) files[`src/locales/messages/${locale}.json`] = '{}\n';
  files[manifestPath] = rawManifest ?? JSON.stringify(manifest ?? { format: 'script-manifest-1', note: 'synthetic', ...scripts });
  Object.assign(files, overrides);
  const expectedTree = { tree: Object.entries(files).map(([p, bytes]) => ({ path: p, type: 'blob', mode: '100644', size: Buffer.byteLength(bytes), sha: blob(bytes) })), truncated: false };
  const skip = new Set([...omit, ...Object.keys(symlinks)]);
  for (const [p, bytes] of Object.entries(files)) {
    if (skip.has(p)) continue;
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), bytes, { flag: 'wx' });
  }
  for (const [p, target] of Object.entries(symlinks)) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.symlinkSync(target, path.join(dir, p));
  }
  return { dir, expectedTree };
}

function check(f, extra = {}) {
  const before = snapshot(f.dir);
  const result = validateSource({ source: f.dir, expectedTree: f.expectedTree, ...extra });
  assert.deepEqual(snapshot(f.dir), before, 'validator must not change any source bytes/path/mode');
  assert.equal(typeof result.ok, 'boolean');
  assert.ok(Array.isArray(result.diagnostics));
  assert.equal(result.mode, 'check-only');
  return result;
}
function fails(result, code) {
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some(d => d.code === code), JSON.stringify(result));
}
function run(args) {
  const p = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(p.stderr, '', 'CLI uses JSON stdout, never stack/private content');
  return { status: p.status, result: JSON.parse(p.stdout) };
}
function metadataFile(f) {
  const p = path.join(fixtures, `metadata-${path.basename(f.dir)}.json`);
  fs.writeFileSync(p, JSON.stringify(f.expectedTree), { flag: 'wx' });
  return p;
}

test('exact minimal fixture passes without importing executable prerequisites', () => {
  const f = fixture({ overrides: { 'src/ui/app.js': 'throw new Error("MUST_NOT_EXECUTE");\n' } });
  const r = check(f, { verifyExact: true });
  assert.equal(r.ok, true);
  assert.equal(r.bootReadiness.ok, true);
  assert.equal(r.sourceExactness.ok, true);
  assert.equal(r.sourceExactness.checkedFiles, 27);
  assert.equal(r.locales.checkedFiles, 15);
  assert.equal(r.scriptManifest.declaredFiles, 6);
  assert.deepEqual(r.diagnostics, []);
});
for (const p of boot) test(`missing boot prerequisite fails: ${p}`, () => {
  const r = check(fixture({ omit: [p] }));
  fails(r, 'BOOT_MISSING');
  assert.equal(r.bootReadiness.ok, false);
  assert.ok(r.diagnostics.some(d => d.path === p));
  assert.equal(r.sourceExactness.ok, null);
});
for (const section of ['events', 'items', 'equipment']) {
  for (const p of scripts[section]) test(`declared ${section} script including samples is required: ${p}`, () => {
    fails(check(fixture({ omit: [`data/scripts/${p}`] })), 'SCRIPT_MISSING');
  });
  test(`missing manifest section fails: ${section}`, () => {
    const m = { format: 'script-manifest-1', ...scripts };
    const bad = Object.fromEntries(Object.entries(m).filter(([k]) => k !== section));
    fails(check(fixture({ manifest: bad })), 'MANIFEST_SCHEMA');
  });
  test(`non-array manifest section fails: ${section}`, () => {
    fails(check(fixture({ manifest: { format: 'script-manifest-1', ...scripts, [section]: 'items.json' } })), 'MANIFEST_SCHEMA');
  });
}
for (const [name, options, code] of [
  ['malformed JSON', { rawManifest: '{PRIVATE_FIXTURE_TEXT' }, 'MANIFEST_JSON'],
  ['null', { rawManifest: 'null' }, 'MANIFEST_SCHEMA'],
  ['array', { rawManifest: '[]' }, 'MANIFEST_SCHEMA'],
  ['unknown format', { manifest: { format: 'script-manifest-2', ...scripts } }, 'MANIFEST_SCHEMA'],
  ['unknown key', { manifest: { format: 'script-manifest-1', ...scripts, remote: [] } }, 'MANIFEST_SCHEMA'],
  ['non-string declaration', { manifest: { format: 'script-manifest-1', ...scripts, events: [null] } }, 'MANIFEST_SCHEMA'],
  ['invalid note', { manifest: { format: 'script-manifest-1', ...scripts, note: {} } }, 'MANIFEST_SCHEMA'],
  ['missing manifest', { omit: [manifestPath] }, 'MANIFEST_MISSING'],
]) test(name, () => {
  const r = check(fixture(options)); fails(r, code);
  assert.equal(JSON.stringify(r).includes('PRIVATE_FIXTURE_TEXT'), false);
});
for (const p of ['../escape.json', '/absolute.json', 'https://example.invalid/a.json', '//example.invalid/a.json', 'C:\\a.json', 'events/../../escape.json', 'events/%2e%2e/a.json', 'events/./main.json', 'events//main.json', 'events/main.json?x', 'events/main.js']) {
  test(`unsafe script declaration fails closed: ${p}`, () => {
    fails(check(fixture({ manifest: { format: 'script-manifest-1', ...scripts, events: [p] } })), 'MANIFEST_PATH');
  });
}
test('leaf symlink to another synthetic fixture is rejected', () => {
  const other = fixture();
  const f = fixture({ symlinks: { 'src/ui/app.js': path.join(other.dir, 'src/ui/app.js') } });
  fails(check(f), 'SYMLINK');
});
test('directory symlink to another synthetic fixture is rejected', () => {
  const other = fixture();
  const f = fixture({ omit: boot.filter(p => p.startsWith('src/ui/')), symlinks: { 'src/ui': path.join(other.dir, 'src/ui') } });
  fails(check(f), 'SYMLINK');
});
test('source root symlink is rejected', () => {
  const f = fixture(), link = path.join(fixtures, `root-link-${path.basename(f.dir)}`);
  fs.symlinkSync(f.dir, link);
  fails(validateSource({ source: link }), 'SYMLINK');
});
test('hash mismatch fails even when size matches', () => {
  const f = fixture();
  f.expectedTree.tree[0].sha = '0'.repeat(40);
  const r = check(f, { verifyExact: true });
  fails(r, 'EXACT_HASH'); assert.equal(r.sourceExactness.ok, false);
});
test('byte count mismatch fails', () => {
  const f = fixture(); f.expectedTree.tree[0].size += 1;
  fails(check(f, { verifyExact: true }), 'EXACT_SIZE');
});
test('unexpected file is not an exact source match', () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.dir, 'extra.txt'), 'synthetic extra', { flag: 'wx' });
  fails(check(f, { verifyExact: true }), 'EXACT_UNEXPECTED');
});
for (const metadata of [null, {}, { tree: [], truncated: false }, { tree: [], truncated: true }, { tree: [{ path: '../escape', type: 'blob', mode: '100644', size: 0, sha: '0'.repeat(40) }] }]) {
  test(`unavailable/unsafe exact metadata fails: ${JSON.stringify(metadata)}`, () => {
    fails(check(fixture(), { expectedTree: metadata, verifyExact: true }), 'TREE_METADATA');
  });
}
test('unsupported metadata mode fails', () => {
  const f = fixture(); f.expectedTree.tree[0].mode = '120000';
  fails(check(f, { verifyExact: true }), 'TREE_METADATA');
});
for (const locale of locales) test(`locale presence required: ${locale}`, () => {
  fails(check(fixture({ omit: [`src/locales/messages/${locale}.json`] })), 'LOCALE_MISSING');
});
for (const source of [undefined, 42, path.join(fixtures, 'does-not-exist')]) test(`invalid/unavailable source fails: ${source}`, () => {
  fails(validateSource({ source }), 'SOURCE_INVALID');
});
test('non-directory/unreadable source is an error', () => {
  const f = fixture();
  fails(validateSource({ source: path.join(f.dir, 'index.html') }), 'SOURCE_INVALID');
  const blocked = fixture({ omit: ['index.html'] });
  fs.mkdirSync(path.join(blocked.dir, 'index.html'));
  fails(check(blocked), 'SOURCE_READ');
});
test('exactness success is distinct from boot readiness failure', () => {
  const f = fixture({ omit: ['index.html'] });
  f.expectedTree.tree = f.expectedTree.tree.filter(e => e.path !== 'index.html');
  const r = check(f, { verifyExact: true });
  fails(r, 'BOOT_MISSING'); assert.equal(r.sourceExactness.ok, true);
});
test('CLI check succeeds without writing source or artifact', () => {
  const f = fixture(), metadata = metadataFile(f), before = snapshot(f.dir);
  const { status, result } = run(['--check', '--source', f.dir, '--tree', metadata, '--exact']);
  assert.equal(status, 0); assert.equal(result.ok, true);
  assert.deepEqual(snapshot(f.dir), before);
});
test('CLI check handles GitHub wrapper metadata', () => {
  const f = fixture(), p = path.join(fixtures, `wrapper-${path.basename(f.dir)}.json`);
  fs.writeFileSync(p, JSON.stringify({ structuredContent: { content: JSON.stringify(f.expectedTree) } }), { flag: 'wx' });
  assert.equal(run(['--check', '--source', f.dir, '--tree', p, '--exact']).status, 0);
});
test('CLI incomplete source is a nonzero JSON result', () => {
  const f = fixture({ omit: ['index.html'] }), metadata = metadataFile(f);
  const { status, result } = run(['--check', '--source', f.dir, '--tree', metadata]);
  assert.equal(status, 1); fails(result, 'BOOT_MISSING');
});
for (const args of [[], ['--source', 'synthetic'], ['--check', '--out', 'synthetic'], ['--out', 'synthetic'], ['--check', '--unknown'], ['--check', '--source'], ['--check', '--source', 'x', '--source', 'y']]) {
  test(`CLI refuses unsupported or incomplete arguments: ${JSON.stringify(args)}`, () => {
    const { status, result } = run(args);
    assert.equal(status, 2); fails(result, 'CLI_USAGE');
    assert.equal(result.fullBuildSupported, false);
  });
}
test('CLI unavailable metadata is a nonzero JSON error', () => {
  const f = fixture();
  const { status, result } = run(['--check', '--source', f.dir, '--tree', path.join(fixtures, 'absent.json'), '--exact']);
  assert.equal(status, 2); fails(result, 'TREE_METADATA');
});

test('nonexact checks still reject invalid supplied tree schema', () => {
  fails(check(fixture(), { expectedTree: { tree: [] } }), 'TREE_METADATA');
});
test('null options return diagnostics instead of throwing', () => {
  fails(validateSource(null), 'OPTIONS_INVALID');
});
test('invalid verifyExact option returns diagnostics', () => {
  fails(check(fixture(), { verifyExact: 'yes' }), 'OPTIONS_INVALID');
});
test('a genuinely unreadable prerequisite is an error without content disclosure', () => {
  const f = fixture(), p = path.join(f.dir, 'index.html');
  fs.chmodSync(p, 0);
  const mode = fs.lstatSync(p).mode;
  fails(validateSource({ source: f.dir, expectedTree: f.expectedTree }), 'SOURCE_READ');
  assert.equal(fs.lstatSync(p).mode, mode);
});
test('CLI malformed tree schema cannot pass without --exact', () => {
  const f = fixture(), p = path.join(fixtures, `bad-schema-${path.basename(f.dir)}.json`);
  fs.writeFileSync(p, '{}', { flag: 'wx' });
  const { status, result } = run(['--check', '--source', f.dir, '--tree', p]);
  assert.equal(status, 1); fails(result, 'TREE_METADATA');
});

// Q2 build uses reviewed real runtime bytes in fresh private directories.
// Only Git commit/tree metadata is synthetic; no product module is evaluated.
import * as pagesBuilder from '../tools/build-pages.mjs';
const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewedAppHash=createHash('sha256').update(fs.readFileSync(path.join(runtimeRoot,'src/ui/app.js'))).digest('hex');
assert.equal(reviewedAppHash,'c4a1fd8eaeeeaff79b26f0240649e3e1d0779a6e0cfd3c4488df391ad70840d7','explicit reviewed app revision required');
const hasTimeline=true; // Both approved revisions ship the same timeline dependency.
const buildFiles = ['assets/img/bg/gate.svg','assets/img/bg/throne.svg','src/ui/castle-background.js','src/ui/castle-background-dom.js','src/ui/castle-background-cache.js',"assets/characters/comp-lantern-idle.svg", "assets/characters/comp-lantern-support.svg", "assets/characters/comp-medic-idle.svg", "assets/characters/comp-medic-support.svg", "assets/characters/comp-shield-idle.svg", "assets/characters/comp-shield-support.svg", "assets/characters/comp-thrower-idle.svg", "assets/characters/comp-thrower-support.svg", "assets/characters/dk01-p1-attack.svg", "assets/characters/dk01-p1-big.svg", "assets/characters/dk01-p1-guard.svg", "assets/characters/dk01-p1-idle.svg", "assets/characters/dk01-p1-open.svg", "assets/characters/dk01-p2-attack.svg", "assets/characters/dk01-p2-big.svg", "assets/characters/dk01-p2-guard.svg", "assets/characters/dk01-p2-idle.svg", "assets/characters/dk01-p2-open.svg", "assets/characters/en01-attack.svg", "assets/characters/en01-big.svg", "assets/characters/en01-guard.svg", "assets/characters/en01-hit.svg", "assets/characters/en01-idle.svg", "assets/characters/en01-open.svg", "assets/characters/en02-attack.svg", "assets/characters/en02-big.svg", "assets/characters/en02-guard.svg", "assets/characters/en02-hit.svg", "assets/characters/en02-idle.svg", "assets/characters/en02-open.svg", "assets/characters/en03-attack.svg", "assets/characters/en03-big.svg", "assets/characters/en03-guard.svg", "assets/characters/en03-hit.svg", "assets/characters/en03-idle.svg", "assets/characters/en03-open.svg", "assets/characters/en04-attack.svg", "assets/characters/en04-big.svg", "assets/characters/en04-guard.svg", "assets/characters/en04-hit.svg", "assets/characters/en04-idle.svg", "assets/characters/en04-open.svg", "assets/characters/en05-attack.svg", "assets/characters/en05-big.svg", "assets/characters/en05-guard.svg", "assets/characters/en05-hit.svg", "assets/characters/en05-idle.svg", "assets/characters/en05-open.svg", "assets/characters/en06-attack.svg", "assets/characters/en06-big.svg", "assets/characters/en06-guard.svg", "assets/characters/en06-hit.svg", "assets/characters/en06-idle.svg", "assets/characters/en06-open.svg", "assets/characters/en07-attack.svg", "assets/characters/en07-big.svg", "assets/characters/en07-guard.svg", "assets/characters/en07-hit.svg", "assets/characters/en07-idle.svg", "assets/characters/en07-open.svg", "assets/characters/en08-attack.svg", "assets/characters/en08-big.svg", "assets/characters/en08-guard.svg", "assets/characters/en08-hit.svg", "assets/characters/en08-idle.svg", "assets/characters/en08-open.svg", "assets/characters/en09-attack.svg", "assets/characters/en09-big.svg", "assets/characters/en09-guard.svg", "assets/characters/en09-hit.svg", "assets/characters/en09-idle.svg", "assets/characters/en09-open.svg", "assets/characters/en10-attack.svg", "assets/characters/en10-big.svg", "assets/characters/en10-guard.svg", "assets/characters/en10-hit.svg", "assets/characters/en10-idle.svg", "assets/characters/en10-open.svg", "assets/characters/en11-attack.svg", "assets/characters/en11-big.svg", "assets/characters/en11-guard.svg", "assets/characters/en11-hit.svg", "assets/characters/en11-idle.svg", "assets/characters/en11-open.svg", "assets/characters/en12-attack.svg", "assets/characters/en12-big.svg", "assets/characters/en12-guard.svg", "assets/characters/en12-hit.svg", "assets/characters/en12-idle.svg", "assets/characters/en12-open.svg", "assets/characters/en13-attack.svg", "assets/characters/en13-big.svg", "assets/characters/en13-guard.svg", "assets/characters/en13-hit.svg", "assets/characters/en13-idle.svg", "assets/characters/en13-open.svg", "assets/characters/hero-bard-attack.svg", "assets/characters/hero-bard-cast-prepare.svg", "assets/characters/hero-bard-cast.svg", "assets/characters/hero-bard-down.svg", "assets/characters/hero-bard-guard.svg", "assets/characters/hero-bard-hit.svg", "assets/characters/hero-bard-idle.svg", "assets/characters/hero-bard-victory.svg", "assets/characters/hero-bard-walk1.svg", "assets/characters/hero-bard-walk2.svg", "assets/characters/hero-mage-attack.svg", "assets/characters/hero-mage-cast-prepare.svg", "assets/characters/hero-mage-cast.svg", "assets/characters/hero-mage-down.svg", "assets/characters/hero-mage-guard.svg", "assets/characters/hero-mage-hit.svg", "assets/characters/hero-mage-idle.svg", "assets/characters/hero-mage-victory.svg", "assets/characters/hero-mage-walk1.svg", "assets/characters/hero-mage-walk2.svg", "assets/characters/hero-traveler-attack.svg", "assets/characters/hero-traveler-cast-prepare.svg", "assets/characters/hero-traveler-cast.svg", "assets/characters/hero-traveler-down.svg", "assets/characters/hero-traveler-guard.svg", "assets/characters/hero-traveler-hit.svg", "assets/characters/hero-traveler-idle.svg", "assets/characters/hero-traveler-victory.svg", "assets/characters/hero-traveler-walk1.svg", "assets/characters/hero-traveler-walk2.svg", "assets/characters/hero-warrior-attack.svg", "assets/characters/hero-warrior-cast-prepare.svg", "assets/characters/hero-warrior-cast.svg", "assets/characters/hero-warrior-down.svg", "assets/characters/hero-warrior-guard.svg", "assets/characters/hero-warrior-hit.svg", "assets/characters/hero-warrior-idle.svg", "assets/characters/hero-warrior-victory.svg", "assets/characters/hero-warrior-walk1.svg", "assets/characters/hero-warrior-walk2.svg", "assets/characters/mb01-attack.svg", "assets/characters/mb01-big.svg", "assets/characters/mb01-guard.svg", "assets/characters/mb01-hit.svg", "assets/characters/mb01-idle.svg", "assets/characters/mb01-open.svg", "assets/characters/mb02-attack.svg", "assets/characters/mb02-big.svg", "assets/characters/mb02-guard.svg", "assets/characters/mb02-hit.svg", "assets/characters/mb02-idle.svg", "assets/characters/mb02-open.svg", "assets/characters/mb03-attack.svg", "assets/characters/mb03-big.svg", "assets/characters/mb03-guard.svg", "assets/characters/mb03-hit.svg", "assets/characters/mb03-idle.svg", "assets/characters/mb03-open.svg", "assets/characters/metrics.js", "data/adventure-content.json", "data/balance-draft-2.json", "data/patches/encounters-balance-draft-2.json", "data/scripts/_samples-equipment.json", "data/scripts/_samples-items.json", "data/scripts/equipment.json", "data/scripts/events/B1.json", "data/scripts/events/B2.json", "data/scripts/events/B3.json", "data/scripts/events/B4.json", "data/scripts/events/B5.json", "data/scripts/events/F1.json", "data/scripts/events/F2.json", "data/scripts/events/F3.json", "data/scripts/events/F4.json", "data/scripts/events/F5.json", "data/scripts/events/H1.json", "data/scripts/events/H2.json", "data/scripts/events/H3.json", "data/scripts/events/H4.json", "data/scripts/events/H5.json", "data/scripts/events/M1.json", "data/scripts/events/M2.json", "data/scripts/events/M3.json", "data/scripts/events/M4.json", "data/scripts/events/M5.json", "data/scripts/events/_samples.json", "data/scripts/items.json", "data/scripts/manifest.json", "data/tuning.json", "index.html", "src/content/browser.js", "src/content/index.js", "src/content/validate.js", "src/engine/battle.js", "src/engine/board.js", "src/engine/core.js", "src/engine/custom/index.js", "src/engine/events.js", "src/engine/expr.js", "src/engine/formats.js", "src/engine/index.js", "src/engine/info-items.js", "src/engine/inn.js", "src/engine/items.js", "src/engine/landing-kind-items.js", "src/engine/ops-basic.js", "src/engine/options.js", "src/engine/puzzles.js", "src/engine/results.js", "src/engine/rng.js", "src/engine/runner.js", "src/engine/state.js", "src/engine/status.js", "src/engine/trap-items.js", "src/engine/util.js", "src/engine/view.js", "src/locales/catalogs.js", "src/locales/key-manifest.json", "src/locales/messages/de.json", "src/locales/messages/en.json", "src/locales/messages/es.json", "src/locales/messages/fr.json", "src/locales/messages/id.json", "src/locales/messages/it.json", "src/locales/messages/ja.json", "src/locales/messages/ko.json", "src/locales/messages/pt-BR.json", "src/locales/messages/ru.json", "src/locales/messages/th.json", "src/locales/messages/tr.json", "src/locales/messages/vi.json", "src/locales/messages/zh-Hans.json", "src/locales/messages/zh-Hant.json", "src/locales/ui-templates.js", "src/ranking/local.js", "src/save/core.js", "src/save/index.js", "src/save/indexeddb.js", "src/save/memory.js", "src/style.css", "src/ui/app.js", "src/ui/audio-recipes.js", "src/ui/audio.js", "src/ui/i18n.js", "src/ui/king-crown-renderer.js", "src/ui/king-crown-segment.js", "src/ui/king-turn-plan.js", "src/ui/king-reward-sequence.js", "src/ui/king-reward-packet.js", "src/ui/castle-arrival-ui.js", "src/ui/king-spell-timeline.js", "src/ui/spell-effect-consumer.js", "src/ui/king-victory-renderer.js", "src/ui/king-victory-segment.js", "src/ui/presentation-timeline.js", "src/ui/presentation.js", "src/ui/ranking.js", "src/ui/session.js", "src/ui/stage.js", "src/ui/normal-guard-plan.js", "src/ui/normal-flee-plan.js", "src/ui/result-route-light.js", "src/ui/saved-result-receipt.js"];
const digest = b => createHash('sha256').update(b).digest('hex');
const gitObject = (kind, b) => createHash('sha1').update(`${kind} ${b.length}\0`).update(b).digest('hex');
function syntheticTree(files) {
  const nodes = new Map([['', new Map()]]);
  for (const [p,b] of Object.entries(files)) {
    const parts=p.split('/'); let dir='';
    for (const part of parts.slice(0,-1)) { const next=dir?`${dir}/${part}`:part; if(!nodes.has(next))nodes.set(next,new Map()); nodes.get(dir).set(part,{type:'tree',path:next});dir=next; }
    nodes.get(dir).set(parts.at(-1),{type:'blob',path:p,sha:gitObject('blob',b),size:b.length,mode:'100644'});
  }
  const tree=[];
  function visit(dir) {
    const rows=[];
    for (const [name,e] of nodes.get(dir)) {
      if(e.type==='tree') {e.sha=visit(e.path);e.mode='040000';tree.push({path:e.path,type:'tree',mode:e.mode,sha:e.sha});}
      else tree.push({...e});
      rows.push({key:Buffer.from(name+(e.type==='tree'?'/':'')),value:Buffer.concat([Buffer.from(`${e.type==='tree'?'40000':e.mode} ${name}\0`),Buffer.from(e.sha,'hex')])});
    }
    rows.sort((a,b)=>Buffer.compare(a.key,b.key));return gitObject('tree',Buffer.concat(rows.map(x=>x.value)));
  }
  const sha=visit('');return {sha,truncated:false,tree:tree.sort((a,b)=>a.path.localeCompare(b.path))};
}
function realFixture() {
  const dir=fs.mkdtempSync(path.join(fixtures,'real-runtime-'));
  const files={};for(const p of buildFiles) {files[p]=fs.readFileSync(path.join(runtimeRoot,p));fs.mkdirSync(path.dirname(path.join(dir,p)),{recursive:true});fs.writeFileSync(path.join(dir,p),files[p],{flag:'wx'});}
  files['docs/private-test-marker.txt']=Buffer.from('PRIVATE_TEST_MARKER_NOT_FOR_ARTIFACT');fs.mkdirSync(path.join(dir,'docs'));fs.writeFileSync(path.join(dir,'docs/private-test-marker.txt'),files['docs/private-test-marker.txt'],{flag:'wx'});
  const expectedTree=syntheticTree(files),sourceSha='a'.repeat(40),commit={sha:sourceSha,tree:{sha:expectedTree.sha}};
  return {source:dir,expectedTree,sourceSha,commit,out:path.join(fixtures,`out-${path.basename(dir)}`),files};
}
const buildOptions=f=>({source:f.source,expectedTree:f.expectedTree,commit:f.commit,sourceSha:f.sourceSha,out:f.out});
function build(f,extra={}) {assert.equal(typeof pagesBuilder.buildPages,'function','buildPages must be implemented');return pagesBuilder.buildPages({...buildOptions(f),...extra});}
function noBuild(r,code){assert.equal(r.ok,false);assert.equal(r.publicationReady,false);assert.equal(r.artifact,null);if(code)assert.ok(r.diagnostics.some(d=>d.code===code),JSON.stringify(r));}
function replaceFixture(f,p,b) {const value=Buffer.from(b);fs.writeFileSync(path.join(f.source,p),value);f.files[p]=value;f.expectedTree=syntheticTree(f.files);f.commit.tree.sha=f.expectedTree.sha;}
let common;
function fixtureShared(){return common??=realFixture();}
function uniqueOut(f,suffix){return {...f,out:f.out+'-'+suffix};}

test('build: reviewed byte fixture produces exact envelope and transformed manifest',()=>{
 const f=fixtureShared(),before=snapshot(f.source),r=build(f);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.publicationReady,false);assert.deepEqual(snapshot(f.source),before);
 const manifest=JSON.parse(fs.readFileSync(path.join(f.out,'publication.json'),'utf8'));
 assert.equal(manifest.sourceSha,f.sourceSha);assert.equal(manifest.treeSha,f.expectedTree.sha);assert.equal(manifest.status,'preview');assert.equal(manifest.storage.database,'yusha100-publication-preview-v1');assert.equal(manifest.storage.formalPublicationStorage,'undecided');assert.equal(manifest.labRankingIntegration,false);
 assert.equal(manifest.resources.length,hasTimeline?264:240);assert.ok(!manifest.resources.some(x=>x.path==='publication.json'));
 for(const e of manifest.resources){const b=fs.readFileSync(path.join(f.out,e.path));assert.equal(b.length,e.bytes);assert.equal(digest(b),e.sha256);}
 assert.equal(digest(fs.readFileSync(path.join(f.out,'publication.json'))),r.artifact.manifestSha256);
 assert.equal(snapshot(f.out).filter(x=>x[1]!=='directory').length,hasTimeline?265:241);assert.ok(!JSON.stringify(manifest).includes(f.source));assert.ok(!JSON.stringify(manifest).includes('PRIVATE_TEST_MARKER'));
 const html=fs.readFileSync(path.join(f.out,'index.html'),'utf8');assert.ok(html.indexOf('publication-status')<html.indexOf('<main id="app">'));assert.ok(html.includes(f.sourceSha));assert.ok(html.includes('yusha100-publication-preview-v1'));
 assert.equal(digest(fs.readFileSync(path.join(f.source,'index.html'))),digest(f.files['index.html']));
 for(const base of ['https://fixture.invalid/','https://fixture.invalid/project/']){for(const rel of ['./src/style.css','./src/ui/app.js','./assets/characters/hero-traveler-idle.svg','./data/scripts/manifest.json'])assert.ok(new URL(rel,base).pathname.startsWith(new URL(base).pathname));}
});
for(const [name,mutate] of [
 ['source SHA mismatch',o=>o.sourceSha='b'.repeat(40)],
 ['commit tree mismatch',o=>o.commit={...o.commit,tree:{sha:'c'.repeat(40)}}],
 ['tree root mismatch',o=>o.expectedTree={...o.expectedTree,sha:'d'.repeat(40)}],
 ['tree child hash mismatch',o=>{o.expectedTree=structuredClone(o.expectedTree);o.expectedTree.tree.find(e=>e.type==='tree').sha='e'.repeat(40)}],
 ['truncated tree',o=>o.expectedTree={...o.expectedTree,truncated:true}],
 ['duplicate entry',o=>o.expectedTree={...o.expectedTree,tree:[...o.expectedTree.tree,o.expectedTree.tree[0]]}],
 ['missing parent tree',o=>o.expectedTree={...o.expectedTree,tree:o.expectedTree.tree.filter(e=>e.path!=='src/ui')}],
 ['submodule',o=>{o.expectedTree=structuredClone(o.expectedTree);o.expectedTree.tree[0]={...o.expectedTree.tree[0],type:'commit',mode:'160000'}}],
 ['unknown policy override',o=>o.policy={}],
 ['unknown storage override',o=>o.namespace='yusha100'],
])test(`build: rejects ${name}`,()=>{const f=uniqueOut(fixtureShared(),name.replaceAll(' ','-')),o=buildOptions(f);mutate(o);assert.equal(typeof pagesBuilder.buildPages,'function');const r=pagesBuilder.buildPages(o);noBuild(r);assert.equal(fs.existsSync(f.out),false)});
for(const [name,p,b] of [
 ['unwired app','src/ui/app.js',()=>fs.readFileSync(path.join(runtimeRoot,'src/ui/app.js'),'utf8').replace("{name:'yusha100-publication-preview-v1'}",'')],
 ['changed JS','src/ui/audio.js',()=>fs.readFileSync(path.join(runtimeRoot,'src/ui/audio.js'),'utf8')+'\n// changed'],
 ['external CSS','src/style.css',()=>fs.readFileSync(path.join(runtimeRoot,'src/style.css'),'utf8')+'\n@import "https://example.invalid/secret.css";'],
 ['external HTML','index.html',()=>fs.readFileSync(path.join(runtimeRoot,'index.html'),'utf8').replace('</head>','<script src="https://example.invalid/x.js"></script></head>')],
 ['external SVG','assets/characters/hero-traveler-idle.svg',()=>'<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/a"/></svg>'],
 ['script traversal','data/scripts/manifest.json',()=>JSON.stringify({format:'script-manifest-1',events:['../secret.json'],items:[],equipment:[]})],
])test(`build: fixed policy rejects ${name} despite internally matching synthetic tree`,()=>{const f=realFixture();replaceFixture(f,p,b());noBuild(build(f));assert.equal(fs.existsSync(f.out),false)});
test('build: missing declared locale fails without output',()=>{const f=realFixture();fs.renameSync(path.join(f.source,'src/locales/messages/ja.json'),path.join(f.source,'src/locales/messages/ja.json.kept'));noBuild(build(f));assert.equal(fs.existsSync(f.out),false)});
test('build: existing output is retained',()=>{const f=uniqueOut(fixtureShared(),'existing');fs.mkdirSync(f.out);fs.writeFileSync(path.join(f.out,'keep'),'retained');noBuild(build(f));assert.equal(fs.readFileSync(path.join(f.out,'keep'),'utf8'),'retained')});
test('build: source child and ancestor output rejected',()=>{const f=fixtureShared();noBuild(build(f,{out:path.join(f.source,'new-out')}));noBuild(build(f,{out:path.dirname(f.source)}));assert.equal(fs.existsSync(path.join(f.source,'new-out')),false)});
test('build: output symlink is not followed',()=>{const f=uniqueOut(fixtureShared(),'symlink');fs.symlinkSync(f.source,f.out);noBuild(build(f));assert.equal(fs.lstatSync(f.out).isSymbolicLink(),true)});
test('build: parent symlink is not followed',()=>{const f=uniqueOut(fixtureShared(),'parent-link');fs.symlinkSync(path.dirname(f.source),f.out);noBuild(build(f,{out:path.join(f.out,'new-output')}));assert.equal(fs.existsSync(path.join(path.dirname(f.source),'new-output')),false)});
test('build: CLI successful fixture and receipt',()=>{const f=uniqueOut(fixtureShared(),'cli'),tree=path.join(fixtures,'build-tree.json'),commit=path.join(fixtures,'build-commit.json');fs.writeFileSync(tree,JSON.stringify(f.expectedTree),{flag:'wx'});fs.writeFileSync(commit,JSON.stringify(f.commit),{flag:'wx'});const r=run(['--build','--source',f.source,'--tree',tree,'--commit',commit,'--source-sha',f.sourceSha,'--out',f.out]);assert.equal(r.status,0,JSON.stringify(r));assert.equal(r.result.ok,true);assert.equal(r.result.publicationReady,false)});
for(const args of [['--build'],['--build','--check'],['--build','--policy','x'],['--build','--source-sha','x']])test(`build: CLI refuses incomplete or override arguments ${JSON.stringify(args)}`,()=>assert.equal(run(args).status,2));

// Faults are injected only in this sequential test process; no production hooks.
function duringWrite(f,hook){
 const original=fs.writeFileSync;let calls=0;
 fs.writeFileSync=function(target,data,...rest){const value=original.call(fs,target,data,...rest);if(typeof target==='number')hook(++calls,data,original);return value;};
 try{return build(f)}finally{fs.writeFileSync=original;}
}
test('build: write failure preserves partial output without a success receipt',()=>{
 const f=uniqueOut(fixtureShared(),'write-fault'),before=snapshot(f.source),original=fs.writeFileSync;let n=0,r;
 fs.writeFileSync=function(target,...rest){if(typeof target==='number'&&++n===3)throw Object.assign(Error('synthetic ENOSPC'),{code:'ENOSPC'});return original.call(fs,target,...rest)};
 try{r=build(f)}finally{fs.writeFileSync=original}
 noBuild(r);assert.equal(r.partialOutput,true);assert.equal(fs.existsSync(f.out),true);assert.equal(fs.existsSync(path.join(f.out,'publication.json')),false);assert.deepEqual(snapshot(f.source),before);
});
test('build: output rename and replacement cannot return success for a pinned old directory',()=>{
 const f=uniqueOut(fixtureShared(),'rename');const r=duringWrite(f,n=>{if(n===1){fs.renameSync(f.out,f.out+'-kept');fs.mkdirSync(f.out);}});
 noBuild(r,'PATH_IDENTITY');assert.equal(r.partialOutput,true);assert.equal(fs.existsSync(path.join(f.out+'-kept','publication.json')),true);assert.equal(fs.readdirSync(f.out).length,0);
});
test('build: output parent replacement cannot return success',()=>{
 const f=uniqueOut(fixtureShared(),'parent'),parent=fs.mkdtempSync(path.join(fixtures,'out-parent-'));f.out=path.join(parent,'out');
 const r=duringWrite(f,n=>{if(n===1){fs.renameSync(parent,parent+'-kept');fs.mkdirSync(parent)}});
 noBuild(r);assert.equal(r.partialOutput,true);assert.equal(fs.existsSync(path.join(parent+'-kept','out','publication.json')),true);assert.equal(fs.readdirSync(parent).length,0);
});
test('build: output symlink replacement fails without following or deleting it',()=>{
 const f=uniqueOut(fixtureShared(),'replace-link'),before=snapshot(f.source);
 const r=duringWrite(f,n=>{if(n===1){fs.renameSync(f.out,f.out+'-kept');fs.symlinkSync(f.source,f.out)}});
 noBuild(r);assert.equal(fs.lstatSync(f.out).isSymbolicLink(),true);assert.deepEqual(snapshot(f.source),before);
});
test('build: source ancestor replacement fails after pinned old reads',()=>{
 const f=realFixture(),holder=fs.mkdtempSync(path.join(fixtures,'source-parent-'));fs.renameSync(f.source,path.join(holder,'source'));f.source=path.join(holder,'source');
 const r=duringWrite(f,n=>{if(n===1){fs.renameSync(holder,holder+'-kept');fs.mkdirSync(holder);fs.mkdirSync(path.join(holder,'source'));}});
 noBuild(r,'PATH_IDENTITY');assert.equal(r.partialOutput,true);assert.equal(fs.existsSync(path.join(holder+'-kept','source','src/ui/app.js')),true);
});
test('build: concurrent source byte change prevents success',()=>{
 const f=realFixture();const r=duringWrite(f,(n,data,write)=>{if(n===1)write(path.join(f.source,'docs/private-test-marker.txt'),'changed synthetic source')});
 noBuild(r,'SOURCE_BYTES');assert.equal(r.partialOutput,true);
});
test('build: artifact corruption after manifest write prevents success',()=>{
 const f=uniqueOut(fixtureShared(),'corrupt');let done=false;
 const r=duringWrite(f,(n,data,write)=>{if(!done&&String(data).includes('\"schema\": \"yusha100-pages-1\"')){done=true;write(path.join(f.out,'index.html'),'corrupted synthetic artifact')}});
 assert.equal(done,true);noBuild(r,'OUTPUT_BYTES');assert.equal(r.partialOutput,true);
});
test('build: dangling output symlink is retained and rejected',()=>{const f=uniqueOut(fixtureShared(),'dangling');fs.symlinkSync(f.out+'-absent',f.out);noBuild(build(f));assert.equal(fs.lstatSync(f.out).isSymbolicLink(),true)});
test('build: receipt identifies executing tool separately from source commit',()=>{
 const f=uniqueOut(fixtureShared(),'generator'),r=build(f);assert.equal(r.ok,true);const p=JSON.parse(fs.readFileSync(path.join(f.out,'publication.json'),'utf8'));
 assert.ok(p.generator,'manifest must name executing builder');assert.equal(p.generator.toolFileSha256,digest(fs.readFileSync(cli)));assert.equal(p.generator.policyVersion,'reviewed-preview-resource-envelope-1');assert.equal(p.generator.matchesSourceTool,false);assert.equal(p.generator.sourceToolSha256,null);assert.deepEqual(r.artifact.generator,p.generator);
});

// app timeline connection must ship the exact reviewed module, not only its import.
test('build: timeline dependency is shipped byte-exact and tampering stays fail-closed',()=>{
 const f=realFixture(),r=build(f);assert.equal(r.ok,true,JSON.stringify(r));
 const m=JSON.parse(fs.readFileSync(path.join(f.out,'publication.json'),'utf8'));
 const entry=m.resources.find(e=>e.path==='src/ui/presentation-timeline.js');assert.equal(!!entry,hasTimeline);
 if(entry){
 assert.equal(entry.sha256,digest(f.files['src/ui/presentation-timeline.js']));
 assert.deepEqual(fs.readFileSync(path.join(f.out,entry.path)),f.files[entry.path]);}
 const altered=realFixture();const target=hasTimeline?'src/ui/presentation-timeline.js':'src/ui/app.js';replaceFixture(altered,target,Buffer.concat([altered.files[target],Buffer.from('\n// unreviewed\n')]));const stopped=build(altered);assert.equal(stopped.ok,false);assert.ok(stopped.diagnostics.some(d=>d.code==='RESOURCE_POLICY'));
});

// Castle background closure: metadata remains synthetic test evidence only.
for(const resource of ['assets/img/bg/gate.svg','assets/img/bg/throne.svg','src/ui/castle-background.js','src/ui/castle-background-dom.js','src/ui/castle-background-cache.js']){
 test(`castle envelope rejects changed ${resource}`,()=>{const f=realFixture();replaceFixture(f,resource,Buffer.concat([f.files[resource],Buffer.from('\n')]));noBuild(build(f),'RESOURCE_POLICY');assert.equal(fs.existsSync(f.out),false)});
 test(`castle envelope rejects missing ${resource}`,()=>{const f=realFixture();fs.renameSync(path.join(f.source,resource),path.join(f.source,resource+'.kept'));noBuild(build(f));assert.equal(fs.existsSync(f.out),false)});
}
test('castle envelope exact selected paths and SVG MIME at both bases',()=>{const f=uniqueOut(fixtureShared(),'castle-envelope');const r=build(f);assert.equal(r.ok,true,JSON.stringify(r));const m=JSON.parse(fs.readFileSync(path.join(f.out,'publication.json'),'utf8'));assert.deepEqual(m.resources.map(x=>x.path).sort(),[...buildFiles].sort());for(const name of ['gate','throne']){const rel=`assets/img/bg/${name}.svg`,entry=m.resources.find(x=>x.path===rel);assert.ok(entry);for(const base of ['http://127.0.0.1:8080/','http://127.0.0.1:8080/100masu_yusha/']){const v=servedVerifier(base,m.resources,fs.readFileSync(path.join(f.out,'publication.json'))),url=new URL(rel,base).href,bytes=fs.readFileSync(path.join(f.out,rel));v.check(url,200,{'content-type':'image/svg+xml'},bytes);assert.throws(()=>v.check(url,200,{'content-type':'text/html'},bytes),/MIME/);}}});
