// Offline validation and result aggregation; importing this module never starts a browser.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {makePolicy,validateBase} from './pages-guard.mjs';import {servedVerifier} from './pages-served-bytes.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function loadArtifact(root,value,expectedManifestSha256){
 const base=validateBase(value);assert.equal(typeof root,'string');root=path.resolve(root);
 assert.match(expectedManifestSha256||'',/^[a-f0-9]{64}$/,'Independent manifest SHA256 required');
 const read=relative=>{
  let dir=fs.openSync(path.parse(root).root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);let file;
  try{const parts=[...root.slice(path.parse(root).root.length).split('/').filter(Boolean),...relative.split('/')];
   for(const part of parts.slice(0,-1)){const next=fs.openSync(`/proc/self/fd/${dir}/${part}`,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);fs.closeSync(dir);dir=next;}
   file=fs.openSync(`/proc/self/fd/${dir}/${parts.at(-1)}`,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);assert.ok(fs.fstatSync(file).isFile(),'Artifact resource must be regular file');return fs.readFileSync(file);
  }finally{if(file!==undefined)fs.closeSync(file);fs.closeSync(dir);}
 };
 const raw=read('publication.json'),manifest=JSON.parse(raw);assert.equal(hash(raw),expectedManifestSha256,'Manifest pin mismatch');assert.equal(manifest.schema,'yusha100-pages-1');assert.equal(manifest.storage?.database,'yusha100-publication-preview-v1');assert.equal(manifest.labRankingIntegration,false);assert.ok(Array.isArray(manifest.resources)&&manifest.resources.length>0);
 for(const r of manifest.resources)assert.ok(typeof r.path==='string'&&!/[\s\x00-\x20\x7f:]/.test(r.path),'Canonical artifact path required');
 const policy=makePolicy(base.href,[...manifest.resources.map(r=>r.path),'publication.json']);
 // Validate unique records, exact length/hash syntax and MIME before any resource reads.
 const served=servedVerifier(base.href,manifest.resources,raw);assert.ok(manifest.resources.some(r=>r.path==='index.html'));
 const recheck=()=>{assert.equal(hash(read('publication.json')),hash(raw),'Manifest changed');for(const r of manifest.resources){const b=read(r.path);assert.equal(b.length,r.bytes,'Artifact byte mismatch');assert.equal(hash(b),r.sha256,'Artifact hash mismatch')}};recheck();
 return {base,manifest,raw,policy,served,recheck,artifactSha256:hash(raw)};
}
export function assertGateResults({routeResults,missing,blocked,errors,dbNames}){
 assert.deepEqual(missing,[],'Incomplete served resource coverage');assert.deepEqual(blocked,[],'Guard blocked requests');assert.deepEqual(errors,[],'Browser errors');assert.ok(dbNames.length>0&&dbNames.every(n=>n==='yusha100-publication-preview-v1'),'Unexpected or absent native database');
 assert.deepEqual(routeResults.map(r=>r.shortPath?.route).sort(),['B','F','H','M']);
 for(const r of routeResults){assert.equal(r.shortPath.staleSessionRejected,true);assert.equal(r.nativeStorage.twoConnectionAtomicIncrement,2);assert.equal(r.nativeStorage.abortAllStores,true);assert.equal(r.nativeStorage.gameRecordsUnchanged,true);assert.equal(r.semanticReload,'passed');assert.equal(r.uiContinue.uiContinue,true);assert.equal(r.uiContinue.savedStateUnchanged,true);}
 return 'passed';
}
