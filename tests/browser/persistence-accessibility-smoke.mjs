// Prepared acceptance probe; NOT included in node --test, and not evidence until executed.
// Requires existing Playwright/Chromium and a localhost server. No installs or external requests.
// Real IndexedDB/two independent pages; deterministic write-refusal injection is test-only,
// not a physical disk-quota test. Text enlargement is CSS 200%, not iOS Dynamic Type.
// YUSHA_BASE_URL=http://127.0.0.1:8080 node tests/browser/persistence-accessibility-smoke.mjs
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright'));}
const base=process.env.YUSHA_BASE_URL||'http://127.0.0.1:8080';
assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/,'localhost only');
const origin=new URL(base).origin,blocked=[],errors=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true});
async function isolated(){
 const c=await browser.newContext({locale:'ja-JP',viewport:{width:402,height:700},serviceWorkers:'block'});
 await c.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){blocked.push(r.request().url());return r.abort();}return r.continue();});
 c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 return c;
}
try{
 const persistence=await isolated(),a=await persistence.newPage(),b=await persistence.newPage();
 for(const page of [a,b]){
  await page.goto(base);
  await page.evaluate(async()=>{
   const {loadContentInBrowser}=await import('/src/content/browser.js');
   const {createIndexedDbBackend}=await import('/src/save/indexeddb.js');
   const {createStore}=await import('/src/save/core.js');
   const {createSession}=await import('/src/ui/session.js');
   const backend=createIndexedDbBackend({name:'acceptance-probe-isolated'}),transaction=backend.transaction.bind(backend);
   // Failure flag exists only in this disposable page and dedicated test database.
   globalThis.probe={rejectWrite:false};
   backend.transaction=(mode,fn)=>{if(mode==='write'&&probe.rejectWrite){probe.rejectWrite=false;throw new DOMException('Injected test write refusal','QuotaExceededError');}return transaction(mode,fn);};
   probe.store=createStore(backend);probe.session=createSession(await loadContentInBrowser('/'),probe.store);
   await probe.session.load();
  });
 }
 await a.evaluate(()=>probe.session.start('M'));
 await b.evaluate(()=>probe.session.load());
 const initial=await a.evaluate(()=>JSON.stringify(probe.session.run));
 // Both independently loaded revision zero. Only one may commit its roll.
 const races=await Promise.all([a,b].map(p=>p.evaluate(async()=>{try{await probe.session.act({type:'roll'});return {ok:true};}catch(e){return {ok:false,code:e.code,message:e.message};}})));
 assert.equal(races.filter(x=>x.ok).length,1,JSON.stringify(races));
 assert.ok(races.find(x=>!x.ok).code?.startsWith('stale_'),JSON.stringify(races));
 const saved=await a.evaluate(async()=>JSON.stringify((await probe.store.load()).run));
 assert.equal(JSON.parse(saved).rolls,JSON.parse(initial).rolls+1);
 // Replace from page A; page B retains the prior adventure and must not resurrect it.
 await a.evaluate(async()=>{await probe.session.load();await probe.session.start('F',true);});
 const replacement=await a.evaluate(()=>JSON.stringify(probe.session.run));
 const stale=await b.evaluate(async()=>{try{await probe.session.act({type:probe.session.run.phase==='rolled'?'move':'roll'});return {ok:true};}catch(e){return {ok:false,code:e.code};}});
 assert.equal(stale.ok,false,'old page must not revive replaced run');
 assert.equal(await b.evaluate(async()=>JSON.stringify((await probe.store.load()).run)),replacement);
 await b.evaluate(()=>probe.session.load());
 assert.equal(await b.evaluate(()=>JSON.stringify(probe.session.run)),replacement,'explicit reload resumes new adventure');
 // Simulated write refusal must preserve visible session, stored run and RNG; retry then commits once.
 const refused=await b.evaluate(async()=>{
  const before=JSON.stringify(probe.session.run),stored=JSON.stringify((await probe.store.load()).run);
  probe.rejectWrite=true;let rejected=false;try{await probe.session.act({type:'roll'});}catch{rejected=true;}
  return {rejected,before,stored,visible:JSON.stringify(probe.session.run),after:JSON.stringify((await probe.store.load()).run)};
 });
 assert.equal(refused.rejected,true);assert.equal(refused.visible,refused.before);assert.equal(refused.after,refused.stored);
 await b.evaluate(()=>probe.session.act({type:'roll'}));
 assert.equal(await b.evaluate(()=>probe.session.run.rolls),JSON.parse(replacement).rolls+1);
 await persistence.close();

 const ui=await isolated(),page=await ui.newPage();page.setDefaultTimeout(15000);
 await page.goto(base);await page.getByRole('button',{name:/金貨の商人道/}).waitFor();
 const checked=[];
 async function enlargeAndReach(label,locators){
  // Capture computed sizes before changing any element to avoid compounded inheritance.
  await page.evaluate(()=>{const all=[...document.querySelectorAll('body *')];for(const e of all)if(e.dataset.probeOriginalFont!==undefined)e.style.fontSize=e.dataset.probeOriginalFont;const sizes=all.map(e=>parseFloat(getComputedStyle(e).fontSize));all.forEach((e,i)=>{e.dataset.probeOriginalFont=e.style.fontSize;e.style.fontSize=`${sizes[i]*2}px`;});});
  for(const [width,height] of [[402,700],[874,402],[320,568]]){
   await page.setViewportSize({width,height});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${label}: horizontal overflow at ${width}`);
   for(const loc of locators){await loc.scrollIntoViewIfNeeded();await loc.click({trial:true});}
   checked.push(`${label}/${width}x${height}`);
  }
 }
 await enlargeAndReach('home-last-route',[page.getByRole('button',{name:/灯火の巡礼道/})]);
 await page.getByRole('button',{name:/金貨の商人道/}).click();
 await enlargeAndReach('board-roll',[page.getByRole('button',{name:'サイコロを振る',exact:true})]);
 await page.getByRole('button',{name:'サイコロを振る',exact:true}).click();
 const confirm=page.getByRole('button',{name:/そのまま.*マスへ/});await confirm.waitFor();
 await enlargeAndReach('rolled-confirm',[confirm]);
 await page.locator('header.masthead button.quiet').click();
 await enlargeAndReach('settings-mute-close-save',[page.locator('dialog[open] input[name=mute]'),page.locator('dialog[open] button').first(),page.locator('dialog[open] button').last()]);
 await page.locator('dialog[open] button').first().click();
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 console.log(JSON.stringify({realIndexedDBRace:'passed',oldTabReplacement:'passed',simulatedWriteRefusal:'passed',text200Percent:checked,limits:['No audible-success-cue assertion','No real disk exhaustion','No all-scene last-choice coverage','Not physical iPhone or native text-size acceptance']},null,2));
}finally{await browser.close();}
