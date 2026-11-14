// Real B3-09 transitions protect the semantic receipt projection, not the DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getContent,exampleRun,landOnEvent} from './fixtures/helpers.mjs';
import {dispatch,view} from '../src/engine/index.js';
import {LOCALES,installMessages,setMessageLocale,localizedView,localizedContent} from '../src/ui/i18n.js';
import {actionLabel} from '../src/ui/presentation.js';
import {catalogs} from '../src/locales/catalogs.js';
const content=await getContent();
const titleKey='ui.receipt.gearTitle',confirmKey='ui.receipt.confirmGear';
// Hand-authored expected messages, independent of the production dictionaries.
const expected={
 ja:['{name}を受け取ります','装備の受け取りを確定'],
 en:['You will receive {name}','Confirm equipment receipt'],
 es:['Recibirás {name}','Confirmar la recepción del equipo'],
 'pt-BR':['Você receberá {name}','Confirmar o recebimento do equipamento'],
 'zh-Hans':['你将获得{name}','确认领取装备'],
 fr:['Vous allez recevoir {name}',"Confirmer la réception de l’équipement"],
 de:['Du erhältst {name}','Erhalt der Ausrüstung bestätigen'],
 ko:['{name}을(를) 받습니다','장비 수령 확정'],
 ru:['Вы получите {name}','Подтвердить получение снаряжения'],
 it:['Riceverai {name}',"Conferma la ricezione dell’equipaggiamento"],
 'zh-Hant':['你將獲得{name}','確認領取裝備'],
 id:['Kamu akan menerima {name}','Konfirmasi penerimaan perlengkapan'],
 tr:['{name} alacaksınız','Ekipman teslim alımını onayla'],
 vi:['Bạn sẽ nhận được {name}','Xác nhận nhận trang bị'],
 th:['คุณจะได้รับ {name}','ยืนยันการรับอุปกรณ์']
};
const dictionaries={};
for(const locale of LOCALES){dictionaries[locale]=JSON.parse(await readFile(new URL(`../src/locales/messages/${locale}.json`,import.meta.url),'utf8'));installMessages(locale,dictionaries[locale]);}
const clone=x=>structuredClone(x);
function freeze(x){if(x&&typeof x==='object'){Object.freeze(x);for(const value of Object.values(x))freeze(value);}return x;}
function receipt(die=1,id='AR23',bag=['BD28']){
 const source=landOnEvent(content,exampleRun(content,'B'),'B3-09',{die,patch:{bag}}).state;
 const input=freeze({type:'chooseOption',optionId:id,opId:`receipt-${die}-${id}`});
 const before=clone(source),inputBefore=clone(input);
 const transition=dispatch(content,freeze(source),input);
 assert.deepEqual(source,before);assert.deepEqual(input,inputBefore);
 return {source,state:transition.state,transition};
}
for(const [die,enabled] of [[1,['AR23','AR24']],[2,['AR24','AR25']]]){
 test(`B3-09 die${die}: choice IDs and allowed armor stay unchanged`,()=>{
  const s=landOnEvent(content,exampleRun(content,'B'),'B3-09',{die,patch:{bag:['BD28']}}).state;
  const raw=view(content,s),before=clone(raw);
  assert.deepEqual(raw.actions.filter(a=>a.enabled).map(a=>a.optionId),enabled);
  for(const locale of LOCALES){const projected=localizedView(freeze(raw),content,locale);assert.deepEqual(projected.actions.map(a=>[a.optionId,a.label,a.enabled,a.input,a.cost]),raw.actions.map(a=>[a.optionId,a.label,a.enabled,a.input,a.cost]));}
  assert.deepEqual(raw,before);
 });
 for(const id of enabled)for(const locale of LOCALES){
  // Break caught: either semantic binding removed, wrong gear interpolation,
  // payload mutation, early BD28 consumption, or receipt behavior changed.
  test(`B3-09 die${die} ${id} ${locale}: localized receipt preserves both confirmation branches`,()=>{
   setMessageLocale(locale);
   const {source,state}=receipt(die,id),stateBefore=clone(state),contentBefore=JSON.stringify(content);
   assert.equal(state.prompt.kind,'gearConfirm');assert.deepEqual(state.gear,source.gear);assert.deepEqual(state.bag,['BD28']);
   const raw=freeze(view(content,freeze(state))),rawBefore=clone(raw);
   const projected=localizedView(raw,content,locale),name=dictionaries[locale][`gear.${id}.name`];
   assert.equal(projected.prompt.gear.name,name);
   assert.equal(projected.prompt.title,expected[locale][0].replace('{name}',name));
   const rawAction=raw.actions.find(a=>a.type==='confirmGear'),action=projected.actions.find(a=>a.type==='confirmGear');
   assert.equal(actionLabel(action,localizedContent(content,locale)),expected[locale][1]);
   const {label:rawLabel,...rawPayload}=rawAction,{label:displayLabel,...displayPayload}=action;
   assert.deepEqual(displayPayload,rawPayload);assert.ok(action.itemOptions.some(a=>a.itemId==='BD28'));
   assert.deepEqual(localizedView(projected,content,locale),projected,'same-locale reprojection is safe');
   for(const useItem of [false,true]){
    const input=freeze({...action,...(useItem?{itemId:'BD28'}:{}),opId:`confirm-${useItem}`}),inputBefore=clone(input);
    const originalInput=freeze({...rawAction,...(useItem?{itemId:'BD28'}:{}),opId:`confirm-${useItem}`});
    const actual=dispatch(content,state,input),baseline=dispatch(content,state,originalInput);
    assert.deepEqual(actual,baseline,'raw/localized actions have identical state and effects');
    assert.deepEqual(input,inputBefore);assert.equal(actual.state.gear.filter(g=>g.id===id).length,1);
    assert.equal(actual.state.prompt,null);assert.equal(actual.state.phase,'board');
    assert.deepEqual(actual.state.bag,useItem?[]:['BD28']);assert.equal(actual.state.reservations.length,useItem?1:0);
    assert.equal(actual.effects.filter(f=>f.t==='itemUsed'&&f.id==='BD28').length,useItem?1:0);
   }
   const empty=receipt(die,id,[]).state;assert.equal(empty.prompt,null);assert.equal(empty.phase,'board');assert.ok(empty.gear.some(g=>g.id===id));
   const emptyView=localizedView(view(content,empty),content,locale);assert.ok(!emptyView.actions.some(a=>a.type==='confirmGear'));
   assert.ok(actionLabel(emptyView.actions.find(a=>a.type==='equip'&&a.id===id),localizedContent(content,locale)).includes(name));
   assert.deepEqual(raw,rawBefore);assert.deepEqual(state,stateBefore);assert.equal(JSON.stringify(content),contentBefore);
  });
 }
}
function sample(){return view(content,receipt().state);}
function withCatalogs(change,body){const saved=Object.fromEntries(LOCALES.map(l=>[l,{...catalogs[l]}]));try{change();body();}finally{for(const l of LOCALES)catalogs[l]=saved[l];}}
// Break caught: fallback order reversed or unresolved key/placeholder leaked.
test('receipt keys fall back from missing locale to English',()=>withCatalogs(()=>{delete catalogs.fr[titleKey];delete catalogs.fr[confirmKey];},()=>{
 const raw=sample(),v=localizedView(raw,content,'fr');assert.equal(v.prompt.title,`You will receive ${dictionaries.fr['gear.AR23.name']}`);assert.equal(v.actions[0].label,'Confirm equipment receipt');
}));
test('receipt keys fall back to Japanese when locale and English are absent',()=>withCatalogs(()=>{for(const l of ['fr','en']){delete catalogs[l][titleKey];delete catalogs[l][confirmKey];}},()=>{
 const v=localizedView(sample(),content,'fr');assert.equal(v.prompt.title,`${dictionaries.fr['gear.AR23.name']}を受け取ります`);assert.equal(v.actions[0].label,'装備の受け取りを確定');
}));
test('all receipt keys absent preserves original messages, not raw keys',()=>withCatalogs(()=>{for(const l of ['fr','en','ja']){delete catalogs[l][titleKey];delete catalogs[l][confirmKey];}},()=>{
 const raw=sample(),v=localizedView(raw,content,'fr');assert.equal(v.prompt.title,raw.prompt.title);assert.equal(v.actions[0].label,raw.actions[0].label);
}));
test('missing gear-name translations use the known source name safely',()=>withCatalogs(()=>{for(const l of ['fr','en','ja'])delete catalogs[l]['gear.AR23.name'];},()=>{
 const v=localizedView(sample(),content,'fr');assert.equal(v.prompt.title,'Vous allez recevoir ふいごの上着');assert.equal(v.prompt.gear.name,'ふいごの上着');
}));
test('blank or malformed receipt templates preserve the original field',()=>withCatalogs(()=>{catalogs.fr[titleKey]='{wrong}';catalogs.fr[confirmKey]=' ';},()=>{
 const raw=sample(),v=localizedView(raw,content,'fr');assert.equal(v.prompt.title,raw.prompt.title);assert.equal(v.actions[0].label,raw.actions[0].label);
}));
test('partial dictionary independently falls back for only the missing receipt key',()=>withCatalogs(()=>{delete catalogs.fr[confirmKey];},()=>{
 const v=localizedView(sample(),content,'fr');assert.equal(v.prompt.title,`Vous allez recevoir ${dictionaries.fr['gear.AR23.name']}`);assert.equal(v.actions[0].label,'Confirm equipment receipt');
}));
test('unknown locale uses English receipt fallback',()=>{
 const v=localizedView(sample(),content,'unknown');assert.equal(v.prompt.title,`You will receive ${dictionaries.en['gear.AR23.name']}`);assert.equal(v.actions[0].label,'Confirm equipment receipt');
});
for(const [name,change] of [
 ['custom heading',v=>{v.prompt.title='Custom receipt title';}],
 ['custom label',v=>{v.actions[0].label='Custom receipt label';}],
 ['unknown gear',v=>{v.prompt.gearId='AR999';v.prompt.gear.id='AR999';}],
 ['mismatched gear identity',v=>{v.prompt.gear.id='AR24';}],
 ['unrelated prompt kind',v=>{v.prompt.kind='custom';}],
 ['unrelated action type',v=>{v.actions[0].type='custom';}]
])test(`receipt semantic guard preserves ${name}`,()=>{
 const raw=sample();change(raw);const before=clone(raw),v=localizedView(freeze(raw),content,'en');
 if(name!=='custom label'&&name!=='unrelated action type')assert.equal(v.prompt.title,raw.prompt.title);
 if(name!=='custom heading')assert.equal(v.actions[0].label,raw.actions[0].label);
 assert.deepEqual(raw,before);
});
test('unrelated and nested lookalike strings are not receipt messages',()=>{
 const raw=sample();raw.other={title:raw.prompt.title,label:raw.actions[0].label,type:'confirmGear'};
 const v=localizedView(freeze(raw),content,'en');assert.deepEqual(v.other,raw.other);
 assert.equal(localizedView(null,content,'en'),null);
});
test('real B3-09 English confirmation label does not remain Japanese even before heading assertion',()=>{
 setMessageLocale('en');const projected=localizedView(sample(),content,'en');
 assert.equal(actionLabel(projected.actions.find(a=>a.type==='confirmGear'),localizedContent(content,'en')),'Confirm equipment receipt');
});
