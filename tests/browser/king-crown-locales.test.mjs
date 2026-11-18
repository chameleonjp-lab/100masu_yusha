import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadMessages,translate,LOCALES} from '../../src/ui/i18n.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const keys=['ui.king.crownBreak','ui.king.crownNextTurn','ui.king.defeated'];
test('crown and defeat copy comes directly from all 15 localized catalogs',async()=>{
 const manifest=read('../../src/locales/key-manifest.json');
 assert.equal(LOCALES.length,15);
 for(const key of keys)assert.equal(manifest.keys.filter(k=>k===key).length,1,key);
 for(const lang of LOCALES){
  const catalog=read(`../../src/locales/messages/${lang}.json`);
  await loadMessages(lang,async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url,'utf8'))}));
  for(const key of keys){
   const value=translate(lang,key),label=`${lang}:${key}`;
   assert.ok(value.text&&!value.text.startsWith('['),label);
   assert.equal(value.text,catalog[key],label);
   assert.equal(value.sourceLocale,lang,label);
   assert.equal(value.translated,true,label);
  }
 }
});
