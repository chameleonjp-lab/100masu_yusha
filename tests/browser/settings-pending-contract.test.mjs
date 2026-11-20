import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {resolveLocale,loadMessages} from '../../src/ui/i18n.js';
const source=fs.readFileSync(new URL('../../src/ui/app.js',import.meta.url),'utf8');
const start=source.indexOf(' if(pending||session.busy||!d.open||!d.isConnected)return;');
const end=source.indexOf('}finally{pending=false}',start);assert.ok(start>0&&end>start);
const body=source.slice(start,end+'}finally{pending=false}'.length);
const selectorSetup=source.match(/(language\.value=[^;]+);d\.append\(add\(el\('label','input-row'\),el\('span','',tr\('ui\.language'\)\),language\)\);/)?.[1];
assert.ok(selectorSetup);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function harness(boot=null, overwriteLanguage){const save=deferred(),dictionary=deferred(),calls=[],errors=[];let renders=0;const audio=[];const close={disabled:false},controls=[close,{disabled:false}],values={mute:{checked:true},masterVolume:{value:'0'},bgmVolume:{value:'0'},seVolume:{value:'0'}};const d={open:true,isConnected:true,querySelector:s=>values[s.match(/name=(\w+)/)[1]],querySelectorAll:()=>controls,close(){this.open=false}};const language={value:'fr'},select={value:'short'},reducedCheck={checked:true};const session=boot?.session??{};session.settings=async snapshot=>{calls.push(['save',snapshot]);await save.promise;session.meta={...session.meta,settings:{...session.meta?.settings,...snapshot}}};const loadMessages=async lang=>{calls.push(['locale',lang]);await dictionary.promise};const initialFallback=boot?.fallback()??null, initialSettings=session.meta?.settings??{},locale=()=>initialFallback||initialSettings.language||'fr',navigator={languages:['fr']};
const preferredLanguage=resolveLocale(initialSettings.language,navigator.languages);
if(boot)new Function('language','locale','preferredLanguage',selectorSetup)(language,locale,preferredLanguage);
if(overwriteLanguage)language.value=overwriteLanguage;
const setFallback=value=>{if(boot)boot.setFallback(value)};
const make=new Function('session','d','close','language','select','reducedCheck','loadMessages','render','showError','sound','setFallback','fallbackLocale','preferredLanguage',`let pending=false;return async()=>{${body}}`);return {run:make(session,d,close,language,select,reducedCheck,loadMessages,()=>renders++,e=>errors.push(e),{configure:x=>audio.push(x)},setFallback,initialFallback,preferredLanguage),audio,save,dictionary,calls,errors,d,language,select,controls,close,renders:()=>renders};}
test('failed dictionary must not overwrite the known-good settings',async()=>{const h=harness(),p=h.run();h.save.resolve();h.dictionary.reject(Error('dictionary'));await p;assert.deepEqual(h.calls,[['locale','fr']]);assert.equal(h.errors.length,1);assert.equal(h.renders(),0)});
test('close during dictionary wait cancels without saving or rendering',async()=>{const h=harness(),p=h.run();h.save.resolve();h.d.close();h.dictionary.resolve();await p;assert.deepEqual(h.calls,[['locale','fr']]);assert.equal(h.renders(),0)});
test('snapshot freezes picks and zero/mute, ignores duplicates, then commits exactly once',async()=>{const h=harness(),p=h.run();h.language.value='en';h.select.value='standard';await h.run();assert.deepEqual(h.calls,[['locale','fr']]);assert.equal(h.close.disabled,false);assert.equal(h.controls[1].disabled,true);h.dictionary.resolve();await new Promise(r=>setImmediate(r));await h.run();assert.equal(h.calls.length,2);assert.deepEqual(h.calls[1][1],{language:'fr',animation:'short',reducedMotion:true,mute:true,masterVolume:0,bgmVolume:0,seVolume:0});assert.equal(Object.isFrozen(h.calls[1][1]),true);h.save.resolve();await p;assert.equal(h.renders(),1)});
test('failed save leaves the dialog error recoverable and never renders the new choice',async()=>{const h=harness(),p=h.run();h.dictionary.resolve();h.save.reject(Error('save'));await p;assert.deepEqual(h.calls.map(c=>c[0]),['locale','save']);assert.equal(h.errors.length,1);assert.equal(h.renders(),0)});
test('a completed save applies mute even if the dialog closes during the transaction',async()=>{const h=harness(),p=h.run();h.dictionary.resolve();await new Promise(r=>setImmediate(r));h.d.close();h.save.resolve();await p;assert.equal(h.audio.length,1);assert.equal(h.audio[0].mute,true);assert.equal(h.audio[0].masterVolume,0);assert.equal(h.renders(),0);assert.equal(h.errors.length,0)});
function bootHarness(fail, savedLanguage='fr'){let renders=0,errors=[],requests=[];const boot=source.split('\n').find(l=>l.startsWith('try{content=await loadContentInBrowser('));assert.ok(boot);const go=new Function('loadContentInBrowser','createSession','createIndexedDbStore','loadMessages','locale','render','root','heading','paragraph','msg','setFallback',`return async()=>{let content,session; ${boot}}`);const session={load:async()=>{},meta:{settings:savedLanguage?{language:savedLanguage}:{},bests:{all:{score:123}}},run:{runId:'fictional'}};let fallback=null;return{run:go(async()=>({}),()=>session,()=>({}),async lang=>{requests.push(lang);if(fail.includes(lang))throw Error('locale_load_'+lang)},()=>fallback||session.meta.settings.language||'fr',()=>renders++,{replaceChildren(...ui){errors.push(ui)}},x=>x,x=>x,x=>x,x=>fallback=x),session,errors,requests,renders:()=>renders,fallback:()=>fallback,setFallback:value=>fallback=value}}
test('missing previously saved locale boots with Japanese without overwriting locale',async()=>{const h=bootHarness(['fr']);await h.run();assert.deepEqual(h.requests,['fr','ja']);assert.equal(h.session.meta.settings.language,'fr');assert.equal(h.fallback(),'ja');assert.equal(h.errors.length,0);assert.equal(h.renders(),1)});
test('mandatory dictionaries unavailable still gives the explicit startup error',async()=>{const h=bootHarness(['fr','ja']);await h.run();assert.equal(h.errors.length,1);assert.equal(h.renders(),0)});

