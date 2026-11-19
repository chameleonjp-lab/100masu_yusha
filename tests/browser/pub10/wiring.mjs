// No CLI, implicit providers, launch flags, process spawning or installations.
import assert from'node:assert/strict';import{collectPageErrors}from'../pages-settings.mjs';import{runBattleProbe}from'./battle-probe.mjs';import{nativeStorageAction}from'../pages-native-storage.mjs';
export function browserSetup({seed}){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid seed');
 const crypto=globalThis.crypto,original=crypto.getRandomValues;let armed=false,used=0,closed=false;
 function wrapped(a){if(!armed)return original.call(this,a);if(!(a instanceof Uint32Array)||a.length!==1)throw Error('Unexpected armed random request');a[0]=seed;used++;armed=false;return a;}
 crypto.getRandomValues=wrapped;
 globalThis.__yushaProbe={arm(){if(closed||armed||used)throw Error('One-shot seed only');armed=true;},count:()=>used,restore(){if(crypto.getRandomValues!==wrapped)throw Error('Seed owner changed');crypto.getRandomValues=original;closed=true;armed=false;}};
 const open=IDBFactory.prototype.open;IDBFactory.prototype.open=function(name,...args){if(name!=='yusha100-publication-preview-v1')throw Error('Unexpected database');return open.call(this,name,...args);};IDBFactory.prototype.deleteDatabase=function(){throw Error('Database deletion prohibited');};
}
export async function runPrepared({snapshot,providers,probe=runBattleProbe}){
 const base=new URL(snapshot.baseURL);assert.equal(base.hostname,'127.0.0.1');assert.equal(snapshot.storage,'yusha100-publication-preview-v1');assert.equal(snapshot.labRankingIntegration,false);assert.match(snapshot.manifestPin,/^[a-f0-9]{64}$/);
 assert.equal(typeof providers?.startServer,'function');assert.equal(typeof providers?.launchBrowser,'function');assert.equal(typeof snapshot.installGuards,'function');
 let server,browser,context;const blocked=[],errors=[];let count=null;
 try{server=await providers.startServer({host:'127.0.0.1',port:Number(base.port),handler:snapshot.handler});const address=server.address();assert.equal(address?.address,'127.0.0.1');assert.equal(address?.port,Number(base.port));
 browser=await providers.launchBrowser();context=await browser.newContext({locale:'ja-JP',viewport:{width:402,height:700},serviceWorkers:'block'});const network=await snapshot.installGuards(context,blocked);assert.equal(typeof network?.missing,'function');context.on('page',page=>collectPageErrors(page,errors));await context.addInitScript(browserSetup,{seed:31});const page=await context.newPage();await page.goto(base.href);await page.evaluate(async urls=>{for(const url of urls){const response=await fetch(url,{method:'GET',redirect:'error',cache:'no-store'});if(response.status!==200)throw Error('Prefetch failed');await response.arrayBuffer();}},snapshot.urls);await page.evaluate(()=>globalThis.__yushaProbe.arm());
 const readSnapshot=()=>page.evaluate(nativeStorageAction,{base:base.href,key:'__native_probe_00000000000000000000000000000031',action:'resume'});
 const reload=async()=>{count=await page.evaluate(()=>{const n=globalThis.__yushaProbe.count();globalThis.__yushaProbe.restore();return n;});assert.equal(count,1,'Exactly one seed interception required');await page.reload();};
 const result=await probe({page,readSnapshot,reload});assert.equal(count,1);assert.deepEqual(blocked,[],'Blocked requests');assert.deepEqual(errors,[],'Page/console errors');assert.deepEqual(network.missing(),[],'Incomplete served resource coverage');return{...result,seedInterceptions:count,manifestPin:snapshot.manifestPin,baseURL:snapshot.baseURL,providerExecution:true,nativeBrowser:false};
 }finally{try{if(context)await context.close();}finally{try{if(browser)await browser.close();}finally{if(server)await server.close();}}}
}
