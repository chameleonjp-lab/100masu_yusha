// Browser execution remains required. Node tests cover orchestration assertions only.
import assert from 'node:assert/strict';
export async function runNativeScenarios(execute,key){
 assert.match(key,/^__native_probe_[a-f0-9]{32}$/);
 const before=await execute(0,'game',key);assert.deepEqual(await execute(1,'game',key),before);
 assert.deepEqual(await execute(0,'initialize',key),[0,0,0]);
 // Native transactions over the same store scope must serialize across connections.
 const results=await Promise.all([execute(0,'increment',key),execute(1,'increment',key)]);
 assert.deepEqual(results.sort((a,b)=>a-b),[1,2]);
 for(const tab of [0,1])assert.deepEqual(await execute(tab,'read',key),[2,2,2]);
 const aborted=await execute(0,'abort',key);assert.equal(aborted.aborted,true);
 assert.deepEqual(aborted.before,[2,2,2]);assert.deepEqual(aborted.after,aborted.before);
 assert.deepEqual(await execute(1,'read',key),[2,2,2]);
 for(const tab of [0,1])assert.deepEqual(await execute(tab,'game',key),before);
 return {twoConnectionAtomicIncrement:2,abortAllStores:true,gameRecordsUnchanged:true};
}
// Self-contained function passed to Playwright page.evaluate, never imported by the game.
export async function nativeStorageAction({base,key,action}){
 const url=new URL(base);
 if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!url.port||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/'))throw new Error('Unexpected artifact origin');
 if(!/^__native_probe_[a-f0-9]{32}$/.test(key))throw new Error('Unsafe probe key');
 if(!['game','initialize','increment','read','abort','resume','conflictLoad','conflictMove'].includes(action))throw new Error('Unexpected probe action');
 if(globalThis.location.origin!==url.origin||!globalThis.location.pathname.startsWith(url.pathname))throw new Error('Wrong page origin');
 const namespace='yusha100-publication-preview-v1';
 const moduleURL=new URL('src/save/indexeddb.js',url).href;
 // Cache per page so tab0 and tab1 have distinct native open connections.
 const cache=globalThis.__yushaNativeProbeBackend;
 if(cache&&cache.moduleURL!==moduleURL)throw new Error('Artifact changed during probe');
 const backend=cache?.backend||(await import(moduleURL)).createIndexedDbBackend({name:namespace});
 if(!cache)globalThis.__yushaNativeProbeBackend={moduleURL,backend};
 if(action==='conflictMove'){
  const saved=globalThis.__yushaGameConflictSession;
  if(!saved||saved.key!==key||saved.moduleURL!==moduleURL)throw new Error('No prepared conflict session');
  try{await saved.session.act({type:'move'});return {rejected:false};}
  catch(error){if(error.name!=='SaveError')throw error;return {rejected:true,code:error.code};}
 }
 if(action==='resume'||action==='conflictLoad'){
  const {createStore}=await import(new URL('src/save/core.js',url).href);
  const {createSession}=await import(new URL('src/ui/session.js',url).href);
  const {loadContentInBrowser}=await import(new URL('src/content/browser.js',url).href);
  const session=createSession(await loadContentInBrowser(url.href),createStore(backend));await session.load();
  if(action==='conflictLoad'){if(session.view?.phase!=='rolled'||!session.view.actions.some(a=>a.type==='move'&&!a.adjust))throw new Error('Conflict requires committed rolled state');globalThis.__yushaGameConflictSession={key,moduleURL,session};}
  return {status:session.status,run:session.run,meta:session.meta,view:session.view};
 }
 const stores=['run','meta','backup'];
 const read=()=>backend.transaction('read',tx=>Promise.all(stores.map(s=>tx.get(s,key))));
 if(action==='game')return backend.transaction('read',tx=>Promise.all([tx.get('run','current'),tx.get('meta','meta')]));
 if(action==='read')return read();
 if(action==='initialize'){
  await backend.transaction('write',async tx=>{for(const s of stores)if(await tx.get(s,key)!==undefined)throw new Error('Probe key already exists');for(const s of stores)await tx.put(s,key,0)});
  return read();
 }
 if(action==='increment')return backend.transaction('write',async tx=>{
  const values=await Promise.all(stores.map(s=>tx.get(s,key)));
  if(!values.every(v=>Number.isSafeInteger(v)&&v===values[0]&&v>=0))throw new Error('Torn or absent probe state');
  const next=values[0]+1;for(const s of stores)await tx.put(s,key,next);return next;
 });
 const before=await read();let aborted=false;
 try{await backend.transaction('write',async tx=>{for(const s of stores)await tx.put(s,key,999);throw new Error('PROBE_EXPECTED_ABORT');});}
 catch(error){if(error.message!=='PROBE_EXPECTED_ABORT')throw error;aborted=true;}
 return {aborted,before,after:await read()};
}
export function verifyResumedState(before,after){
 assert.ok(before?.run?.runId,'No saved run before reload');assert.ok(before.view?.actions,'No next-action snapshot');
 assert.deepEqual(after,before,'Reload changed committed run/meta/view/next actions');
}
