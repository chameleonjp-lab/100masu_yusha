import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {loadMessages,translate,LOCALES} from '../../src/ui/i18n.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const keys=['ui.king.crownBreak','ui.king.crownNextTurn'];
test('new crown copy is keyed with honest English fallback for untranslated locales',async()=>{const manifest=read('../../src/locales/key-manifest.json');for(const key of keys)assert.ok(manifest.keys.includes(key));for(const lang of LOCALES){await loadMessages(lang,async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url,'utf8'))}));for(const key of keys){const value=translate(lang,key);assert.ok(value.text&&!value.text.startsWith('['));assert.equal(value.sourceLocale,['ja','en','fr'].includes(lang)?lang:'en');assert.equal(value.translated,['ja','en','fr'].includes(lang));}}});
