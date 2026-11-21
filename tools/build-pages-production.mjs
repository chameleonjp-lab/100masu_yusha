#!/usr/bin/env node
/** Assemble and re-read the approved production envelope. Never deploys. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildPages } from './build-pages.mjs';

const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BUILDER = '5d670a3abefc7078e5753b6cb9fb5600fd4e6ee1e27d946d78933eb1b7d33aff';
// Binds the ordered 264 source resource tuples [path, SHA-256, Git file mode].
const SOURCE_ENVELOPE = '3f88d137e9273be5eb1256ee982e299808058d0950229993af45e13acce82b1e';
const INDEX = 'index.html';
const APP = 'src/ui/app.js';
const FILE = 'publication.json';
const JEKYLL = '.nojekyll';
const MARK = '<meta name="robots" content="noindex,nofollow">';
const OLD_WIRING = "createIndexedDbStore({name:'yusha100-publication-preview-v1'})";
const NEW_WIRING = "createIndexedDbStore({name:'yusha100-production-v1'})";
const PREVIEW_DB = 'yusha100-publication-preview-v1';
export const PRODUCTION_DB = 'yusha100-production-v1';
const STORAGE = { mode: 'isolated-production-namespace', database: PRODUCTION_DB, migration: 'none' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const isHash = (value, pattern) => typeof value === 'string' && pattern.test(value);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const text = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
const safe = p => typeof p === 'string' && p !== '' && !path.posix.isAbsolute(p)
  && !/[\\:%?#\x00-\x1f\x7f]/.test(p) && p.split('/').every(c => c !== '' && c !== '.' && c !== '..');
const manifestJSON = bytes => JSON.parse(text(bytes));
const pathWithin = (a, b) => {
  const relative = path.relative(a, b);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
};
const dirFlags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
const readFlags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
const childPath = (fd, leaf = '') => `/proc/self/fd/${fd}${leaf ? '/' + leaf : ''}`;
const sameInode = (a, b) => a.ino === b.ino && a.dev === b.dev;

function openDir(directory) {
  if (process.platform !== 'linux' || fs.constants.O_NOFOLLOW === undefined) fail('UNSUPPORTED_PLATFORM');
  let fd = fs.openSync('/', dirFlags);
  try {
    for (const part of path.resolve(directory).split('/').filter(Boolean)) {
      const next = fs.openSync(childPath(fd, part), dirFlags);
      fs.closeSync(fd);
      fd = next;
    }
    return fd;
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function assertPathIdentity(directory, fd) {
  const atPath = openDir(directory);
  try {
    if (!sameInode(fs.fstatSync(atPath), fs.fstatSync(fd))) fail('DIRECTORY_IDENTITY');
  } finally { fs.closeSync(atPath); }
}

function readRegular(fd, name, limit) {
  const entry = fs.openSync(childPath(fd, name), readFlags);
  try {
    const s = fs.fstatSync(entry);
    if (!s.isFile() || s.nlink !== 1 || s.size > limit) fail('ARTIFACT_FILE_TYPE_OR_LENGTH');
    // Bound reads even if another process changes file length after fstat.
    const bytes = Buffer.alloc(s.size + 1);
    let at = 0;
    while (at < bytes.length) {
      const n = fs.readSync(entry, bytes, at, bytes.length - at, null);
      if (n === 0) break;
      at += n;
    }
    if (at !== s.size) fail('ARTIFACT_READ_LENGTH');
    return bytes.subarray(0, at);
  } finally { fs.closeSync(entry); }
}

function readTree(root, expected, sizes) {
  const files = new Map();
  const dirs = new Set();
  for (const relative of expected) {
    let dirname = path.posix.dirname(relative);
    while (dirname !== '.') {
      dirs.add(dirname);
      dirname = path.posix.dirname(dirname);
    }
  }
  function visit(fd, base = '') {
    for (const name of fs.readdirSync(childPath(fd))) {
      const relative = base + name;
      if (dirs.has(relative)) {
        const sub = fs.openSync(childPath(fd, name), dirFlags);
        try { visit(sub, relative + '/'); } finally { fs.closeSync(sub); }
      } else if (expected.has(relative)) {
        files.set(relative, readRegular(fd, name, sizes.get(relative)));
      } else {
        fail('ARTIFACT_UNEXPECTED_PATH');
      }
    }
  }
  visit(root);
  if (files.size !== expected.size) fail('ARTIFACT_MISSING_PATH');
  return files;
}

function oneReplacement(value, from, to) {
  if (!value.includes(from) || value.indexOf(from) !== value.lastIndexOf(from)) fail('TRANSFORM_SHAPE');
  return value.replace(from, to);
}

function sourceBytes(relative, bytes) {
  if (relative === INDEX) {
    const index = text(bytes);
    if (index.includes('id="publication-status"')) fail('PRODUCTION_BANNER');
    return Buffer.from(oneReplacement(index, `<head>${MARK}`, '<head>'));
  }
  if (relative === APP) {
    const app = text(bytes);
    if (app.includes(PREVIEW_DB)) fail('PRODUCTION_STORAGE');
    return Buffer.from(oneReplacement(app, NEW_WIRING, OLD_WIRING));
  }
  return bytes;
}

function validateManifest(manifest, isProduction) {
  if (!manifest || manifest.schema !== (isProduction ? 'yusha100-pages-production-1' : 'yusha100-pages-1')
    || manifest.status !== (isProduction ? 'production-candidate' : 'preview')
    || manifest.publicationReady !== false || manifest.labRankingIntegration !== false
    || !isHash(manifest.sourceSha, SHA1) || !isHash(manifest.treeSha, SHA1)
    || manifest.identityVerification !== 'supplied-api-evidence-and-recomputed-tree'
    || !isHash(manifest.evidence?.commitObjectSha256, SHA256)
    || !isHash(manifest.evidence?.treeObjectSha256, SHA256)
    || manifest.generator?.toolFileSha256 !== BUILDER
    || manifest.generator?.sourceToolSha256 !== BUILDER
    || manifest.generator?.matchesSourceTool !== true
    || manifest.generator?.policyVersion !== 'reviewed-preview-resource-envelope-1'
    || !Array.isArray(manifest.resources) || manifest.resources.length !== (isProduction ? 265 : 264)) {
    fail('BAD_MANIFEST');
  }
  if (isProduction && (JSON.stringify(manifest.storage) !== JSON.stringify(STORAGE)
    || !isHash(manifest.sourcePreviewManifestSha256, SHA256)
    || manifest.generator?.productionAssemblerSha256 !== hash(fs.readFileSync(fileURLToPath(import.meta.url))))) {
    fail('BAD_PRODUCTION_METADATA');
  }
  if (!isProduction && (manifest.storage?.mode !== 'isolated-preview-namespace'
    || manifest.storage?.database !== PREVIEW_DB || manifest.storage?.formalPublicationStorage !== 'undecided')) {
    fail('BAD_INTERMEDIATE_METADATA');
  }
  const map = new Map();
  let total = 0;
  for (const entry of manifest.resources) {
    if (!entry || Object.keys(entry).length !== 5 || !safe(entry.path) || entry.path === FILE
      || map.has(entry.path) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0
      || !isHash(entry.sha256, SHA256)) fail('BAD_RESOURCE');
    total += entry.bytes;
    if (total > 128 * 1024 * 1024) fail('ARTIFACT_LIMIT');
    if (entry.path === JEKYLL) {
      if (!isProduction || entry.bytes !== 0 || entry.sha256 !== hash(Buffer.alloc(0))
        || entry.sourceSha256 !== null || entry.sourceMode !== null) fail('BAD_NOJEKYLL');
    } else if (!isHash(entry.sourceSha256, SHA256) || !['100644', '100755'].includes(entry.sourceMode)) {
      fail('BAD_RESOURCE_SOURCE');
    }
    map.set(entry.path, entry);
  }
  if (isProduction && !map.has(JEKYLL)) fail('BAD_NOJEKYLL');
  const envelope = [...map.values()].filter(entry => entry.path !== JEKYLL)
    .map(entry => [entry.path, entry.sourceSha256, entry.sourceMode]);
  if (hash(JSON.stringify(envelope)) !== SOURCE_ENVELOPE) fail('SOURCE_ENVELOPE');
  return map;
}

function inspect(directory, isProduction, expected = {}) {
  const fd = openDir(directory);
  try {
    const raw = readRegular(fd, FILE, 256 * 1024);
    const manifestSha256 = hash(raw);
    if (expected.manifestSha256 !== undefined && manifestSha256 !== expected.manifestSha256) fail('MANIFEST_DIGEST');
    const manifest = manifestJSON(raw);
    const resources = validateManifest(manifest, isProduction);
    if (expected.sourceSha !== undefined && manifest.sourceSha !== expected.sourceSha) fail('SOURCE_COMMIT');
    const sizes = new Map([[FILE, raw.length], ...[...resources].map(([key, entry]) => [key, entry.bytes])]);
    const files = readTree(fd, new Set(sizes.keys()), sizes);
    if (!files.get(FILE).equals(raw)) fail('MANIFEST_CHANGED');
    for (const [relative, entry] of resources) {
      const b = files.get(relative);
      if (entry.bytes !== b.length || entry.sha256 !== hash(b)) fail('RESOURCE_BYTES');
      if (isProduction && relative !== JEKYLL && entry.sourceSha256 !== hash(sourceBytes(relative, b))) {
        fail('RESOURCE_TRANSFORM');
      }
    }
    assertPathIdentity(directory, fd);
    return { manifest, raw, manifestSha256, resources, files };
  } finally { fs.closeSync(fd); }
}

/** Full local readback with no symlinks or extra files. This does not prove any deployment. */
export function loadProductionArtifact(directory, expected = {}) {
  const resolved = path.resolve(directory);
  const { manifest, raw, manifestSha256, resources, files } = inspect(resolved, true, expected);
  const sourceSha = manifest.sourceSha;
  return {
    manifest, raw, manifestSha256, resources, files,
    recheck: () => { inspect(resolved, true, { sourceSha, manifestSha256 }); },
  };
}

