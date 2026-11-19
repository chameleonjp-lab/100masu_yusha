import assert from'node:assert/strict';
export async function combinedGates({identity,unseeded,seeded}){
 const record={schema:'pub10-combined-local-candidate-1',identity:null,status:'blocked',gates:{},browserAcceptance:false,deployment:false,limits:['runtime result requires independent review','not iPhone/display/audio acceptance','no formal publication']};
 if(typeof unseeded!=='function'||typeof seeded!=='function'){record.reason='Both permitted existing runtime gates required';return record;}
 try{
  assert.match(identity.gameCommit,/^[a-f0-9]{40}$/);assert.match(identity.treeSha,/^[a-f0-9]{40}$/);assert.match(identity.manifestPin,/^[a-f0-9]{64}$/);const base=new URL(identity.baseURL);assert.equal(base.protocol,'http:');assert.equal(base.hostname,'127.0.0.1');assert.ok(base.port&&!base.username&&!base.password&&!base.search&&!base.hash);assert.ok(['/','/100masu_yusha/'].includes(base.pathname));record.identity={gameCommit:identity.gameCommit,treeSha:identity.treeSha,manifestPin:identity.manifestPin,baseURL:base.href};
  for(const [name,run] of [['unseeded',unseeded],['seeded',seeded]]){
   record.gates[name]={status:'running'};
   try{const result=await run();assert.equal(result.baseURL,record.identity.baseURL,'Gate base mismatch');if(name==='unseeded'){assert.equal(result.status,'passed');assert.equal(result.artifactSha256,identity.manifestPin);assert.equal(result.expectedManifestSha256,identity.manifestPin);assert.deepEqual(result.routeResults.map(r=>r.shortPath?.route).sort(),['B','F','H','M']);}else{assert.equal(result.providerExecution,true);assert.equal(result.manifestPin,identity.manifestPin);for(const [k,v]of Object.entries({seed:31,position:3,revision:3,heroHp:39,enemyHp:10,seedInterceptions:1,savedSnapshotUnchanged:true}))assert.equal(result[k],v);}record.gates[name]={status:'passed',result};}
   catch(error){record.gates[name]={status:'failed',code:'GATE_REJECTED',message:'Gate execution or acceptance check failed'};record.status='failed';return record;}
  }
  record.status='passed';return record;
 }catch(error){record.status='failed';record.code='IDENTITY_REJECTED';record.reason='Required fixed identity is invalid';return record;}
}
