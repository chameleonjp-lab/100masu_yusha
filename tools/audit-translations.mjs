import {readFile} from 'node:fs/promises';import {auditTranslation} from '../src/locales/audit.js';
const source=JSON.parse(await readFile(new URL('../src/locales/messages/ja.json',import.meta.url),'utf8'));
const locales=['en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'];
let complete=true;
for(const locale of locales){
 const target=JSON.parse(await readFile(new URL(`../src/locales/messages/${locale}.json`,import.meta.url),'utf8')),audit=auditTranslation(source,target);
 const {missing,stale,blank,placeholderMismatch,sameAsSource,emptySource,...counts}=audit;
 console.log(JSON.stringify({locale,...counts,missing:missing.length,stale,blank,placeholderMismatch,sameAsSource:sameAsSource.length,emptySource:emptySource.length}));
 complete&&=audit.complete;
}
// Missing translation is a release gate, not a reason to block local development tests.
if(process.argv.includes('--strict')&&!complete)process.exitCode=1;
