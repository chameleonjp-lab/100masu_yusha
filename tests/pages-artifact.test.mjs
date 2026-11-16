import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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
