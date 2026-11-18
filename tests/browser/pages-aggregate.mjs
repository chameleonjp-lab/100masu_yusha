// Pure report aggregation; supplied reports are evidence, not authenticated browser execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const exactSet=(actual,expected)=>{assert.ok(Array.isArray(actual));assert.equal(new Set(actual).size,actual.length);assert.deepEqual([...actual].sort(),[...expected].sort())};
function base(value){assert.equal(typeof value,'string');const u=new URL(value);assert.equal(u.href,value);assert.equal(u.protocol,'http:');assert.ok(['127.0.0.1','localhost'].includes(u.hostname)&&u.port);assert.ok(!u.username&&!u.password&&!u.search&&!u.hash);assert.ok(u.pathname.endsWith('/')&&!/%|\\|\s|:/.test(u.pathname));return u;}
export function aggregatePublicationGates({manifestBytes,expectedSourceSha,expectedManifestSha256,expectedBases,results}={}){
 assert.equal(typeof manifestBytes,'string');assert.match(expectedSourceSha||'',/^[a-f0-9]{40}$/);assert.match(expectedManifestSha256||'',/^[a-f0-9]{64}$/);assert.equal(hash(manifestBytes),expectedManifestSha256);
 const manifest=JSON.parse(manifestBytes);assert.equal(manifest.schema,'yusha100-pages-1');assert.equal(manifest.sourceSha,expectedSourceSha);assert.equal(manifest.storage?.database,'yusha100-publication-preview-v1');assert.equal(manifest.labRankingIntegration,false);
 assert.ok(Array.isArray(expectedBases)&&expectedBases.length===2);const bases=expectedBases.map(base);assert.equal(bases.filter(b=>b.pathname==='/').length,1);assert.equal(bases.filter(b=>b.pathname!=='/').length,1);
 assert.ok(Array.isArray(manifest.resources)&&manifest.resources.length>0);const paths=manifest.resources.map(r=>{assert.ok(r&&typeof r.path==='string'&&!/[\\%?#:\s\x00-\x20\x7f]/.test(r.path)&&r.path.split('/').every(s=>s&&s!=='.'&&s!=='..'));assert.ok(Number.isSafeInteger(r.bytes)&&r.bytes>=0);assert.match(r.sha256||'',/^[a-f0-9]{64}$/);return r.path});assert.ok(paths.includes('index.html')&&!paths.includes('publication.json'));assert.equal(new Set(paths).size,paths.length);paths.push('publication.json');
 assert.ok(Array.isArray(results)&&results.length===2);exactSet(results.map(r=>r?.baseURL),expectedBases);
 for(const r of results){base(r.baseURL);assert.equal(r.status,'passed');assert.equal(r.expectedManifestSha256,expectedManifestSha256);assert.equal(r.artifactSha256,expectedManifestSha256);exactSet(r.servedResources,paths);assert.ok(Array.isArray(r.routeResults));exactSet(r.routeResults.map(x=>x?.shortPath?.route),['M','F','B','H']);
  for(const x of r.routeResults){assert.equal(x.shortPath.staleSessionRejected,true);assert.equal(x.nativeStorage?.twoConnectionAtomicIncrement,2);assert.equal(x.nativeStorage.abortAllStores,true);assert.equal(x.nativeStorage.gameRecordsUnchanged,true);assert.equal(x.settingsPersistence?.settingsPersisted,true);assert.equal(x.settingsPersistence.runUnchanged,true);assert.equal(x.settingsPersistence.otherMetadataUnchanged,true);assert.equal(x.semanticReload,'passed');assert.equal(x.uiContinue?.uiContinue,true);assert.equal(x.uiContinue.savedStateUnchanged,true);}
 }
 return Object.freeze({status:'passed',scope:'supplied root/subpath evidence aggregation only',sourceSha:expectedSourceSha,manifestSha256:expectedManifestSha256,bases:Object.freeze([...expectedBases]),resourceCount:paths.length,routeCountPerBase:4});
}