test('Japanese starts when only the optional English dictionary is unavailable',async()=>{const requested=[];await loadMessages('ja',async url=>{const code=url.pathname.split('/').pop();requested.push(code);return code==='en.json'?{ok:false}:{ok:true,json:async()=>({'ui.settings':'設定'})}});assert.deepEqual(requested,['ja.json','en.json'])});
test('selected English dictionary is mandatory and cannot be silently saved',async()=>{await assert.rejects(loadMessages('en',async url=>url.pathname.endsWith('/en.json')?{ok:false}:{ok:true,json:async()=>({'ui.settings':'設定'})}),/locale_load_en/)});

test('temporary Japanese display preserves French after saving only audio, then French returns when its dictionary recovers',async()=>{
 const boot=bootHarness(['fr']);await boot.run();
 const before=structuredClone({bests:boot.session.meta.bests,run:boot.session.run});
 const h=harness(boot);h.dictionary.resolve();h.save.resolve();await h.run();
 assert.equal(boot.session.meta.settings.language,'fr');
 assert.deepEqual(h.calls.map(c=>c[0]),['save']);
 assert.equal(Object.hasOwn(h.calls[0][1],'language'),false);
 assert.equal(boot.session.meta.settings.mute,true);
 assert.equal(boot.session.meta.settings.masterVolume,0);
 assert.equal(boot.fallback(),'ja');
 assert.deepEqual({bests:boot.session.meta.bests,run:boot.session.run},before);
 const recovered=bootHarness([],boot.session.meta.settings.language);
 await recovered.run();assert.deepEqual(recovered.requests,['fr']);assert.equal(recovered.fallback(),null);
});
test('explicitly selecting Japanese from fallback validates and saves it',async()=>{
 const boot=bootHarness(['fr']);await boot.run();
 const h=harness(boot,'ja');h.dictionary.resolve();h.save.resolve();await h.run();
 assert.deepEqual(h.calls.map(c=>c[0]),['locale','save']);
 assert.equal(h.calls[0][1],'ja');assert.equal(boot.session.meta.settings.language,'ja');assert.equal(boot.fallback(),null);
});
test('a new language lookup failure during fallback prevents the settings update',async()=>{
 const boot=bootHarness(['fr']);await boot.run();
 const h=harness(boot,'en');h.dictionary.reject(Error('locale_load_en'));h.save.resolve();await h.run();
 assert.deepEqual(h.calls,[['locale','en']]);assert.equal(h.errors.length,1);
 assert.equal(boot.session.meta.settings.language,'fr');assert.equal(boot.fallback(),'ja');
});
test('saving audio in temporary Japanese does not create a language preference for browser-default French',async()=>{
 const boot=bootHarness(['fr'],null);await boot.run();
 const h=harness(boot);h.dictionary.resolve();h.save.resolve();await h.run();
 assert.equal(Object.hasOwn(boot.session.meta.settings,'language'),false);
 assert.equal(boot.fallback(),'ja');
});
