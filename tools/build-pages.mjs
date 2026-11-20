#!/usr/bin/env node
/** Q2 source checking and release-scoped local artifact generation. No product module execution or publication. */
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


// Release-scoped, reviewed static resource policy. No caller override or test mode.
const PAGE_POLICY = {
  "assets/img/bg/gate.svg": "bff37eb354505a242e164596065f11e13dbf758222f9adec490d74e7f441a95b",
  "assets/img/bg/throne.svg": "a9a09c8cd61ad5775ea05109a220425b817235dafab14b1def709d3c52dcf208",
  "src/ui/castle-background.js": "e59728fedcf5cc79e8083c7057bd28afb2262f88276156f07d7a8e193d5bf946",
  "src/ui/castle-background-dom.js": "70f23f920f92f92453f982937071d7ead748f060bbc7ec9841872c05ce301523",
  "src/ui/castle-background-cache.js": "1e6200753d41959308b9a75a123147e38dfd6486eb084f19f26db4dc64abd511",

  "assets/characters/comp-lantern-idle.svg": "6d7802dc8c9e859ed9399f1944cb501594bdf2892deea6f6799bc55126af15eb",
  "assets/characters/comp-lantern-support.svg": "958eb02e2b42ef4e652a89d27bbbd14ac95d6f534d944ea7bee603ee79698421",
  "assets/characters/comp-medic-idle.svg": "33f5ea5b2d978c179e2b2c62562f177f1f2f13159103a4f13403271f67c97083",
  "assets/characters/comp-medic-support.svg": "278da60a1753120bc2956d50271f8e82412e04b60ad14f6ce8e38271c291b1dc",
  "assets/characters/comp-shield-idle.svg": "c353491430e6d0a3aa53f0d60e206478578920241e5838fb13b9e0a8dcd917dd",
  "assets/characters/comp-shield-support.svg": "c2e1157b97674771b3c4ee10e84fb5f86e9f15bc28497c262dd6f1a53a3744e4",
  "assets/characters/comp-thrower-idle.svg": "30c7dc1449f4d5737868e8985558c3c3abf9b57b8e889d06c6699444b035d7b6",
  "assets/characters/comp-thrower-support.svg": "a8bf40c4060ffebf25f4559de20f9f191621e2e2723221debc530611becad7c6",
  "assets/characters/dk01-p1-attack.svg": "021efd5bbbbef85bacf7da53d66a4e8dabab38b4a27815bd15c0aa1f3e6c6bd7",
  "assets/characters/dk01-p1-big.svg": "a0385ee6cf810293b3f1e5539c184fc970ad16977d1d90f381d2ee5f373bfd96",
  "assets/characters/dk01-p1-guard.svg": "642d602751f7c47c6b58e43a53efab286c0e217ec031765d8230fd9697a57d19",
  "assets/characters/dk01-p1-idle.svg": "642d602751f7c47c6b58e43a53efab286c0e217ec031765d8230fd9697a57d19",
  "assets/characters/dk01-p1-open.svg": "f4142ee0f2e0b6258aa138c44adc3b7fcb8f0b44dce6c1b6ecddb5559a058d1d",
  "assets/characters/dk01-p2-attack.svg": "c69d02b9028e9248a861845801f94d1fe203b493d0f842212d65bb1ce1510b55",
  "assets/characters/dk01-p2-big.svg": "072f20c2e6fdcc8587e1981db56e974a5ecc0e5e942bdec440fc7a6f4e0650f0",
  "assets/characters/dk01-p2-guard.svg": "e65022c8d39f4c260f6b39f7aa04269155356a4d84f3195b426d53f495022a09",
  "assets/characters/dk01-p2-idle.svg": "e65022c8d39f4c260f6b39f7aa04269155356a4d84f3195b426d53f495022a09",
  "assets/characters/dk01-p2-open.svg": "b5cc948eaa16a3b14699fc15da05059c0c2a8e59724a14d6a23694f43a998bc0",
  "assets/characters/en01-attack.svg": "d1c51afce401c69839735b38af3f09688330f07eba92a3c4aa1ffc24dbc1e1fa",
  "assets/characters/en01-big.svg": "14d01837ed0a74874a90b8da1a0b3db9dc58e7fba4d4a2fdcda9912b93cc09c7",
  "assets/characters/en01-guard.svg": "49b448fafe9700ca75365f7daf5a4759027cc207df8b75032562d4f49d8a22a6",
  "assets/characters/en01-hit.svg": "bf9aa0d1b24530828513a8a2c495b7c2e64a7d0d58b7cdd8ca56c8ca6a47873e",
  "assets/characters/en01-idle.svg": "28490269cf7dfe35c265701fc09597303c61b1204d43e05f637b54047b3fdd86",
  "assets/characters/en01-open.svg": "56dfdffcff1c2b6d15130313f7cfbfa9940054e92ec30443fd9880f286d22650",
  "assets/characters/en02-attack.svg": "2ef10427543c1328e89be104ffe6e25f6708c1cdef81802ec973301637d938a8",
  "assets/characters/en02-big.svg": "ca67bf354574805bb1a554abadc172370e4a2e641916375ab500efe5251d183e",
  "assets/characters/en02-guard.svg": "eb510006bc12b2f2ef6ff3909fc528832d3dc72345c561be463d12df59362cbd",
  "assets/characters/en02-hit.svg": "bcbbd95e9cb764591e0b08141bf1527a81b069b4ec1ec06a3e4bbbddda255b63",
  "assets/characters/en02-idle.svg": "baf518d605f7a2f01799e8e47fef556f3542ec195f58f26f10117c5ecfcf2491",
  "assets/characters/en02-open.svg": "3b5ff1cd79ef4d4d81ef4e7ec5ff2a78d2b02fd56f46bdc0cea7dda539be58f5",
  "assets/characters/en03-attack.svg": "1c63ef10c679d9f3126413b356661960c0b3edecee29b946d705dd61d592772d",
  "assets/characters/en03-big.svg": "7691101869c7056c2279946e32acc92efb2e63663f8efbac0d3ba9eaacc18b9a",
  "assets/characters/en03-guard.svg": "78569aa8026ef49da77727de972e8dd107c983faa29227edc3bf2288d9eac29f",
  "assets/characters/en03-hit.svg": "044d214e97286d0f88b33e9a078dd8fa9049696f2670672d3d654c3f0923fc3b",
  "assets/characters/en03-idle.svg": "0bce06ec8599e0a9ab4e4cd861dbaaac8487bd60d5892408c2bdf20696f3fc25",
  "assets/characters/en03-open.svg": "e9d25c355c353b1f3ed00784d5e4d6b9662947707679262e29ee4dc58165d948",
  "assets/characters/en04-attack.svg": "437f74dcbbff3242eff097051f6e36ceb9c7c0c124c131cd00a49ad4455882af",
  "assets/characters/en04-big.svg": "1dcb2f8a2b4c8b26677f26f0ef932d8c1b9737ab547def7933fbb8464480f9a5",
  "assets/characters/en04-guard.svg": "da2f3663ac75581ac76a29f4a5a5e20e37c7a440e37886d2f9f51747711432f8",
  "assets/characters/en04-hit.svg": "a51537d478474267042996e2589df5d253d88388c372111a136b3ef0cc5ec238",
  "assets/characters/en04-idle.svg": "19f64f46f059755b2806ad39af8cd2de3370a2c70003c99b094d9aedb4141889",
  "assets/characters/en04-open.svg": "19bb679730cb7a65939b47a80949139c3fa945a34a6b99ffb88cc4610ff27b15",
  "assets/characters/en05-attack.svg": "5abd4250c4d08dfcf163417b01385a2b1670508cdce35c32a73a14b6229ac9ab",
  "assets/characters/en05-big.svg": "e0a0e7eaf8312baad712dab228d084cc8cd5cb4d089b87a6a33c12f0353fc3cf",
  "assets/characters/en05-guard.svg": "f29948dd41b2865d71c2f47153d89149394eb5d9980abfbd9153e8ebd35edea9",
  "assets/characters/en05-hit.svg": "078b7e49e404079ee99f4f593ab8496d293579a9e1108e8884c318bc13e09d5d",
  "assets/characters/en05-idle.svg": "d04ee775a6499a7f9b6aa13393530fc386030df005de5e5b2375ab9463cf757d",
  "assets/characters/en05-open.svg": "486cecf4eea7e71610d750c46d132612488212bb8526ab89dc135e8b6a027f86",
  "assets/characters/en06-attack.svg": "2ef5c751315fdcd54f4409419e8d61b081b5cf2e73b4f4b693303bbfbc81f703",
  "assets/characters/en06-big.svg": "e1046589155ff8bc871e7bb1e73efeed7af341abe398cea980a5e703bceaf690",
  "assets/characters/en06-guard.svg": "5967691d8dbcf2449511b4e7e07636bdfb7f29785673f147e0cb6d6d81fde0a3",
  "assets/characters/en06-hit.svg": "5b7be0286279510103c8d22287c03cd3a7a3389c82e706c82d60e053e755d227",
  "assets/characters/en06-idle.svg": "10230bed480b17d8df385a63eb433528e4fe6170a5bdde9bad7cf4544f030dbd",
  "assets/characters/en06-open.svg": "75dafc6a26116428bd67dd8b4f0c701afd845e1c7dbbc740cc6bcd6244801cc5",
  "assets/characters/en07-attack.svg": "4ad830e672f3fca312a2291d659e3e5085810a2d112d1ad999b84bf7823ea30b",
  "assets/characters/en07-big.svg": "6c8e2b57331fbbd9ca434cbc9366276a1092a18b0b2a68d8428b6ca79c237980",
  "assets/characters/en07-guard.svg": "2af2e2185633a2b0bd491ef6525871bf7df013fdd5974dfeaae38f79b4d038a4",
  "assets/characters/en07-hit.svg": "142369e74e61b86a55716cd2a28d9ac171e193a4c58c8f8c104153749e62e46d",
  "assets/characters/en07-idle.svg": "0225b19d9a9b67aa54f93c686755cf869a69650f280bed4a9250008378e4150a",
  "assets/characters/en07-open.svg": "41f61b2544fa973f74243879b6d9a7fb97ae4ade0f1695effc77979b7ba3269e",
  "assets/characters/en08-attack.svg": "b4aec2f55dca2ea13589211639f5b74165c3c9905e2f57cc8f8b54a614aa3324",
  "assets/characters/en08-big.svg": "1b525fb28466f8e3d86c818d474cf8371d8f60c81d10f4ed6a756a2ec9244c3a",
  "assets/characters/en08-guard.svg": "2ec9d529620d4412021decd1ac54a4cfbe2488a334077c04ab043020be01b32a",
  "assets/characters/en08-hit.svg": "c5ba709f02927f5dff868b81c6ea42928804ec7d5e661e6d8bc953effe73db72",
  "assets/characters/en08-idle.svg": "f8501e71af826bfab138408f76642189debb3ff3e6a42c3df124758ed5622f4a",
  "assets/characters/en08-open.svg": "d6db1985ead5e5d2b40757fee7dcd63dfa67269899e2e294c381b2ca7576d80b",
  "assets/characters/en09-attack.svg": "d08735e7accd177cc6404fa424221a9dbd1809ae00e8a673ddfff38ff09d0ca0",
  "assets/characters/en09-big.svg": "d49ff23e0316eda935cfe8bbe30a7f384408cf61377b2970d4c864a21af8914f",
  "assets/characters/en09-guard.svg": "c065f53ad098337cb78d768a7e5a5b4961619c9d30dcab40b36079ac749bd657",
  "assets/characters/en09-hit.svg": "fe1eb9fe037ec1f6f00e5cf068fc978f7cf39b3a810332e6ec0f812cf11dd6a7",
  "assets/characters/en09-idle.svg": "2add8ec51786e642f6c015909b060527bd6c781e39519c1e59396428515f0b1f",
  "assets/characters/en09-open.svg": "faa6e11549315cd361d8a6cd1f08de76cfcc1b5dc33df72f605f598154ae535c",
  "assets/characters/en10-attack.svg": "73420f5326238cddef58caae75d65e7f2a0a2f88ce4ddf4798bc6deca2b900b5",
  "assets/characters/en10-big.svg": "fe20aea6f78a713e781d4baa67f1db6eb881839894429e1cb84a133fea09ac5b",
  "assets/characters/en10-guard.svg": "5c43148ea29f557917f334a69b14af8c6d8ef47d720a3b439b69572578401fb3",
  "assets/characters/en10-hit.svg": "5660fbf72f66e510e93e08eaff254763870ecd3b3eeacc8bd6fab781bfabc4f7",
  "assets/characters/en10-idle.svg": "6073201e1a4a7f54e3f3578969e51cf05525e4ba489f29c7183eb68bdb15fe32",
  "assets/characters/en10-open.svg": "fc2a8e1cfb134362e81417ab4bd47c0c744c5bee4d37e33cd4fe2c929a710d0f",
  "assets/characters/en11-attack.svg": "c3d932784d99ec0478dacca257b7980665873d0e9330da7351e6aa6199e59712",
  "assets/characters/en11-big.svg": "02ef0808fe4e4d71127cd680a302ee9f2a1b73de0e961c0d797f916ac8f2d543",
  "assets/characters/en11-guard.svg": "44884ff6a4c286df50883954b42071c5d106090da46b165f594d68a3bc85492b",
  "assets/characters/en11-hit.svg": "b99b5ed10f8d020f94eea80fabe0eff92d5e0397e7595504b8ae50eb3212774d",
  "assets/characters/en11-idle.svg": "7b8bef3ba2027215ac7a6913ecceae827109c9833967db8c3c85d12e2e6e5b1d",
  "assets/characters/en11-open.svg": "0de33a9fbf9196982afbbb2b3e2d5cf381ec6b5d0383262a02ddf2c132cc1540",
  "assets/characters/en12-attack.svg": "81dc85b00fe1111a6de53e643a8a3a220c3bd15836f9d3a409c285c1b7f6c207",
  "assets/characters/en12-big.svg": "97f1ead9940f5a0d6f0c71535ab66f38c5e261e7d5ec5074d00b3a095e29bd91",
  "assets/characters/en12-guard.svg": "6b300364372b3022fc68ead57fe7cf5f0da89f1ac38dada4eff1a6fa7759ef1f",
  "assets/characters/en12-hit.svg": "705e5b34328b77e07a36988515bdb621e410d4407eef53cb58458eea5def34b9",
  "assets/characters/en12-idle.svg": "e3b4cc37d8fd20893ccf02b66db4259b66fd45837e0fb13afff27530ffe9d145",
  "assets/characters/en12-open.svg": "c4438cbea4d307a11a4127b901a91586f0780a5db382a25fd5cc17fe575d5795",
  "assets/characters/en13-attack.svg": "6321e956ed829ef2a54f96d87f0f00303645d1a0c0ff0804b661db0814ef9daa",
  "assets/characters/en13-big.svg": "2fc3bc66766ab0b23dc4bdaa242185c239f2e7368f7667668b4b369321c02b4a",
  "assets/characters/en13-guard.svg": "0359ab91cc69eeeb88561031981b04924cb3d2e56b0a382ddec12307461660e4",
  "assets/characters/en13-hit.svg": "bd8d5c634ca4c5a29fb7f640f96d60d88c2a1d356116970622439c79045c8c49",
  "assets/characters/en13-idle.svg": "e8c1555698c2030a1da30a6cbe46dad20a463cb321338a9d135c91f0e89d6981",
  "assets/characters/en13-open.svg": "54ebb9993dd6c902d517141dbde7cd194673445024c15a6ee090e138ba77d624",
  "assets/characters/hero-bard-attack.svg": "df8b4cbb43922439929e2bac45f95371e2f4bae47ae70e552f28f3974caf49fb",
  "assets/characters/hero-bard-cast-prepare.svg": "270001d590646414d8394b851d70d90c0669eace9834d525973818c0f39dd8f5",
  "assets/characters/hero-bard-cast.svg": "63d79ede49b2716e59f735c49fb6bad783a8ebe9fd8de157b4409e87e203de44",
  "assets/characters/hero-bard-down.svg": "85c82310e99cbe94a161b2db0a882b67c555a3ffa46516f151c625c3bca5d0c5",
  "assets/characters/hero-bard-guard.svg": "6568e7619d2f8c5291bebe2bf5c1f7c7f784ca7caac21ff27fe5ddfb8890834e",
  "assets/characters/hero-bard-hit.svg": "3351fdc2ad0657669984ba352b36f31036d596ef3a2fe9ca34f32e6040257c0d",
  "assets/characters/hero-bard-idle.svg": "451214fe7482a9ed4bd474033bbfa0458aaf77d0197501b7328280ca85353369",
  "assets/characters/hero-bard-victory.svg": "c0c3f33d77d84db7169e6f988b50b54da1d92f402a59834dda5a76f581d9ce87",
  "assets/characters/hero-bard-walk1.svg": "765de6f5541a5ae2475156711530955860b5c0cad53c3709743f8a19c0bf0bfe",
  "assets/characters/hero-bard-walk2.svg": "38028d87125a2c669c59dd67f51c786b4e23ce308e5ff7831eb502cb045478a8",
  "assets/characters/hero-mage-attack.svg": "94956a5a14c5c532721b5133cf68682c2f7708d103deda2e51d0d9c68af47958",
  "assets/characters/hero-mage-cast-prepare.svg": "9ebf8a8bae0110e776889099e38455e9e67ff317c4702d3023b78acbc3a1cbfd",
  "assets/characters/hero-mage-cast.svg": "3ab7e8babc2a279cdbff75d8a7c9a491359c14e10152e05c2c427abc3995ffd9",
  "assets/characters/hero-mage-down.svg": "f31d58b69596d007d77e554455c7d092acf0e1745716bb6e85521dfddd4b7cac",
  "assets/characters/hero-mage-guard.svg": "1a8e92f8be0ffe82b84943f553a11e86767957aa7fc0e12c26c8eab9a31e57ee",
  "assets/characters/hero-mage-hit.svg": "d2931cd5add13fb151ff8ca9ea7d8761b8ebf7a9c8a4e614428d4d73d019e716",
  "assets/characters/hero-mage-idle.svg": "8d385f4876ef92674524feb5e259773d910e3d9c8886cd861ea8e5f4a48c3e25",
  "assets/characters/hero-mage-victory.svg": "d6c0f67741b1c29ba462105aad34d4c83d2cc1cfdffcbbac89f4540cbae24875",
  "assets/characters/hero-mage-walk1.svg": "b2d7c1051963c5fce3d4cd526e93d0e061ebe20eaebd3183be6f5d418e2d9d8d",
  "assets/characters/hero-mage-walk2.svg": "d70bcc7dc8d4bee4314e098b99d66668fb3aefa91c95ee8b95ee5da22f358323",
  "assets/characters/hero-traveler-attack.svg": "4d6e7fa04a5c9e6c4bda16affd9ab4e8ff84e45c99a2ea9899fa0263eb20efdd",
  "assets/characters/hero-traveler-cast-prepare.svg": "877cd46b58bc26303005f96643fda87bcae28b098a394522ff9b26f733406451",
  "assets/characters/hero-traveler-cast.svg": "7b1f15544c0937083f422268bfe18b1585892a17f2767b4cff3a3f2876441f96",
  "assets/characters/hero-traveler-down.svg": "48107c73c24e4245581561fa23e2a7ced23787e50749cd766e8c92f9b62b8993",
  "assets/characters/hero-traveler-guard.svg": "d8b8074f116f7c8a9041d457f66800ce3f8a21a4a7896b4f10406ed8b26bbb33",
  "assets/characters/hero-traveler-hit.svg": "8d34ed145c76bbc9080e847954f75e91c172bd18dca3a3f3357edf1cbd6754d3",
  "assets/characters/hero-traveler-idle.svg": "f44dd0bfcd1f539a9b06f7bbac73aa738d6bba53d8edb8a4b7ddd6097ff44b22",
  "assets/characters/hero-traveler-victory.svg": "6cbebb15864819b40b00a74498cbe22215e9e6b80f7fadd8d45de1c47757ad89",
  "assets/characters/hero-traveler-walk1.svg": "790c69863d4c6026721ba7b3c8620cfc11ad2cdce47eed0c88fbe850adeb4299",
  "assets/characters/hero-traveler-walk2.svg": "3dbac973740e62cfd9565984adb22f5537b72657abcfabc938bc645115bc00e7",
  "assets/characters/hero-warrior-attack.svg": "51cd35259116671a2f46379cec3a010d86ea443ac82687ad6c90477f133b272d",
  "assets/characters/hero-warrior-cast-prepare.svg": "1d965b4cf99c2a6e9bc0229abdf4e1480f26f7becb597b726ab0078685d8cd82",
  "assets/characters/hero-warrior-cast.svg": "46a65aeed7cb62d692a2568d0c5511b07cc328916f3d799b7c96cb7ffbe21382",
  "assets/characters/hero-warrior-down.svg": "703aa6dcda29b2c904878d28cc946486d8cc36101260898a267f846f2b91cc6f",
  "assets/characters/hero-warrior-guard.svg": "f0a9825f3e24bd2728c8b6f49fc6e816ebf71db05cf47003cfe46824c1327037",
  "assets/characters/hero-warrior-hit.svg": "a018eb652e6cdf209899a4517d81a18cd383c2c73c3dbb0403e32ebbeec0e58d",
  "assets/characters/hero-warrior-idle.svg": "46832d921cdabbaad53110e1aca9693a5408901734eb8cf1ea335aa2d9c47122",
  "assets/characters/hero-warrior-victory.svg": "75ef81d02a9b8f71ad888697232020fa2e2222925cc6447301fb941eb92ee17a",
  "assets/characters/hero-warrior-walk1.svg": "e2601306c53aecbb507718c86da9aad2428303685ada91f0fedbb0801f4d6cd7",
  "assets/characters/hero-warrior-walk2.svg": "2693f46a172902fc35e9616f456272fc4b24d3c9bd75d92309223aa5a2711121",
  "assets/characters/mb01-attack.svg": "6f6c8e9215940c690972367ccff1c89bc5cbc4c15e160afdc6fbd12b4411ee8b",
  "assets/characters/mb01-big.svg": "56c065a774fbe8937519c6fd17359256771bd5bc19db266db4a0f773eb0b14b6",
  "assets/characters/mb01-guard.svg": "f6a59a6247f9f8311819d5834f2e653bf2cf55074e28304bf3c7cccd33e4303c",
  "assets/characters/mb01-hit.svg": "bf85b0752ad67a0b613c126188e018846a576a2fc3057ba7b8b862fa973260a9",
  "assets/characters/mb01-idle.svg": "e16bc35211a3b18c71ee73797e810a3dc3290a0630156b3a230ce07131709d21",
  "assets/characters/mb01-open.svg": "af01e1ac6f896082c01037d330e9ea75d3d2fd352121f1e22c7c64dda644e2f8",
  "assets/characters/mb02-attack.svg": "4682d0f4f748cf9754d87351d81ba48de0aca0b552a452cae241689f9d74163d",
  "assets/characters/mb02-big.svg": "67858238ef9780c1ece3fcf15c597ebd78910bd6de14abda395b95ab812da3b6",
  "assets/characters/mb02-guard.svg": "c805ef54f3e896b70b9e599aa5f055863b85afa6459b021d4119852abdec83dd",
  "assets/characters/mb02-hit.svg": "4081379bd6bab1d185dbdc9b6f969e13994c173dd0568f7f80dd55bf1a15104b",
  "assets/characters/mb02-idle.svg": "da2d8611d90fce511eff8a7c7d7fd897f776e828db4b8611e62ad91c92fc4547",
  "assets/characters/mb02-open.svg": "6d899f9f2e1a5ecf17e3aa80ab15772988841da35970bb916261ae592db1c8cf",
  "assets/characters/mb03-attack.svg": "411ebd29df86777de8fa38b53c8410b8f3dedacee1afcf7bf3f4133acad0725b",
  "assets/characters/mb03-big.svg": "8b89ffc7c1bff06e53b6c3f14d119ae1105d9738aec6ccbf74ba9b3ae7f035ed",
  "assets/characters/mb03-guard.svg": "5cd6f08a3b6aeac9baf4bdbd095847a52e1ff23820dfc2222ab6732cd4c06279",
  "assets/characters/mb03-hit.svg": "1820f9c36f805347a949d1c2586d4459fe4f9d69ba7063ba02d88ec208a1ce48",
  "assets/characters/mb03-idle.svg": "5665543977a65cd51089990b13a6cfe2a9dd6263952ec967381c5502e82b5d33",
  "assets/characters/mb03-open.svg": "a7307029c89704dc2e0317440e9309c694fa92013547eafe5821e51cfc12ac0c",
  "assets/characters/metrics.js": "7f3edd9f73b67267a53405313e2ebc0915f442e353c51cb337c35c533b0f02f2",
  "data/adventure-content.json": "817740b5b7980c90efea435e116ab686d6e65a558fab43eca36fae8fa36adcd9",
  "data/balance-draft-2.json": "7d72ac7bd89f203c52f3006e57a5ca57cf87d7396baa320b036d964f5020e642",
  "data/patches/encounters-balance-draft-2.json": "dc22b58f09d3e16b6491b8baa6f460abffe71800059b81f06ab29378bbf13b26",
  "data/scripts/_samples-equipment.json": "096169b94c3e07af1e2063439d94f5593a570718574c4abf1e7bb7404eff39b3",
  "data/scripts/_samples-items.json": "27eae48d9483a2c869806a5b6515af2889b2c1a9861f4630dd1fb101713db597",
  "data/scripts/equipment.json": "d9d49e8e40b58d1a8683cbbe7e553d37ab66d983d13acdf2e7ddd7bb585264ad",
  "data/scripts/events/B1.json": "a4cd2d565781dce1dce4ea033dbe3dd8ae9ff824668ec61d3743c29b146a627a",
  "data/scripts/events/B2.json": "0fa442166f057eec14acf98d3aeb782a40c2b387a7cbac6fdd092c644c605c75",
  "data/scripts/events/B3.json": "6d10e40903a38059bdc9de6a98b7ace96c9341d57dc58c5e77ede08c37bc9009",
  "data/scripts/events/B4.json": "680f7d5953588b1c80f4ea0a2eaa85a1ea5bb17d06ab573eff87ffecb4437876",
  "data/scripts/events/B5.json": "55719068496c4f5dd07fcc102bba91624569a6a02d31762b598b1a5db8210396",
  "data/scripts/events/F1.json": "40c9092784fab6e01b515e49be0b4713393db86957c1cd77125b6941a4d21c5b",
  "data/scripts/events/F2.json": "b9009ec2e5a82bf8146cc26e21db84fcd1551750f19bb175740717e4c372b577",
  "data/scripts/events/F3.json": "da928a3e5087766442a188d96e986eeb08fd3bcb564d34a4ede2333873f947fb",
  "data/scripts/events/F4.json": "d4efe21fb98ac2e2d064fd81b3eaa4e1e0dc55715e9238feee846a3ecb645953",
  "data/scripts/events/F5.json": "71a3f06ab51580432d28cfa22b85e0b4e4af96a572700860b77f95527168e2ad",
  "data/scripts/events/H1.json": "9a97cbb6eb1ecb45f4551262bd987bdf20a266fba6951346b5ab99d6e82730e2",
  "data/scripts/events/H2.json": "b6a8bcb460ccaf8e75c8f5b4cbfa7bf6e2d3d1299693a951a1c26c4a2abb8899",
  "data/scripts/events/H3.json": "d6c9d24097716f5d74d174a667973e12ff609cdd1c7f9ba21577c3cc10151775",
  "data/scripts/events/H4.json": "0319ec3be088747470638d7aba20b1acd0a053ff5877d0ff4705e1abe37cd33e",
  "data/scripts/events/H5.json": "af1067626cf7a5cf702bb9550ceaf14eaf6a2ad4d30c97d7d602c7e061b77f4d",
  "data/scripts/events/M1.json": "4072d82f162c0808d88561dc9cef370e10ae2410f1e2bc23d2b5b0ef73da6f7b",
  "data/scripts/events/M2.json": "029ede002d784c9dea48cd410bed8c20c39cf2382e923e93fb459b9864f282b7",
  "data/scripts/events/M3.json": "59f31a1d081c071529d0f9a11bce348b0e2edb8ccf28978fd6197f7fc33d89d0",
  "data/scripts/events/M4.json": "1211cd5fb5652436e31fbd7cc381eff020b5d7ee1c945c5b1225edfbd7f0a95c",
  "data/scripts/events/M5.json": "d568ae082fa641138a0f0445c9abc903b62ccf4a13d039d38f6191d54fe3118d",
  "data/scripts/events/_samples.json": "f9b574adf3ec69005ad98e90542807c84ae316c0169a39d9807a3c476723f657",
  "data/scripts/items.json": "ab3429ea6a1c345aa2e49459dc342a5afb329d8f0f0589b9da4a884b38b345f8",
  "data/scripts/manifest.json": "d323ec480fbd187720260b0e4f79d7519dcb886c2911820243613260482add68",
  "data/tuning.json": "3886be9fe0a80881ae6571988dc5cde67ca1fb76878581525664a288bf30d449",
  "index.html": "397f9458f7315461503418e49ce6077b2e5f6578bc1f7b47b71b9c3c8976d40f",
  "src/content/browser.js": "7407fc88bd0489d984c2916146608d3531c77ccadd0bcad2931cf8a7200d2789",
  "src/content/index.js": "ff49ee7f93aba58ac14d882ae784a5e15d2c75fac62c4fd11b3ec676afa8fa1b",
  "src/content/validate.js": "ee5a4ed488802eb958b2ddf949cc7d0b0fe232757e6611135b0b65355d32ace6",
  "src/engine/battle.js": "a72eb64367e15586d79ab6beac4dc529f9b736bce26b63ab14e9994ed06e8c84",
  "src/engine/board.js": "8e63ffd9f0ff7f037ecea79e03df675c859a825a7cee51d664d72b5a9383f6d1",
  "src/engine/core.js": "5e1d012e565668e40c02ce33f4f5d7eaa84d34a943c6004e372ebd9ac3776a2d",
  "src/engine/custom/index.js": "714fe4bf84a72d75d602be5afcfc0a622bebce33616c2a0953a6de2a6c506cbb",
  "src/engine/events.js": "3c937e2b9e7e7add040dda0f5191491c432d0c5e2e2ac30163de567e8c355a9f",
  "src/engine/expr.js": "6250eaeea2e6f61c75212ddaf0ee45414fcf6d5d48505a4b94e3b6f59bf34313",
  "src/engine/formats.js": "29a4065915c31bc2589ff7a72c6d2e5b748f7370a432b16f1a48c192cbcd4a55",
  "src/engine/index.js": "efb2349ba8986b1517a96df29c6fb7be9841b815bb59cecc41693a6932eab74c",
  "src/engine/info-items.js": "9646f7269ebecf0a755befd6bb08a031dd4c2b551ff90f2454298468ebd03989",
  "src/engine/inn.js": "7b0684bd458c904d0331ac78817dbcda9c22daea7f389ddee0dcb6efcaceded1",
  "src/engine/items.js": "6a1b1011ee3cd32f9693a41ef148ec807ca853d5fc3686e6fe49950e338500c7",
  "src/engine/landing-kind-items.js": "da3c21cbe423bbc9ada6673c687479c0dbc27463fa9410d5e31759f4b2a50c0d",
  "src/engine/ops-basic.js": "5ecd7f5d99e6eb126d550737ae8eb9ebab9ef85bdb638874042e8725906cb0fd",
  "src/engine/options.js": "6521ac5e89249e3a1c3dc1449cc9fcbee315ec540e6aa7fb7a42b7822eaba171",
  "src/engine/puzzles.js": "3cd2fbf231aa1261c79412c012720fa230b51741a744ee9e8553662bd967405d",
  "src/engine/results.js": "5f198f7a66ed2053bcb441b402c9a114aeda83b200fbcb91d5b08cf0756b58f7",
  "src/engine/rng.js": "3cf491a2f1fb273c971857582391ac528ba25c170ee33e7ee4b9594c1d94d478",
  "src/engine/runner.js": "6622d091df209d9a09f3a189bdfc9fdbf9c0c4c2895f0c56a2ef931ef1752305",
  "src/engine/state.js": "8600d25f39b1138b890596a417b388cc8fdeb6c4a6baba24400781e2a88105e6",
  "src/engine/status.js": "a381008515047194813e56885bf51852867cb7fdadec46838635c90e7a9a09a4",
  "src/engine/trap-items.js": "c69156fbbaa0f385a1e6250e1e5d03ec58eca30ac401825a1d7152e79bc95208",
  "src/engine/util.js": "ae6d5206642780d7499596a4a493c3df5bc2d9c44b00b45fb888708e205fb60b",
  "src/engine/view.js": "61ffb4fac50833930ed0a9007418770f87f2921d96c0e09923488ce0411810db",
  "src/locales/catalogs.js": "479a94a9508651a1015ac58b5731c56dbfba135ba246602ad3f44f6cd36994bb",
  "src/locales/key-manifest.json": "8a64870140d1b5fceadfe044ed043440dde4161128e2b45621e39c45b7fed6ba",
  "src/locales/messages/de.json": "7a09368b113127fcf86564dc67e52b500f928b62af24e6838d9d02c7eb3d8067",
  "src/locales/messages/en.json": "4392c89d205fb7beb17425c7d2964987e473dea795b57f017c40a3d31a8ae422",
  "src/locales/messages/es.json": "6463c4f78fbcaa7e8dc6fea03921b68516b52f7745abc498f44837c4f4520a48",
  "src/locales/messages/fr.json": "03a04b2f98b2a47610a1106e099a4e1ccca7bb2568011dcdcb050d47dd7ad146",
  "src/locales/messages/id.json": "a42dac1cfa7a1bf547a4c004ff0c74987c723df483b8f693ab84fe93de9a9954",
  "src/locales/messages/it.json": "189971a105e2292165fa624e6ab2e9cfc468797bd3ba0cd6331fdb8fd024e2f4",
  "src/locales/messages/ja.json": "c7cb200ec43797d6437765b19be408b38812aca3e440f7ea809d26a8a6d39c19",
  "src/locales/messages/ko.json": "cf339f35825a8e16e54a553e535d86e507409b82a306dfd695919d42cd4b29ab",
  "src/locales/messages/pt-BR.json": "7a2d2542b68ee044217ba4bb4cf4bd3021880afcd7e8ec86bd82fbc8562de890",
  "src/locales/messages/ru.json": "c36806e72ffd00e8e50057b6194dac3c7d70c44effe9b1ab3058ff9296ed5872",
  "src/locales/messages/th.json": "b8b7208f8b0116563107d0690db07aa887587b91beb694c88b79c4b417c7d523",
  "src/locales/messages/tr.json": "eba2caab38fd5c9363fff46d2030be263d685d69ce0d6d414ba7341cb56feff7",
  "src/locales/messages/vi.json": "c0d8e588ef51591808c31a944e18fe7cafaa979a7bebf9e11f85a331c27d8790",
  "src/locales/messages/zh-Hans.json": "96f11261107844556fcf94a12fbec3b1e11f6114047fba88b438cdfee5c556a6",
  "src/locales/messages/zh-Hant.json": "3dc8fb327820a3f7293d850b2226a18a8bcae73e067488f2869685613c9b5416",
  "src/locales/ui-templates.js": "03b97c785b7615db1f40a6d6e278e3bfa298039b701cd8727bc5e971f9a298cc",
  "src/ranking/local.js": "1d83175c2003d92c9e761be2926a53744a5808961d00320f89827a0e5f26044a",
  "src/save/core.js": "323b6d2f99b63ef327f1cffb7b15fba0fc1976bd6b0ad378b44d18de6692a1d4",
  "src/save/index.js": "73800e55f82d881aaf1d53a481907de351d00c22833dee2648f6a89d405bb2ef",
  "src/save/indexeddb.js": "8cc6add85bc2312c1e04e3029ea053fdf5d75bec10e9df38a62ad875cca734cb",
  "src/save/memory.js": "47539e1e0935a5676ca27a07230badcdf00d26a7663249727ef43cfc8248643d",
  "src/style.css": "61bd1dfbf6c3f09487920a5f83e5974b382d6d1134c7dd1e3b3c62269dfea41d",
  "src/ui/app.js": "c4a1fd8eaeeeaff79b26f0240649e3e1d0779a6e0cfd3c4488df391ad70840d7",
  "src/ui/audio-recipes.js": "ffe217d57e2c1a0cb17985e312230c07d1775206824e14675d302169b492a329",
  "src/ui/audio.js": "bf59a18dfbf3c42b0014723f7f87fc1a526699b4d62597252076a6eb7d8e49c2",
  "src/ui/castle-arrival-ui.js": "b04df4be2ccfbe91a7a0a3ab6b06d15140617fbc290a35a78aed50cbf2afc940",
  "src/ui/i18n.js": "cf38835a790eab7d145407d2b5450e8bba415d7f7da140318fd61027d60f508e",
  "src/ui/king-crown-renderer.js": "69f0edd89ce4fb4ca03af1184d141245f21e015039b12054c79c1a2957e93021",
  "src/ui/king-crown-segment.js": "be65f313c85e9fa5e8e34a44759403a1dfe9e6f3e7182c5768fad25a1351d116",
  "src/ui/king-reward-packet.js": "ad33a5556fe4034874abca76c873615fa39afc9baff8c4df84bcdc310e09500c",
  "src/ui/king-reward-sequence.js": "9c8345dc50a1ece3c394c9c8e7b71731b19e24c671f7c83a39fe794f7f38c5da",
  "src/ui/king-spell-timeline.js": "c4147ab41e2d367f8b064e0e8759f2ccc185e08593458bcf01b364a07c8dabba",
  "src/ui/king-turn-plan.js": "4e02efaa0141c2eb443cd3478c675576591b8de1a557764589ac6f35a516e930",
  "src/ui/king-victory-renderer.js": "1655ccfe09a228eea5ac0de3dac82cf25a99a1826a871bd4fa08393b32f52afb",
  "src/ui/king-victory-segment.js": "672204f67d4ed0af93e4ec5a624af0c810244ee0e982f996bcf779a1a5aea627",
  "src/ui/presentation-timeline.js": "6b5c2cf9385c313969d091c958bd88fc975b0c5d29d1c1ac2510f04869f085bf",
  "src/ui/presentation.js": "32d7b90d8c5d5c50a5a85260a9ae4e66f3ba534a32684a60d915fc1463d4752e",
  "src/ui/ranking.js": "f42a0225fb7aa59aa002215b216e871c8873b34ad2faa06d5116532b1591edf3",
  "src/ui/session.js": "d28175201e2200fe1f855f8997d93d21e18bbb750bf2eff4f7a8b989d07c955a",
  "src/ui/spell-effect-consumer.js": "19da6b373b5da818ddfd05f11f3423277a7dec1b1cda23aa00b1539d5c3594bb",
  "src/ui/stage.js": "38913a849e9b1f7cb20c560cf585172c7f1746ecc7a89448d5bab92a5b72dbac",
  "src/ui/normal-guard-plan.js": "333358f781a42b572ef055de259022179abcd9ee4dbd7e844e582a4b617ee1cb",
  "src/ui/normal-flee-plan.js": "19532a84692b0d96661dd912a4e8778545e2c851d87a730f90dbe01af7845b4d",
  "src/ui/result-route-light.js": "01989712b6cfa8f64b2ace517972096e6fe0698548bc7f8149b399396c11283e",
  "src/ui/saved-result-receipt.js": "4801f794092f2b7d281ef372d301eaa310cb0d313e4cd7272515fa1f6d3283a6"
};
const PREVIEW_DB = 'yusha100-publication-preview-v1';
const hash256 = b => createHash('sha256').update(b).digest('hex');
const TOOL_FILE_SHA256 = hash256(fs.readFileSync(fileURLToPath(import.meta.url)));
const POLICY_VERSION = 'reviewed-preview-resource-envelope-1';
const hashObject = (kind,b) => createHash('sha1').update(`${kind} ${b.length}\0`).update(b).digest('hex');
const failBuild = code => { throw Object.assign(new Error(code), { buildCode: code }); };
const unwrapMetadata = x => x?.structuredContent ? JSON.parse(x.structuredContent.content) : x;
const sameIdentity = (a,b) => a.dev===b.dev && a.ino===b.ino && a.isDirectory()===b.isDirectory() && a.isFile()===b.isFile();