function writeOutput(destination, selected, raw) {
  const parent = openDir(path.dirname(destination));
  const opened = [parent];
  const directories = new Map();
  try {
    // mkdir is exclusive. Even partial output is never overwritten or treated as verified.
    const leaf = path.basename(destination);
    fs.mkdirSync(childPath(parent, leaf), { mode: 0o700 });
    const root = fs.openSync(childPath(parent, leaf), dirFlags);
    opened.push(root);
    directories.set('', root);
    function write(relative, bytes) {
      let fd = root;
      let prefix = '';
      const parts = relative.split('/');
      for (const name of parts.slice(0, -1)) {
        prefix += name + '/';
        if (!directories.has(prefix)) {
          fs.mkdirSync(childPath(fd, name), { mode: 0o700 });
          const child = fs.openSync(childPath(fd, name), dirFlags);
          opened.push(child);
          directories.set(prefix, child);
        }
        fd = directories.get(prefix);
      }
      const file = fs.openSync(childPath(fd, parts.at(-1)),
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      try { fs.writeFileSync(file, bytes); } finally { fs.closeSync(file); }
    }
    for (const [relative, bytes] of selected) write(relative, bytes);
    write(FILE, raw);
    assertPathIdentity(destination, root);
  } finally { for (const fd of opened.reverse()) fs.closeSync(fd); }
}

function assemble({ source, expectedTree, commit, sourceSha, out }) {
  if (!isHash(sourceSha, SHA1)) fail('SOURCE_COMMIT');
  const resolvedSource = path.resolve(source);
  const destination = path.resolve(out);
  if (pathWithin(resolvedSource, destination) || pathWithin(destination, resolvedSource)) fail('OUTPUT_SOURCE_OVERLAP');
  if (fs.existsSync(destination)) fail('EXISTING_OUTPUT');
  if (hash(fs.readFileSync(new URL('./build-pages.mjs', import.meta.url))) !== BUILDER) fail('UNREVIEWED_PREVIEW_BUILDER');
  // Only the final destination is offered for deployment. This sibling never enters it.
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'yusha-pages-assembly-'));
  const intermediate = path.join(stage, 'intermediate');
  const build = buildPages({ source: resolvedSource, expectedTree, commit, sourceSha, out: intermediate });
  if (!build.ok) fail(`INTERMEDIATE_${build.diagnostics[0]?.code || 'FAILED'}`);
  const { manifest, manifestSha256, files } = inspect(intermediate, false, {
    sourceSha, manifestSha256: build.artifact.manifestSha256,
  });
  files.delete(FILE);
  const index = text(files.get(INDEX));
  const banner = `<aside id="publication-status" role="status">確認用ページ / ${sourceSha} / 保存領域: ${PREVIEW_DB} / 正式公開の保存先は未決 / 実機・音・保存・性能は確認中 / 実験場ランキング連携なし</aside>`;
  files.set(INDEX, Buffer.from(oneReplacement(oneReplacement(index, banner, ''), '<head>', `<head>${MARK}`)));
  files.set(APP, Buffer.from(oneReplacement(text(files.get(APP)), OLD_WIRING, NEW_WIRING)));
  files.set(JEKYLL, Buffer.alloc(0));
  manifest.schema = 'yusha100-pages-production-1';
  manifest.status = 'production-candidate';
  manifest.storage = STORAGE;
  manifest.sourcePreviewManifestSha256 = manifestSha256;
  manifest.generator.productionAssemblerSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
  manifest.resources = manifest.resources.map(entry => {
    const bytes = files.get(entry.path);
    if (entry.sourceSha256 !== hash(sourceBytes(entry.path, bytes))) fail('RESOURCE_TRANSFORM');
    return { ...entry, bytes: bytes.length, sha256: hash(bytes) };
  });
  manifest.resources.push({ path: JEKYLL, bytes: 0, sha256: hash(files.get(JEKYLL)), sourceSha256: null, sourceMode: null });
  const raw = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  writeOutput(destination, files, raw);
  const verified = loadProductionArtifact(destination, { sourceSha, manifestSha256: hash(raw) });
  return {
    ok: true, publicationReady: false,
    sourceIdentity: build.sourceIdentity,
    artifact: { path: destination, files: verified.resources.size + 1, manifestSha256: verified.manifestSha256 },
  };
}

