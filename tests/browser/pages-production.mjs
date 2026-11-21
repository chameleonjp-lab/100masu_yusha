// Production-artifact smoke test. Run only against an isolated loopback server.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {loadProductionArtifact} from '../../tools/build-pages-production.mjs';
import {installGuard,makePolicy} from './pages-guard.mjs';
import {servedVerifier} from './pages-served-bytes.mjs';
import {collectPageErrors,runSettingsPersistence} from './pages-settings.mjs';
import {verifyResumedState} from './pages-native-storage.mjs';
import {ROUTES,runRouteConflict} from './pages-route-conflict.mjs';
import {runUiContinue} from './pages-ui-continue.mjs';
import {createProviders} from './pub10/providers.mjs';

const PRODUCTION='yusha100-production-v1';
const HISTORICAL=['yusha100','yusha100-publication-preview-v1'];
const MOUNTS=['/','/100masu_yusha/'];
const MIME={html:'text/html',css:'text/css',js:'text/javascript',json:'application/json',svg:'image/svg+xml'};
const controlHTML=Buffer.from('<!doctype html><meta charset="utf-8"><title>Isolated storage test fixture</title>');

async function startServing(snapshot){
 const resources=snapshot.manifest.resources.filter(r=>r.path!=='.nojekyll');
 const bodies=new Map(resources.map(record=>[record.path,snapshot.files.get(record.path)]));
 bodies.set('publication.json',snapshot.raw);
 const responses=new Map();
 for(const mount of MOUNTS){
  for(const [name,bytes] of bodies)responses.set(mount+name,{name,bytes});
  responses.set(mount,responses.get(mount+'index.html'));
 }
 const server=createServer({requestTimeout:10000,headersTimeout:10000},(req,res)=>{
  const record=req.method==='GET'&&responses.get(req.url);
  if(!record){res.writeHead(404);res.end();return;}
  const mime=MIME[record.name.split('.').at(-1)];
  if(!mime){res.writeHead(500);res.end();return;}
  res.writeHead(200,{'Content-Type':mime,'Content-Length':record.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(record.bytes);
 });
 await new Promise((yes,no)=>{
  server.once('error',no);
  server.listen({host:'127.0.0.1',port:0,exclusive:true},yes);
 });
 const {port,address}=server.address();
 assert.equal(address,'127.0.0.1');
 return {origin:'http://127.0.0.1:'+port,resources,close:()=>new Promise((yes,no)=>{
  server.close(err=>err?no(err):yes());server.closeAllConnections();
 })};
}

// Runs in the isolated storage-fixture document, not in the game document.
async function inspectHistorical({base,names,seed}){
 if(location.href!==new URL('__storage_fixture__',base).href)throw Error('Wrong storage fixture origin');
 const stores=['run','meta','backup'],keys=['current','meta','last'],result=[];
 const entries=db=>Promise.all(stores.map((store,index)=>new Promise((yes,no)=>{
  const tx=db.transaction(store,'readonly'),object=tx.objectStore(store);
  const stored=object.getAll(),found=object.getAllKeys();
  tx.onabort=()=>no(tx.error);tx.oncomplete=()=>yes({store,expectedKey:keys[index],keys:found.result,values:stored.result});
 })));
 for(const name of names){
  const db=await new Promise((yes,no)=>{
   const request=indexedDB.open(name);
   request.onupgradeneeded=event=>{
    if(!seed||event.oldVersion!==0){request.transaction.abort();return;}
    for(let i=0;i<stores.length;i++)request.result.createObjectStore(stores[i]).put({guard:'production-do-not-migrate',name,slot:i},keys[i]);
   };
   request.onsuccess=()=>yes(request.result);request.onerror=()=>no(request.error);
   request.onblocked=()=>no(Error('Historical database blocked'));
  });
  try{result.push({name,version:db.version,stores:[...db.objectStoreNames],records:await entries(db)});}
  finally{db.close();}
 }
 return result;
}

// Runs through page.evaluate. This only reads the synthetic local save or
// exercises a second, stale real game session; it never uses historical DBs.
async function readProductionStorage({base,key,action}){
 const url=new URL(base);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.search||url.hash||
    location.origin!==url.origin||!location.pathname.startsWith(url.pathname)||!['/','/100masu_yusha/'].includes(url.pathname))
  throw Error('Invalid loopback production storage test origin');
 if(!/^__native_probe_[a-f0-9]{32}$/.test(key)||!['resume','game','conflictLoad','conflictMove'].includes(action))
  throw Error('Invalid production storage test action');
 const moduleURL=new URL('src/save/indexeddb.js',url).href;
 const cache=globalThis.__yushaProductionProbe;
 if(cache&&cache.moduleURL!==moduleURL)throw Error('Different artifact origin');
 const backend=cache?.backend||(await import(moduleURL)).createIndexedDbBackend({name:'yusha100-production-v1'});
 if(!cache)globalThis.__yushaProductionProbe={moduleURL,backend};
 if(action==='game')return backend.transaction('read',tx=>Promise.all([tx.get('run','current'),tx.get('meta','meta')]));
 if(action==='conflictMove'){
  const saved=globalThis.__yushaProductionProbe.conflict;
  if(saved?.key!==key)throw Error('Unexpected stale-session key');
  try{await saved.session.act({type:'move'});return {rejected:false};}
  catch(err){if(err.name!=='SaveError')throw err;return {rejected:true,code:err.code};}
 }
 const {createStore}=await import(new URL('src/save/core.js',url).href);
 const {createSession}=await import(new URL('src/ui/session.js',url).href);
 const {loadContentInBrowser}=await import(new URL('src/content/browser.js',url).href);
 const session=createSession(await loadContentInBrowser(url.href),createStore(backend));await session.load();
 if(action==='conflictLoad')globalThis.__yushaProductionProbe.conflict={key,session};
 return {status:session.status,run:session.run,meta:session.meta,view:session.view};
}

async function runRoute({browser,base,network,paths,route,prefetch}){
 const context=await browser.newContext({locale:'ja-JP',viewport:{width:402,height:700},serviceWorkers:'block'});
 context.setDefaultTimeout(15000);
 const blocked=[],errors=[],opened=new Set(),allowedPages=new Set();
 try{
  const allowed=makePolicy(base,paths);
  // Reject requests not attributable to a test-owned document, including the
  // first navigation of an unexpected popup. Register each page before goto.
  const guardedContext={
   routeWebSocket:(pattern,handler)=>context.routeWebSocket(pattern,handler),
   route:(pattern,handler)=>context.route(pattern,async rule=>{
    let owner;try{owner=rule.request().frame().page();}catch{/* Unknown ownership is denied below. */}
    if(!allowedPages.has(owner)){blocked.push({kind:'unexpected-page-request'});await rule.abort('blockedbyclient');return;}
    await handler(rule);
   })
  };
  await installGuard(guardedContext,allowed,blocked,network.check);
  const fixture=await context.newPage();allowedPages.add(fixture);
  const fixtureURL=new URL('__storage_fixture__',base).href;
  // Synthetic response travels only within Playwright, never to the server.
  await fixture.route(fixtureURL,async rule=>{
   if(rule.request().method()!=='GET'||rule.request().redirectedFrom()){blocked.push({kind:'fixture-request'});await rule.abort('blockedbyclient');return;}
   await rule.fulfill({status:200,contentType:'text/html',body:controlHTML});
  });
  await fixture.goto(fixtureURL);
  const legacyBefore=await fixture.evaluate(inspectHistorical,{base,names:HISTORICAL,seed:true});
  assert.equal(legacyBefore.length,2);
  for(const {name,version,stores,records} of legacyBefore){
   assert.ok(HISTORICAL.includes(name));assert.equal(version,1);assert.deepEqual(stores,['backup','meta','run']);
   for(const [i,record] of records.entries()){
    assert.deepEqual(record.keys,[record.expectedKey]);
    assert.deepEqual(record.values,[{guard:'production-do-not-migrate',name,slot:i}]);
   }
  }
  await context.exposeBinding('__yushaProductionObserve',({page},kind,value)=>{
   if(!allowedPages.has(page)){blocked.push({kind:'unexpected-binding-page'});return;}
   if(kind==='open'&&value===PRODUCTION)opened.add(value);
   else blocked.push({kind});
  });
  await context.addInitScript(({namespace})=>{
   // Playwright also invokes init scripts on about:blank before it assigns an origin.
   if(location.protocol!=='http:'||location.hostname!=='127.0.0.1')return;
   const open=IDBFactory.prototype.open;
   IDBFactory.prototype.open=function(name,...args){
    void globalThis.__yushaProductionObserve('open',name);
    if(name!==namespace)throw Error('Unexpected save namespace');
    return open.call(this,name,...args);
   };
   IDBFactory.prototype.deleteDatabase=function(){
    void globalThis.__yushaProductionObserve('database-deletion');throw Error('No database deletion during production smoke');
   };
   window.open=function(){
    void globalThis.__yushaProductionObserve('popup');throw Error('No popups during production smoke');
   };
  },{namespace:PRODUCTION});
  const page=await context.newPage(),second=await context.newPage();
  allowedPages.add(page);allowedPages.add(second);
  context.on('page',unexpected=>{blocked.push({kind:'popup'});void unexpected.close().catch(()=>{});});
  collectPageErrors(page,errors);collectPageErrors(second,errors);
  await page.goto(base,{timeout:20000});await page.locator('#app').waitFor();
  if(prefetch)await page.evaluate(async urls=>{
   for(const url of urls){
    const reply=await fetch(url,{method:'GET',redirect:'error',cache:'no-store'});
    if(reply.status!==200)throw Error('Production artifact prefetch failed');
    await reply.arrayBuffer();
   }
  },paths.map(name=>new URL(name,base).href));
  await second.goto(base,{timeout:20000});await second.locator('#app').waitFor();
  const key='__native_probe_'+randomBytes(16).toString('hex'),pages=[page,second];
  const execute=(tab,action,probeKey)=>pages[tab].evaluate(readProductionStorage,{base,key:probeKey,action});
  assert.deepEqual(await execute(0,'game',key),[undefined,undefined],'Production read a historical save');
  const result=await runRouteConflict({page,execute,route,key});
  await page.locator('#app:not([data-presentation])').waitFor();
  if(prefetch)await runSettingsPersistence({page,readSnapshot:()=>execute(0,'resume',key)});
  const before=await execute(0,'resume',key);
  await page.reload({timeout:20000});await page.locator('#app').waitFor();
  verifyResumedState(before,await execute(0,'resume',key));
  await runUiContinue({page,before,readSnapshot:()=>execute(0,'resume',key)});
  assert.deepEqual(await fixture.evaluate(inspectHistorical,{base,names:HISTORICAL,seed:false}),legacyBefore,'Historical storage changed');
  assert.deepEqual([...opened],[PRODUCTION],'Production save namespace was not observed');
  assert.deepEqual(blocked,[],'Unexpected network, popup or storage request');
  assert.deepEqual(errors,[],'Browser errors');
  return {route:result.route,position:result.position,staleSessionRejected:true,reloaded:true,legacyUnchanged:true};
 }finally{await context.close();}
}

export async function runProductionBrowser({artifact,sourceSha,manifestSha256,chromium,executablePath}){
 assert.match(sourceSha??'',/^[a-f0-9]{40}$/,'Expected source commit required');
 assert.match(manifestSha256??'',/^[a-f0-9]{64}$/,'Expected manifest hash required');
 const snapshot=loadProductionArtifact(artifact,{sourceSha,manifestSha256});
 assert.equal(snapshot.manifest.storage.database,PRODUCTION);
 const providers=createProviders({chromium,executablePath});
 const server=await startServing(snapshot);
 let browser;
 try{
  browser=await providers.launchBrowser();
  const paths=[...server.resources.map(record=>record.path),'publication.json'],results=[];
  for(const mount of MOUNTS){
   const base=new URL(mount,server.origin).href,network=servedVerifier(base,server.resources,snapshot.raw);
   const routes=[];
   for(const [i,route] of ROUTES.entries())routes.push(await runRoute({browser,base,network,paths,route,prefetch:i===0}));
   assert.deepEqual(network.missing(),[],'Production served-byte coverage incomplete');
   results.push({mount,routes,servedResources:network.observed().length});
  }
  snapshot.recheck();
  return {status:'passed',sourceSha,manifestSha256,results,limits:['isolated Chromium browser smoke, not iPhone, audio or live deployment acceptance']};
 }finally{try{if(browser)await browser.close();}finally{await server.close();}}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {values}=parseArgs({options:{artifact:{type:'string'},'source-sha':{type:'string'},'manifest-sha256':{type:'string'}}});
  assert.ok(values.artifact,'--artifact is required');
  const executablePath=process.env.YUSHA_BROWSER,module=process.env.YUSHA_PLAYWRIGHT;
  assert.ok(executablePath&&isAbsolute(executablePath)&&module&&isAbsolute(module),'Use preverified absolute YUSHA_BROWSER and YUSHA_PLAYWRIGHT paths');
  const {chromium}=createRequire(import.meta.url)(module);
  console.log(JSON.stringify(await runProductionBrowser({artifact:resolve(values.artifact),sourceSha:values['source-sha'],
   manifestSha256:values['manifest-sha256'],chromium,executablePath})));
 }catch(err){console.error(err);process.exitCode=1;}
}
