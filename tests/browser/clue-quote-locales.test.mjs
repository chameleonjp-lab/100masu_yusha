import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LOCALES} from '../../src/ui/i18n.js';
for(const locale of LOCALES)test(`${locale}: clue quotations occur verbatim in displayed scene and correct choice`,async()=>{
 const messages=JSON.parse(await readFile(new URL(`../../src/locales/messages/${locale}.json`,import.meta.url),'utf8'));
 for(const id of ['F1-15','F1-19']){
  const prefix=`scripts.events.${id}.`;
  assert.ok(messages[`events.${id}.scene`].includes(messages[prefix+'puzzle.cluePair.scene']),`${id}: scene quote`);
  assert.ok(messages[prefix+'options.0.label'].includes(messages[prefix+'puzzle.cluePair.option']),`${id}: correct choice quote`);
 }
});
