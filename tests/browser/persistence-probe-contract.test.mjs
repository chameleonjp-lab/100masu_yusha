import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {pathToFileURL,fileURLToPath} from 'node:url';

// Contract test of the exact optional browser probe wrapper. Not a browser/IDB test.
const base=fileURLToPath(new URL('../../',import.meta.url));
const imp=p=>import(pathToFileURL(`${base}/${p}`));
const {createMemoryBackend}=await imp('src/save/memory.js');
const {createStore}=await imp('src/save/core.js');
const {createSession}=await imp('src/ui/session.js');
const {loadContentFromDisk}=await imp('src/content/node.js');
const content=await loadContentFromDisk({},base);
const probeSource=await readFile(process.env.YUSHA_PROBE_FILE||`${base}/tests/browser/persistence-accessibility-smoke.mjs`,'utf8');
const wrapper=probeSource.split('\n').find(l=>l.trimStart().startsWith('backend.transaction=(mode,fn)=>'));
assert.ok(wrapper,'test executes the exact wrapper from the actual optional probe');

async function fixture(){
  const backend=createMemoryBackend(),transaction=backend.transaction.bind(backend),probe={rejectWrite:false};
  vm.runInNewContext(wrapper,{backend,transaction,probe,DOMException});
  const store=createStore(backend),session=createSession(content,store);await session.load();await session.start('M');
  return {backend,probe,store,session};
}
const snapshot=async f=>JSON.stringify(await f.store.load());

test('actual probe refusal intercepts createStore write and preserves stored/visible run',async()=>{
  const f=await fixture(),before=await snapshot(f),visible=JSON.stringify(f.session.run);
  f.probe.rejectWrite=true;
  await assert.rejects(f.session.act({type:'roll'}),e=>e.name==='QuotaExceededError');
  assert.equal(await snapshot(f),before);assert.equal(JSON.stringify(f.session.run),visible);
  assert.equal(f.probe.rejectWrite,false);
});
test('read transaction does not consume a queued write refusal',async()=>{
  const f=await fixture();f.probe.rejectWrite=true;await f.store.load();assert.equal(f.probe.rejectWrite,true);
  await assert.rejects(f.session.act({type:'roll'}),e=>e.name==='QuotaExceededError');
  assert.equal(f.probe.rejectWrite,false);
});
test('one-shot refusal allows exactly one retry commit without advancing RNG on failed attempt',async()=>{
  const f=await fixture(),before=JSON.stringify(f.session.run);f.probe.rejectWrite=true;
  await assert.rejects(f.session.act({type:'roll'}),e=>e.name==='QuotaExceededError');
  assert.equal(JSON.stringify(f.session.run),before);await f.session.act({type:'roll'});
  assert.equal(f.session.run.revision,1);assert.equal(f.session.run.rolls,1);
  assert.deepEqual((await f.store.load()).run,f.session.run);
});
test('probe wrapper also refuses replacement start and preserves previous adventure',async()=>{
  const f=await fixture(),before=await snapshot(f);f.probe.rejectWrite=true;
  await assert.rejects(f.session.start('F',true),e=>e.name==='QuotaExceededError');
  assert.equal(await snapshot(f),before);assert.equal(f.session.run.route,'M');
});
