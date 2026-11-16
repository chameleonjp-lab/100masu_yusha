// Composition-root extraction plus real session/store and fake IDB; not a browser/native test.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createIndexedDbStore} from '../../src/save/indexeddb.js';import {createSession} from '../../src/ui/session.js';
import {createFakeIndexedDB} from '../fixtures/fake-idb.mjs';import {getContent} from '../fixtures/helpers.mjs';
const content=await getContent(),source=readFileSync(new URL('../../src/ui/app.js',import.meta.url),'utf8');
const begin='try{content=await loadContentInBrowser(',end="\ndocument.addEventListener('visibilitychange'";
const a=source.indexOf(begin),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);assert.equal(source.indexOf(begin,a+begin.length),-1);
const init=source.slice(a,b),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,preview='yusha100-publication-preview-v1';
function harness(fault){
 const fake=createFakeIndexedDB(),old={stores:{run:new Map([['current',{legacy:'synthetic-old'}]]),meta:new Map([['meta',{old:'synthetic-old'}]]),backup:new Map([['prior',{raw:'synthetic-old'}]])}};
 fake.dbs.set('yusha100',old);const before=structuredClone(old),log=[];let used=false;
 const idb={open(name,version){log.push({op:'open',name,version});if(fault&&!used){used=true;const rq={};queueMicrotask(()=>{if(fault==='error'){rq.error=Error('synthetic-open-error');rq.onerror?.()}else rq.onblocked?.()});return rq}
  const rq=fake.open(name,version);let db;Object.defineProperty(rq,'result',{get:()=>db,set(value){db=value;const tx=db.transaction.bind(db),create=db.createObjectStore.bind(db);db.createObjectStore=s=>{log.push({op:'migrate',name,store:s});return create(s)};db.transaction=(names,mode)=>{log.push({op:'transaction',name,mode});const result=tx(names,mode),os=result.objectStore.bind(result);result.objectStore=s=>{const object=os(s);return Object.fromEntries(['get','put','delete'].map(op=>[op,(...args)=>{log.push({op,name,store:s});return object[op](...args)}]))};return result}}});return rq
 }};
 async function boot(){const observed={renders:0,errors:[],loads:[]};const run=new AsyncFunction('loadContentInBrowser','createSession','createIndexedDbStore','loadMessages','locale','render','root','heading','paragraph','msg',`let content,session;${init};return session;`);
 const session=await run(async base=>{assert.equal(base,'./');return content},createSession,options=>createIndexedDbStore({...options,indexedDB:idb}),async x=>{observed.loads.push(x)},()=> 'ja',()=>observed.renders++,{replaceChildren:(...x)=>observed.errors.push(x)},x=>x,x=>x,x=>x);return {session,observed}}
 function isolated(){assert.deepEqual(log.filter(x=>x.name==='yusha100'),[]);assert.ok(log.every(x=>x.name===preview));assert.deepEqual(fake.dbs.get('yusha100'),before)}
 return {fake,idb,log,before,boot,isolated};
}
test('actual app init uses selected namespace for load/start/act/settings/reopen and never touches old synthetic DB',async()=>{
 const h=harness(),{session:s,observed}=await h.boot();h.isolated();assert.equal(observed.renders,1);assert.deepEqual(observed.errors,[]);assert.deepEqual(observed.loads,['ja']);
 await s.start('M');await s.act({type:'roll'});await s.settings({language:'fr',masterVolume:0});const run=structuredClone(s.run),meta=structuredClone(s.meta);const reopened=await h.boot();assert.deepEqual(reopened.session.run,run);assert.deepEqual(reopened.session.meta,meta);assert.equal(h.log.filter(x=>x.op==='open').length,2);h.isolated();
});
for(const fault of ['error','blocked'])test(`app ${fault} shows init error; same store retries selected namespace only`,async()=>{
 const h=harness(fault),{session:s,observed}=await h.boot();h.isolated();assert.equal(observed.renders,0);assert.equal(observed.errors.length,1);assert.match(observed.errors[0].at(-1),fault==='error'?/open_failed/:/open_blocked/);assert.equal(s.busy,false);assert.deepEqual(observed.loads,[]);await s.load();assert.equal(s.status,'empty');assert.equal(h.log.filter(x=>x.op==='open').length,2);h.isolated();
});
test('app selected store quota abort keeps both namespaces and retries without fallback',async()=>{
 const h=harness(),{session:s}=await h.boot();h.isolated();await s.start('M');const saved=structuredClone(h.fake.dbs.get(preview));h.fake.faults.quota=true;await assert.rejects(s.settings({language:'fr'}));assert.deepEqual(h.fake.dbs.get(preview),saved);h.isolated();h.fake.faults.quota=false;await s.settings({language:'fr'});assert.equal(s.meta.settings.language,'fr');assert.equal(h.log.filter(x=>x.op==='open').length,1);h.isolated();
});
test('app does not read or migrate old save, best or backup into new preview',async()=>{
 const h=harness(),{session:s}=await h.boot();h.isolated();assert.equal(s.run,null);assert.deepEqual(s.meta.bests,{});assert.deepEqual(s.meta.recordedRuns,[]);assert.equal(h.fake.dbs.get(preview).stores.backup.size,0);assert.deepEqual(h.fake.dbs.get('yusha100'),h.before);
});
test('backend default remains yusha100; preview wiring does not rename global default',async()=>{
 const h=harness(),store=createIndexedDbStore({indexedDB:h.idb});assert.deepEqual(h.log,[]);const result=await store.load();assert.equal(result.status,'unsupported');assert.deepEqual(h.log.filter(x=>x.op==='open'),[{op:'open',name:'yusha100',version:1}]);assert.deepEqual(h.fake.dbs.get('yusha100'),h.before);
});
