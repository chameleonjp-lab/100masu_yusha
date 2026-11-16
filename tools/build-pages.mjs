#!/usr/bin/env node
/** Q2 preparation only. No copying, build, module execution or publication. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BOOT = ['index.html', 'src/style.css', 'src/ui/app.js', 'src/ui/ranking.js', 'src/ranking/local.js'];
const LOCALES = ['ja', 'en', 'es', 'pt-BR', 'zh-Hans', 'fr', 'de', 'ko', 'ru', 'it', 'zh-Hant', 'id', 'tr', 'vi', 'th'];
const SECTIONS = ['events', 'items', 'equipment'];
const MANIFEST = 'data/scripts/manifest.json';
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const safePath = p => typeof p === 'string' && p.length > 0 && !path.posix.isAbsolute(p)
  && !/[\\:%?#\x00-\x1f\x7f]/.test(p) && p.split('/').every(c => c !== '' && c !== '.' && c !== '..');
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const resultBase = () => ({
  ok: false, mode: 'check-only', fullBuildSupported: false,
  bootReadiness: { ok: false },
  sourceExactness: { requested: false, ok: null, checkedFiles: 0, scope: 'expected file set, byte counts and Git blob SHA-1; not commit identity or modes' },
  scriptManifest: { ok: false, declaredFiles: 0 }, locales: { ok: false, checkedFiles: 0 },
  diagnostics: [],
  unsupported: ['full build / --out', 'ESM and dynamic resource closure', 'content semantics', 'browser/UI/native save', 'deployment readiness', 'source commit identity'],
});

/**
 * Read-only filesystem validator. No game modules are imported/evaluated.
 * expectedTree is a complete, non-truncated recursive Git tree object.
 * verifyExact checks the entire supplied source file set, not a publish allowlist.
 * Linux procfs is required to pin directory descriptors: every source component
 * is opened O_NOFOLLOW, including root ancestors. Symlink races cannot redirect
 * reads outside the pinned source root. Unsupported platforms fail closed.
 */