function main(args) {
  const verify = args[0] === '--verify';
  const allowed = verify ? ['--out', '--source-sha', '--manifest-sha256']
    : ['--source', '--expected-tree', '--commit', '--source-sha', '--out'];
  const options = new Map();
  const start = verify ? 1 : 0;
  for (let at = start; at < args.length; at += 2) {
    const [key, value] = args.slice(at, at + 2);
    if (!allowed.includes(key) || options.has(key) || !value || value.startsWith('--')) fail('USAGE');
    options.set(key, value);
  }
  if (options.size !== allowed.length) fail('USAGE');
  const out = options.get('--out');
  const sourceSha = options.get('--source-sha');
  if (!isHash(sourceSha, SHA1)) fail('SOURCE_COMMIT');
  if (verify) {
    const expected = options.get('--manifest-sha256');
    if (!isHash(expected, SHA256)) fail('MANIFEST_DIGEST');
    const { manifestSha256, resources } = loadProductionArtifact(out, { sourceSha, manifestSha256: expected });
    return { ok: true, publicationReady: false, artifact: { path: path.resolve(out), files: resources.size + 1, manifestSha256 } };
  }
  return assemble({
    source: options.get('--source'), expectedTree: manifestJSON(fs.readFileSync(options.get('--expected-tree'))),
    commit: manifestJSON(fs.readFileSync(options.get('--commit'))), sourceSha, out,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + '\n'); }
  catch (error) {
    const code = error?.code;
    process.stdout.write(JSON.stringify({ ok: false, publicationReady: false,
      diagnostics: [{ code: typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : 'PRODUCTION_BUILD_FAILED' }] }) + '\n');
    process.exitCode = 1;
  }
}