function verifyGitTree(tree,commit,sourceSha) {
  if (!object(commit) || !/^[0-9a-f]{40}$/.test(sourceSha) || commit.sha!==sourceSha
    || !object(tree) || tree.truncated!==false || !/^[0-9a-f]{40}$/.test(tree.sha)
    || commit.tree?.sha!==tree.sha || !Array.isArray(tree.tree) || !tree.tree.length || tree.tree.length>10000) failBuild('SOURCE_IDENTITY');
  const entries=new Map(),dirs=new Map([['',[]]]);let total=0;
  for(const e of tree.tree) {
    if(!object(e)||!safePath(e.path)||entries.has(e.path)||!/^[0-9a-f]{40}$/.test(e.sha))failBuild('TREE_INVALID');
    if(e.type==='tree'&&e.mode==='040000')dirs.set(e.path,[]);
    else if(e.type==='blob'&&['100644','100755'].includes(e.mode)&&Number.isSafeInteger(e.size)&&e.size>=0)total+=e.size;
    else failBuild('TREE_INVALID');
    entries.set(e.path,e);
  }
  if(total>128*1024*1024)failBuild('SOURCE_LIMIT');
  for(const e of entries.values()) {
    const parent=path.posix.dirname(e.path)==='.'?'':path.posix.dirname(e.path);
    if(!dirs.has(parent))failBuild('TREE_PARENT');dirs.get(parent).push(e);
  }
  const visit=dir=>{
    const rows=dirs.get(dir).map(e=>{
      const name=path.posix.basename(e.path);
      if(e.type==='tree'&&visit(e.path)!==e.sha)failBuild('TREE_HASH');
      return {key:Buffer.from(name+(e.type==='tree'?'/':'')),value:Buffer.concat([Buffer.from(`${e.type==='tree'?'40000':e.mode} ${name}\0`),Buffer.from(e.sha,'hex')])};
    });
    rows.sort((a,b)=>Buffer.compare(a.key,b.key));return hashObject('tree',Buffer.concat(rows.map(r=>r.value)));
  };
  if(visit('')!==tree.sha)failBuild('TREE_HASH');
  return new Map([...entries].filter(([,e])=>e.type==='blob'));
}

