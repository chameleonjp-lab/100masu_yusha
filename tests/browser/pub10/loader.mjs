import fs from'node:fs';import path from'node:path';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import{installGuard}from'../pages-guard.mjs';
import{servedVerifier}from'../pages-served-bytes.mjs';
import{loadArtifact}from'../pages-artifact-gate.mjs';import{responsePlanner,adapter}from'./helpers.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
// Same component-by-component O_NOFOLLOW contract as the fixed main loader.
// This second read is independently hashed against the pinned manifest before use.
export function readPinned(root,relative){let dir,file;try{const absolute=path.resolve(root);dir=fs.openSync(path.parse(absolute).root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);const parts=[...absolute.slice(path.parse(absolute).root.length).split('/').filter(Boolean),...relative.split('/')];for(const part of parts.slice(0,-1)){const next=fs.openSync(`/proc/self/fd/${dir}/${part}`,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);fs.closeSync(dir);dir=next;}file=fs.openSync(`/proc/self/fd/${dir}/${parts.at(-1)}`,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);assert.ok(fs.fstatSync(file).isFile());return fs.readFileSync(file);}finally{if(file!==undefined)fs.closeSync(file);if(dir!==undefined)fs.closeSync(dir);}}
export function fixedSnapshot({root,baseURL,expectedPin}){
 const gate=loadArtifact(root,baseURL,expectedPin),resources=new Map();
 for(const r of gate.manifest.resources){const bytes=readPinned(root,r.path);assert.equal(bytes.length,r.bytes);assert.equal(hash(bytes),r.sha256);resources.set(r.path,bytes);}
 assert.equal(hash(readPinned(root,'publication.json')),expectedPin,'Manifest changed during snapshot');
 const plan=responsePlanner({baseURL,raw:gate.raw,expectedPin,resources});
 return Object.freeze({urls:Object.freeze([...gate.manifest.resources.map(r=>new URL(r.path,baseURL).href),new URL('publication.json',baseURL).href]),installGuards:async(context,blocked)=>{const served=servedVerifier(baseURL,gate.manifest.resources,gate.raw);await installGuard(context,gate.policy,blocked,served.check);return Object.freeze({missing:served.missing,observed:served.observed});},plan,handler:adapter(plan),baseURL,manifestPin:expectedPin,resourceCount:resources.size,storage:'yusha100-publication-preview-v1',labRankingIntegration:false,treeSha:gate.manifest.treeSha??null,evidence:Object.freeze({...gate.manifest.evidence}),sourceSha:gate.manifest.sourceSha??null});
}
