import test from 'node:test';
import assert from 'node:assert/strict';
import {loadContentFromDisk} from '../../src/content/node.js';
import {createMemoryStore} from '../../src/save/index.js';
const c = await loadContentFromDisk();
const ui = await import('../../src/ui/session.js').catch(()=>({}));
test('session starts with unique ID and persists roll before exposing it', async()=>{
 assert.equal(typeof ui.createSession,'function');
 const store=createMemoryStore(), s=ui.createSession(c,store);
 await s.load(); await s.start('M'); const id=s.run.runId;
 await s.act({type:'roll'}); assert.equal(s.run.phase,'rolled');
 assert.deepEqual((await store.load()).run,s.run);
 await s.start('M',true); assert.notEqual(s.run.runId,id);
});
test('failed save leaves visible run and RNG unchanged',async()=>{
 assert.equal(typeof ui.createSession,'function');
 const store=createMemoryStore(), s=ui.createSession(c,store); await s.load(); await s.start('M');
 const before=JSON.stringify(s.run); store.commit=async()=>{throw new Error('disk full')};
 await assert.rejects(s.act({type:'roll'}),/disk full/); assert.equal(JSON.stringify(s.run),before);
});
test('double tap cannot dispatch or save a second action concurrently',async()=>{
 assert.equal(typeof ui.createSession,'function');
 const store=createMemoryStore(), s=ui.createSession(c,store); await s.load(); await s.start('M');
 const first=s.act({type:'roll'}); await assert.rejects(s.act({type:'roll'}),/busy/); await first;
 assert.equal(s.run.revision,1);
});
test('last saved result survives reopen without replaying effects',async()=>{
 const store=createMemoryStore(),s=ui.createSession(c,store);await s.load();await s.start('M');await s.act({type:'roll'});
 const reopened=ui.createSession(c,store);await reopened.load();assert.equal(reopened.meta.uiLastResult.runId,reopened.run.runId);assert.equal(reopened.meta.uiLastResult.revision,reopened.run.revision);assert.ok(reopened.meta.uiLastResult.effects.some(f=>f.t==='dieRolled'));
});
test('reload holds the same mutex as writes and releases after failure',async()=>{
 const store=createMemoryStore(),s=ui.createSession(c,store);await s.load();await s.start('M');const load=store.load.bind(store);let release;store.load=()=>new Promise(r=>{release=r});const pending=s.load();assert.equal(s.busy,true);await assert.rejects(s.act({type:'roll'}),/busy/);await assert.rejects(s.load(),/busy/);release(await load());await pending;assert.equal(s.busy,false);store.load=async()=>{throw Error('read failed')};await assert.rejects(s.load(),/read failed/);assert.equal(s.busy,false);
});
test('language changes preserve run, board, RNG and last saved selection',async()=>{const store=createMemoryStore(),s=ui.createSession(c,store);await s.load();await s.start('M');await s.act({type:'roll'});const run=JSON.stringify(s.run);await s.settings({language:'fr'});assert.equal(s.meta.settings.language,'fr');assert.equal(JSON.stringify(s.run),run);});