export function validateSource(options = {}) {
  const r = resultBase();
  const add = (code, p, message) => r.diagnostics.push({ code, ...(p ? { path: p } : {}), message });
  if (!object(options)) {
    add('OPTIONS_INVALID', null, 'Options must be an object');
    return r;
  }
  const { source, expectedTree, verifyExact = false } = options;
  r.sourceExactness.requested = verifyExact === true;
  if (typeof verifyExact !== 'boolean') {
    add('OPTIONS_INVALID', null, 'verifyExact must be boolean');
    return r;
  }
  if (typeof source !== 'string' || !source || source.includes('\0')) {
    add('SOURCE_INVALID', null, 'Source must name a readable directory');
    return r;
  }
  if (process.platform !== 'linux' || fs.constants.O_NOFOLLOW === undefined || fs.constants.O_DIRECTORY === undefined) {
    add('UNSUPPORTED_PLATFORM', null, 'Secure check requires Linux procfs and O_NOFOLLOW');
    return r;
  }
  const dirFlags = fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
  const fileFlags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
  const fdPath = fd => `/proc/self/fd/${fd}`;
  function openChild(fd, name, directory) {
    const p = `${fdPath(fd)}/${name}`;
    if (fs.lstatSync(p).isSymbolicLink()) throw Object.assign(new Error(), { code: 'SOURCE_SYMLINK' });
    const next = fs.openSync(p, directory ? dirFlags : fileFlags);
    const stat = fs.fstatSync(next);
    if (directory ? !stat.isDirectory() : !stat.isFile()) {
      fs.closeSync(next);
      throw Object.assign(new Error(), { code: 'SOURCE_NOT_REGULAR' });
    }
    return next;
  }
  function error(e, p, missing = 'SOURCE_INVALID') {
    if (e.code === 'SOURCE_SYMLINK' || e.code === 'ELOOP') add('SYMLINK', p, 'Source symlinks are unsupported and were not followed');
    else if (e.code === 'ENOENT') add(missing, p, 'Required source path is missing');
    else add('SOURCE_READ', p, 'Source path is unreadable or not a regular file/directory');
  }
  let root;
  try {
    // Open every ancestor without following a user-controlled symlink.
    root = fs.openSync('/', dirFlags);
    for (const part of path.resolve(source).split('/').filter(Boolean)) {
      const next = openChild(root, part, true);
      fs.closeSync(root); root = next;
    }
    fs.readdirSync(fdPath(root)); // Confirm procfs is usable before any source read.
  } catch (e) {
    if (root !== undefined) fs.closeSync(root);
    if (e.code === 'SOURCE_SYMLINK' || e.code === 'ELOOP') error(e);
    else add('SOURCE_INVALID', null, 'Source directory or secure procfs access is unavailable');
    return r;
  }
  function read(rel, missing) {
    if (!safePath(rel)) { add('UNSAFE_PATH', null, 'Source-relative path is unsafe'); return null; }
    const opened = [];
    try {
      const parts = rel.split('/'); let parent = root;
      for (let i = 0; i < parts.length; i++) {
        const fd = openChild(parent, parts[i], i < parts.length - 1);
        opened.push(fd); parent = fd;
      }
      return fs.readFileSync(parent);
    } catch (e) { error(e, rel, missing); return null; }
    finally { for (const fd of opened.reverse()) fs.closeSync(fd); }
  }
  try {
    const entries = expectedTree?.tree;
    const validMetadata = object(expectedTree) && expectedTree.truncated === false
      && Array.isArray(entries) && entries.length > 0;
    const expected = new Map(); const seen = new Set();
    let metadataOK = validMetadata;
    if (validMetadata) for (const e of entries) {
      if (!object(e) || !safePath(e.path) || seen.has(e.path) || !/^[0-9a-f]{40}$/.test(e.sha)
        || !(e.type === 'tree' && e.mode === '040000' || e.type === 'blob' && ['100644', '100755'].includes(e.mode)
          && Number.isSafeInteger(e.size) && e.size >= 0)) { metadataOK = false; break; }
      seen.add(e.path);
      if (e.type === 'blob') expected.set(e.path, e);
    }
    metadataOK = metadataOK && expected.size > 0;
    if (!metadataOK) add('TREE_METADATA', null, 'Check requires a complete nonempty recursive Git tree with safe regular-file metadata');

    const bootStart = r.diagnostics.length;
    for (const p of BOOT) read(p, 'BOOT_MISSING');
    r.bootReadiness.ok = r.diagnostics.length === bootStart;

    const manifestStart = r.diagnostics.length;
    const bytes = read(MANIFEST, 'MANIFEST_MISSING');
    let manifest;
    if (bytes !== null) {
      try { manifest = JSON.parse(bytes.toString('utf8')); }
      catch { add('MANIFEST_JSON', MANIFEST, 'Script manifest is not valid JSON'); }
      if (manifest !== undefined) {
        const schemaOK = object(manifest) && manifest.format === 'script-manifest-1'
          && Object.keys(manifest).every(k => ['format', 'note', ...SECTIONS].includes(k))
          && (!Object.hasOwn(manifest, 'note') || typeof manifest.note === 'string')
          && SECTIONS.every(k => Array.isArray(manifest[k]) && manifest[k].every(p => typeof p === 'string'));
        if (!schemaOK) add('MANIFEST_SCHEMA', MANIFEST, 'Expected script-manifest-1 with events/items/equipment string arrays and optional note');
        else {
          for (const section of SECTIONS) for (const declaration of manifest[section]) {
            // Never echo rejected declarations: they may contain private text.
            if (!safePath(declaration) || !declaration.endsWith('.json')) {
              add('MANIFEST_PATH', MANIFEST, 'Script declaration must be a safe relative JSON path');
              continue;
            }
            r.scriptManifest.declaredFiles++;
            read(`data/scripts/${declaration}`, 'SCRIPT_MISSING');
          }
        }
      }
    }
    r.scriptManifest.ok = r.diagnostics.length === manifestStart;

    const localeStart = r.diagnostics.length;
    for (const locale of LOCALES) {
      if (read(`src/locales/messages/${locale}.json`, 'LOCALE_MISSING') !== null) r.locales.checkedFiles++;
    }
    r.locales.ok = r.diagnostics.length === localeStart;

    if (verifyExact) {
      const exactStart = r.diagnostics.length;
      if (metadataOK) {
        for (const [p, e] of expected) {
          const content = read(p, 'EXACT_MISSING');
          if (content === null) continue;
          r.sourceExactness.checkedFiles++;
          if (content.length !== e.size) add('EXACT_SIZE', p, 'Source byte count differs from expected Git metadata');
          if (gitBlob(content) !== e.sha) add('EXACT_HASH', p, 'Source Git blob identity differs from expected metadata');
        }
        function walk(fd, prefix = '') {
          let names;
          try { names = fs.readdirSync(fdPath(fd)).sort(); }
          catch (e) { error(e, prefix); return; }
          for (const name of names) {
            const rel = prefix ? `${prefix}/${name}` : name;
            let child;
            try {
              if (!safePath(rel)) { add('UNSAFE_PATH', null, 'Source contains an unsafe path'); continue; }
              const stat = fs.lstatSync(`${fdPath(fd)}/${name}`);
              if (stat.isSymbolicLink()) { add('SYMLINK', rel, 'Source symlinks are unsupported and were not followed'); continue; }
              if (stat.isDirectory()) { child = openChild(fd, name, true); walk(child, rel); }
              else if (!stat.isFile()) add('SOURCE_READ', rel, 'Non-regular source entries are unsupported');
              else if (!expected.has(rel)) add('EXACT_UNEXPECTED', rel, 'Source file is absent from expected Git metadata');
            } catch (e) { error(e, rel); }
            finally { if (child !== undefined) fs.closeSync(child); }
          }
        }
        walk(root);
      }
      r.sourceExactness.ok = metadataOK && r.diagnostics.length === exactStart;
    }
    r.ok = r.diagnostics.length === 0;
    return r;
  } finally { fs.closeSync(root); }
}

function main(args) {
  const usage = () => {
    const r = resultBase();
    r.diagnostics.push({ code: 'CLI_USAGE', message: 'Check-only: --check --source DIR --tree JSON [--exact]. Full build and --out are unsupported.' });
    return { status: 2, result: r };
  };
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--check', '--source', '--tree', '--exact'].includes(key) || Object.hasOwn(opts, key)) return usage();
    if (key === '--check' || key === '--exact') opts[key] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith('--')) return usage();
      opts[key] = args[++i];
    }
  }
  if (!opts['--check'] || !opts['--source'] || !opts['--tree']) return usage();
  let tree;
  try {
    // Explicit metadata input is not a source declaration or a game module.
    tree = JSON.parse(fs.readFileSync(opts['--tree'], 'utf8'));
    if (tree?.structuredContent) tree = JSON.parse(tree.structuredContent.content);
  } catch {
    const r = resultBase();
    r.diagnostics.push({ code: 'TREE_METADATA', message: 'Expected tree metadata is unavailable or invalid JSON' });
    return { status: 2, result: r };
  }
  const result = validateSource({ source: opts['--source'], expectedTree: tree, verifyExact: !!opts['--exact'] });
  return { status: result.ok ? 0 : 1, result };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { status, result } = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = status;
}
