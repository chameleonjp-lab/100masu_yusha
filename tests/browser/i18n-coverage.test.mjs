import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installMessages,LOCALES,missingMessages} from '../../src/ui/i18n.js';
import {auditTranslation} from '../../src/locales/audit.js';
const read=async locale=>JSON.parse(await readFile(new URL(`../../src/locales/messages/${locale}.json`,import.meta.url),'utf8'));
test('all supported locales cover every required source entry, not originally empty display fields',async()=>{
 const ja=await read('ja');
 installMessages('ja',ja);
 for(const locale of LOCALES.filter(code=>code!=='ja')){
  const catalog=await read(locale),structural=auditTranslation(ja,catalog);
  installMessages(locale,catalog);
  const ui=missingMessages(locale);
  assert.equal(structural.emptySource.length,16,locale);
  assert.equal(ui.total,structural.required,locale);
  assert.equal(ui.translated,structural.valid,locale);
  assert.deepEqual(structural.missing,[],locale);
  assert.equal(structural.complete,true,locale);
  assert.equal(ui.complete,true,locale);
  assert.deepEqual(ui.missing,[],locale);
 }
});
test('settings coverage still counts missing nonempty source as untranslated',()=>{
 installMessages('ja',{'coverage.regression.required':'表示が必要','coverage.regression.optional':'  '});
 const ui=missingMessages('fr');
 assert.ok(ui.missing.includes('coverage.regression.required'));
 assert.ok(!ui.missing.includes('coverage.regression.optional'));
 assert.equal(ui.complete,false);
});
