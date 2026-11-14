// Node-only projection checks, not DOM/iPhone or full linguistic acceptance.
// Real content samples: matching, sequence, choice, numeric, comparison, direct-gold branch,
// patched EN12 combat, public clue hint and JSON-restored states. No external requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getContent,exampleRun,landOnEvent} from '../fixtures/helpers.mjs';
import {dispatch,view} from '../../src/engine/index.js';
import {LOCALES,installMessages,setMessageLocale,localizedView,localizedContent} from '../../src/ui/i18n.js';
const content=await getContent();
for(const locale of LOCALES)installMessages(locale,JSON.parse(await readFile(new URL(`../../src/locales/messages/${locale}.json`,import.meta.url),'utf8')));
const displayFields=new Set(['name','scene','action','result','effect','timing','limit','text','tell','response','summary','tradeoff','triggerText','line','label','title','prompt','description','reasonText','unit']);
// Every key, array position and non-display scalar must survive the projection unchanged.
function invariant(raw,projected,path=''){
 if(raw===null||typeof raw!=='object'){
  const key=path.split('.').at(-1);
  const display=displayFields.has(key)||path.includes('.labels.')||path.endsWith('.hints.0.option');
  if(typeof raw==='string'&&display)assert.equal(typeof projected,'string',path);
  else assert.deepEqual(projected,raw,path);
  return;
 }
 assert.equal(Array.isArray(projected),Array.isArray(raw),path);
 assert.deepEqual(Object.keys(projected),Object.keys(raw),path+' keys');
 for(const key of Object.keys(raw))invariant(raw[key],projected[key],path?`${path}.${key}`:key);
}
const ids=['M1-01','M1-02','F1-15','F1-19','M3-08','M5-15','M1-42','B4-27'];
const samples=ids.map(id=>({id,state:landOnEvent(content,exampleRun(content,id[0]),id,{patch:{bag:['BD33']}}).state}));
const hinted=samples.find(x=>x.id==='F1-19');
samples.push({id:'F1-19-hint',state:dispatch(content,hinted.state,{type:'useItem',itemId:'BD33'}).state});
for(const locale of LOCALES)test(`${locale}: real projections preserve gameplay payload, sanitized puzzles and restored state`,()=>{
 const contentBefore=JSON.stringify(content);
 setMessageLocale(locale);
 try{
  const projected=localizedContent(content,locale);
  // Private answer/rules remain untouched in the content model; never project that model as public UI.
  for(const id of ids){
   const raw=content.scripts.events[id],translated=projected.scripts.events[id];
   invariant(raw,translated,`scripts.events.${id}`);
   assert.deepEqual(translated.puzzle?.answer,raw.puzzle?.answer,`${id}: hidden answer mutated`);
   assert.deepEqual(translated.puzzle?.onCorrect,raw.puzzle?.onCorrect,`${id}: hidden reward mutated`);
   invariant(content.events[id],projected.events[id],`events.${id}`);
  }
  for(const {id,state} of samples){
   const before=JSON.stringify(state),restored=JSON.parse(before);
   const publicView=view(content,restored),beforeView=JSON.stringify(publicView);
   const out=localizedView(publicView,content,locale);
   invariant(publicView,out,id);
   if(publicView.event?.puzzle){
    for(const secret of ['answer','onCorrect','onWrong','differences','cluePair'])assert.equal(Object.hasOwn(out.event.puzzle,secret),false,`${id}: leaked ${secret}`);
    assert.equal(out.event.result,null,`${id}: hidden outcome exposed`);
    // Sanitized action may be translated, but must not be replaced by original answer-bearing prose.
    const rawAction=publicView.event.action;
    if(rawAction!==content.events[publicView.event.id].action){
     const original=projected.events[publicView.event.id].action;
     assert.notEqual(out.event.action,original,`${id}: original action reintroduced`);
    }
   }
   assert.equal(JSON.stringify(publicView),beforeView,`${id}: source view mutated`);
   assert.equal(JSON.stringify(restored),before,`${id}: restored run mutated`);
   assert.equal(JSON.stringify(state),before,`${id}: saved source mutated`);
  }
  assert.equal(JSON.stringify(content),contentBefore,'source content mutated');
 }finally{setMessageLocale('ja');}
});
