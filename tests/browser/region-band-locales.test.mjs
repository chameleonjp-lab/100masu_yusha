import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LOCALES,loadMessages,translate} from '../../src/ui/i18n.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const content=read('../../data/adventure-content.json');
const manifest=read('../../src/locales/key-manifest.json');
const keys=content.bands.map(b=>`ui.region.bands.${b.id}.name`);
const fetcher=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url,'utf8'))});
test('English waterside banner is translated rather than fallback or raw Japanese',async()=>{
 await loadMessages('en',fetcher);
 assert.deepEqual(translate('en','ui.region.bands.2.name'),{key:'ui.region.bands.2.name',text:'Waterside Post Town',translated:true,sourceLocale:'en'});
});
for(const locale of LOCALES)test(`all five regional names are explicit and placeholder-free in ${locale}`,async()=>{
 const raw=read(`../../src/locales/messages/${locale}.json`);await loadMessages(locale,fetcher);
 for(const [i,key] of keys.entries()){
  assert.ok(Object.hasOwn(raw,key),key);assert.equal(typeof raw[key],'string');assert.ok(raw[key].trim());
  assert.equal(/[{}]/.test(raw[key]),false,'region names have no placeholders');
  assert.equal(translate(locale,key).sourceLocale,locale);
  assert.equal(translate(locale,key).text,raw[key]);
  if(locale==='ja')assert.equal(raw[key],content.bands[i].name);
  else assert.notEqual(raw[key],content.bands[i].name,'untranslated Japanese must not be labelled complete');
 }
});
test('regional key manifest has exactly five stable band-id entries',()=>{
 assert.deepEqual(manifest.keys.filter(k=>k.startsWith('ui.region.bands.')).sort(),keys);
 assert.equal(new Set(manifest.keys).size,manifest.keys.length);
});
