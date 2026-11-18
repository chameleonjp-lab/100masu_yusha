// Prepared Q3 probe. Browser acceptance is NOT established by syntax or unit tests.
// Existing Playwright module is required; no install or external service access.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runUiContinue} from './pages-ui-continue.mjs';
import {ROUTES,runRouteConflict} from './pages-route-conflict.mjs';
import {runNativeScenarios,nativeStorageAction,verifyResumedState} from './pages-native-storage.mjs';
import {servedVerifier} from './pages-served-bytes.mjs';
import {validateBase,makePolicy,installGuard} from './pages-guard.mjs';
import {fileURLToPath} from 'node:url';
import {loadArtifact,assertGateResults} from './pages-artifact-gate.mjs';
export function gateIdentity(snapshot,expectedManifestSha256){return {baseURL:snapshot.base.href,expectedManifestSha256,artifactSha256:snapshot.artifactSha256};}
export async function runPublicationGate({baseURL,artifact,expectedManifestSha256,chromium,executablePath='/usr/bin/chromium'}){
 const snapshot=loadArtifact(artifact,baseURL,expectedManifestSha256),{base,manifest,raw,served,policy}=snapshot;
 assert.ok(chromium&&typeof chromium.launch==='function','Existing browser provider required');
const blocked=[],errors=[],dbNames=[];
const browser=await chromium.launch({executablePath,headless:true});
try{
 const routeResults=[];
 for(const routeId of ROUTES){
 const context=await browser.newContext({locale:'ja-JP',viewport:{width:402,height:700},serviceWorkers:'block'});
 await installGuard(context,policy,blocked,served.check);
 await context.exposeBinding('__observeDatabase',(_,name)=>{dbNames.push(name);});
 await context.addInitScript(()=>{
  const open=IDBFactory.prototype.open;
  IDBFactory.prototype.open=function(name,...args){
   globalThis.__observeDatabase(name);
   if(name!=='yusha100-publication-preview-v1')throw new Error('Unexpected database');
   return open.call(this,name,...args);
  };
  IDBFactory.prototype.deleteDatabase=function(){throw new Error('Database deletion prohibited by probe');};
 });
 context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
 const page=await context.newPage();
 await page.goto(base.href);
 // Exercise every declared response through the same guarded page, never context.request.
 await page.evaluate(async urls=>{for(const url of urls){const response=await fetch(url,{method:'GET',redirect:'error',cache:'no-store'});if(response.status!==200)throw Error('Artifact prefetch failed');await response.arrayBuffer();}},[...manifest.resources.map(r=>new URL(r.path,base).href),new URL('publication.json',base).href]);
 const second=await context.newPage();await second.goto(base.href);await second.locator('#app').waitFor();
 const key='__native_probe_'+crypto.randomBytes(16).toString('hex'),pages=[page,second];
 const execute=(tab,action,probeKey)=>pages[tab].evaluate(nativeStorageAction,{base:base.href,key:probeKey,action});
 assert.deepEqual(await execute(0,'game',key),[undefined,undefined],'Fresh route context unexpectedly contains saved game data');
 const shortPath=await runRouteConflict({page,execute,route:routeId,key});
 await page.locator('#app:not([data-presentation])').waitFor();
 const native=await runNativeScenarios(execute,key);
 const beforeReload=await execute(0,'resume',key);
 await page.reload();await page.locator('#app').waitFor();
 verifyResumedState(beforeReload,await execute(0,'resume',key));
 const uiContinue=await runUiContinue({page,before:beforeReload,readSnapshot:()=>execute(0,'resume',key)});
 await second.close();routeResults.push({shortPath,nativeStorage:native,semanticReload:'passed',uiContinue});await context.close();
 }
 snapshot.recheck();
 const status=assertGateResults({routeResults,missing:served.missing(),blocked,errors,dbNames});
 return {status,...gateIdentity(snapshot,expectedManifestSha256),servedResources:served.observed(),routeResults,limits:['four-route short paths, not full playthrough','not iPhone or audio acceptance','not deployment acceptance']};
}finally{await browser.close();}
}
// No auto-launch on import or node --test discovery. Explicit manual CLI only.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)&&process.argv.includes('--run')){
 const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
 try{console.log(JSON.stringify(await runPublicationGate({baseURL:process.env.YUSHA_BASE_URL,artifact:process.env.YUSHA_ARTIFACT,expectedManifestSha256:process.env.YUSHA_MANIFEST_SHA256,chromium,executablePath:process.env.CHROMIUM||'/usr/bin/chromium'}),null,2));}
 catch(error){console.error(JSON.stringify({status:'failed',message:error.message,browserAcceptance:false}));process.exitCode=1;}
}