function pinDirectory(abs) {
  const flags=fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW;
  let fd=fs.openSync('/',flags),prefix='';const chain=[{path:'/',stat:fs.fstatSync(fd)}];
  try {
    for(const part of abs.split('/').filter(Boolean)){
      const child=fs.openSync(`/proc/self/fd/${fd}/${part}`,flags);fs.closeSync(fd);fd=child;prefix+='/'+part;
      const stat=fs.fstatSync(fd);if(!stat.isDirectory())failBuild('PATH_IDENTITY');chain.push({path:prefix,stat});
    }
    return {fd,chain};
  }catch(e){fs.closeSync(fd);throw e;}
}
function verifyPinnedPath(pin) {
  const next=pinDirectory(pin.chain.at(-1).path);
  try {
    if(next.chain.length!==pin.chain.length||next.chain.some((x,i)=>!sameIdentity(x.stat,pin.chain[i].stat))||!sameIdentity(fs.fstatSync(pin.fd),next.chain.at(-1).stat))failBuild('PATH_IDENTITY');
  }finally{fs.closeSync(next.fd);}
}
function readPinned(root,rel) {
  if(!safePath(rel))failBuild('UNSAFE_PATH');
  const open=[];let fd=root;
  try{
    const parts=rel.split('/');
    for(let i=0;i<parts.length;i++){
      const flags=fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK|(i<parts.length-1?fs.constants.O_DIRECTORY:0);
      fd=fs.openSync(`/proc/self/fd/${fd}/${parts[i]}`,flags);open.push(fd);
      const s=fs.fstatSync(fd);if(i<parts.length-1?!s.isDirectory():!s.isFile())failBuild('SOURCE_NOT_REGULAR');
    }
    return fs.readFileSync(fd);
  }finally{for(const f of open.reverse())fs.closeSync(f);}
}
function enumeratePinned(root) {
  const found=[];
  function walk(fd,prefix){
    for(const name of fs.readdirSync(`/proc/self/fd/${fd}`).sort()){
      const rel=prefix?`${prefix}/${name}`:name;if(!safePath(rel))failBuild('UNSAFE_PATH');
      const s=fs.lstatSync(`/proc/self/fd/${fd}/${name}`);
      if(s.isSymbolicLink())failBuild('SYMLINK');
      if(s.isDirectory()){
        const child=fs.openSync(`/proc/self/fd/${fd}/${name}`,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
        try{found.push({path:rel,type:'tree'});walk(child,rel);}finally{fs.closeSync(child);}
      }else if(s.isFile())found.push({path:rel,type:'blob'});else failBuild('SOURCE_NOT_REGULAR');
    }
  }
  walk(root,'');return found;
}
function readExactSnapshot(pin,expected,tree) {
  const entries=enumeratePinned(pin.fd),want=new Map(tree.tree.map(e=>[e.path,e.type]));
  if(entries.length!==want.size||entries.some(e=>want.get(e.path)!==e.type))failBuild('SOURCE_SET');
  const snapshot=new Map();
  for(const [p,e] of expected){const bytes=readPinned(pin.fd,p);if(bytes.length!==e.size||gitBlob(bytes)!==e.sha)failBuild('SOURCE_BYTES');snapshot.set(p,bytes);}
  return snapshot;
}

/** Offline build for a reviewed release. Supplied API evidence is trusted input,
 * not an authenticated GitHub response. No game modules are imported/evaluated.
 * The returned success is local artifact generation, never publication readiness. */
export function buildPages(options={}) {
  const r={ok:false,mode:'build',fullBuildSupported:true,publicationReady:false,partialOutput:false,sourceIdentity:null,artifact:null,diagnostics:[]};
  let sourcePin,parentPin,outPin;
  try{
    if(!object(options)||Object.keys(options).some(k=>!['source','expectedTree','commit','sourceSha','out'].includes(k)))failBuild('BUILD_OPTIONS');
    const {source,sourceSha,out}=options;
    if(typeof source!=='string'||!source||source.includes('\0')||typeof out!=='string'||!out||out.includes('\0'))failBuild('BUILD_OPTIONS');
    if(process.platform!=='linux'||fs.constants.O_NOFOLLOW===undefined)failBuild('UNSUPPORTED_PLATFORM');
    const tree=unwrapMetadata(options.expectedTree),commit=unwrapMetadata(options.commit),expected=verifyGitTree(tree,commit,sourceSha);
    const src=path.resolve(source),dest=path.resolve(out);
    const related=(a,b)=>{const rel=path.relative(a,b);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
    if(related(src,dest)||related(dest,src))failBuild('OUTPUT_SOURCE_OVERLAP');
    sourcePin=pinDirectory(src);
    const bytes=readExactSnapshot(sourcePin,expected,tree);
    for(const [p,sha] of Object.entries(PAGE_POLICY))if(!bytes.has(p)||hash256(bytes.get(p))!==sha)failBuild('RESOURCE_POLICY');
    // This fixed policy binds the exact reviewed app wiring, asset declarations,
    // and JSON inputs. New data/runtime revisions require an explicit policy review.
    const selected=new Map(Object.keys(PAGE_POLICY).sort().map(p=>[p,bytes.get(p)]));
    const originalIndex=selected.get('index.html');
    const banner=`<aside id="publication-status" role="status">確認用ページ / ${sourceSha} / 保存領域: ${PREVIEW_DB} / 正式公開の保存先は未決 / 実機・音・保存・性能は確認中 / 実験場ランキング連携なし</aside>`;
    const html=originalIndex.toString('utf8');if((html.match(/<body>/g)||[]).length!==1||!html.includes('<main id="app">'))failBuild('HTML_SHAPE');
    selected.set('index.html',Buffer.from(html.replace('<body>','<body>'+banner)));
    verifyPinnedPath(sourcePin);
    parentPin=pinDirectory(path.dirname(dest));
    fs.mkdirSync(`/proc/self/fd/${parentPin.fd}/${path.basename(dest)}`,{mode:0o700});r.partialOutput=true;
    const fd=fs.openSync(`/proc/self/fd/${parentPin.fd}/${path.basename(dest)}`,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
    outPin={fd,chain:[...parentPin.chain,{path:dest,stat:fs.fstatSync(fd)}]};
    const directoryIdentities=new Map([['',fs.fstatSync(fd)]]);
    function writeNew(rel,content){
      if(!safePath(rel))failBuild('UNSAFE_PATH');let parent=outPin.fd,prefix='';const opened=[];
      try{
        const parts=rel.split('/');
        for(const name of parts.slice(0,-1)){
          prefix=prefix?`${prefix}/${name}`:name;
          if(!directoryIdentities.has(prefix)){
            fs.mkdirSync(`/proc/self/fd/${parent}/${name}`,{mode:0o700});
            const next=fs.openSync(`/proc/self/fd/${parent}/${name}`,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);opened.push(next);parent=next;directoryIdentities.set(prefix,fs.fstatSync(next));
          }else{
            const next=fs.openSync(`/proc/self/fd/${parent}/${name}`,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);opened.push(next);parent=next;if(!sameIdentity(fs.fstatSync(next),directoryIdentities.get(prefix)))failBuild('PATH_IDENTITY');
          }
        }
        const leaf=fs.openSync(`/proc/self/fd/${parent}/${parts.at(-1)}`,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
        try{if(!fs.fstatSync(leaf).isFile())failBuild('OUTPUT_NOT_REGULAR');fs.writeFileSync(leaf,content);}finally{fs.closeSync(leaf);}
      }finally{for(const f of opened.reverse())fs.closeSync(f);}
    }
    for(const [p,b] of selected)writeNew(p,b);
    const resources=[...selected].map(([p,b])=>({path:p,bytes:b.length,sha256:hash256(b),sourceSha256:hash256(bytes.get(p)),sourceMode:expected.get(p).mode}));
    const sourceToolSha256=bytes.has('tools/build-pages.mjs')?hash256(bytes.get('tools/build-pages.mjs')):null;
    const generator={toolFileSha256:TOOL_FILE_SHA256,policyVersion:POLICY_VERSION,sourceToolSha256,matchesSourceTool:sourceToolSha256===TOOL_FILE_SHA256};
    const publication={generator,schema:'yusha100-pages-1',status:'preview',sourceSha,treeSha:tree.sha,identityVerification:'supplied-api-evidence-and-recomputed-tree',evidence:{commitObjectSha256:hash256(Buffer.from(JSON.stringify(commit))),treeObjectSha256:hash256(Buffer.from(JSON.stringify(tree)))},storage:{mode:'isolated-preview-namespace',database:PREVIEW_DB,formalPublicationStorage:'undecided'},labRankingIntegration:false,publicationReady:false,unverified:['browser/native storage','iPhone/display/audio','HTTP/MIME/performance','deployment'],resources};
    const manifest=Buffer.from(JSON.stringify(publication,null,2)+'\n');writeNew('publication.json',manifest);selected.set('publication.json',manifest);
    const outEntries=enumeratePinned(outPin.fd),outFiles=outEntries.filter(e=>e.type==='blob');
    const expectedDirs=new Set();for(const p of selected.keys()){let d=path.posix.dirname(p);while(d!=='.'){expectedDirs.add(d);d=path.posix.dirname(d);}}
    if(outFiles.length!==selected.size||outFiles.some(e=>!selected.has(e.path))||outEntries.filter(e=>e.type==='tree').some(e=>!expectedDirs.has(e.path)))failBuild('OUTPUT_SET');
    for(const [p,b] of selected)if(!readPinned(outPin.fd,p).equals(b))failBuild('OUTPUT_BYTES');
    readExactSnapshot(sourcePin,expected,tree);
    verifyPinnedPath(sourcePin);verifyPinnedPath(outPin);
    r.sourceIdentity={sourceSha,treeSha:tree.sha,verification:publication.identityVerification};
    r.artifact={generator,path:dest,files:selected.size,manifestSha256:hash256(manifest),resources};r.partialOutput=false;r.ok=true;
  }catch(e){r.diagnostics.push({code:e.buildCode||'BUILD_IO',message:'Build stopped; any partial output is retained and is not a successful artifact.'});}
  finally{for(const p of [outPin,parentPin,sourcePin])if(p)fs.closeSync(p.fd);}
  return r;
}

function buildMain(args){
  const bad=()=>({status:2,result:{ok:false,mode:'build',publicationReady:false,artifact:null,diagnostics:[{code:'CLI_USAGE',message:'Build requires source, tree, commit, source-sha and a new out path.'}]}});
  const opts={};
  for(let i=0;i<args.length;i++){
    const key=args[i];if(!['--build','--source','--tree','--commit','--source-sha','--out'].includes(key)||Object.hasOwn(opts,key))return bad();
    if(key==='--build')opts[key]=true;else{if(!args[i+1]||args[i+1].startsWith('--'))return bad();opts[key]=args[++i];}
  }
  if(!opts['--build']||['--source','--tree','--commit','--source-sha','--out'].some(k=>!opts[k]))return bad();
  let tree,commit;try{tree=JSON.parse(fs.readFileSync(opts['--tree'],'utf8'));commit=JSON.parse(fs.readFileSync(opts['--commit'],'utf8'));}catch{return {status:2,result:{ok:false,mode:'build',publicationReady:false,artifact:null,diagnostics:[{code:'BUILD_METADATA',message:'Required metadata cannot be read.'}]}};}
  const result=buildPages({source:opts['--source'],expectedTree:tree,commit,sourceSha:opts['--source-sha'],out:opts['--out']});return {status:result.ok?0:1,result};
}

function main(args) {
  if (args.includes('--build')) return buildMain(args);
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
