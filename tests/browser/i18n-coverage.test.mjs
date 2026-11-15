import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installMessages,missingMessages} from '../../src/ui/i18n.js';
import {auditTranslation} from '../../src/locales/audit.js';
test('settings coverage excludes originally empty optional display fields',async()=>{
 const ja=JSON.parse(await readFile(new URL('../../src/locales/messages/ja.json',import.meta.url),'utf8'));
 const fr=JSON.parse(await readFile(new URL('../../src/locales/messages/fr.json',import.meta.url),'utf8'));
 installMessages('ja',ja);installMessages('fr',fr);
 const structural=auditTranslation(ja,fr),ui=missingMessages('fr');
 assert.equal(structural.emptySource.length,16);
 assert.equal(ui.total,structural.required);
 assert.equal(ui.translated,structural.valid);
 assert.equal(ui.complete,true);assert.deepEqual(ui.missing,[]);
});
test('settings coverage still counts missing nonempty source as untranslated',()=>{
 installMessages('ja',{'coverage.regression.required':'表示が必要','coverage.regression.optional':'  '});
 const ui=missingMessages('fr');
 assert.ok(ui.missing.includes('coverage.regression.required'));
 assert.ok(!ui.missing.includes('coverage.regression.optional'));
 assert.equal(ui.complete,false);
});
