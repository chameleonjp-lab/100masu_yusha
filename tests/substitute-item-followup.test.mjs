import test from 'node:test';import assert from 'node:assert/strict';
import {dispatch} from '../src/engine/index.js';import {getContent,exampleRun,landOnEvent,withScripts} from './fixtures/helpers.mjs';
const content=await getContent();
function setup(c=content){const r=landOnEvent(c,exampleRun(c,'F'),'F4-13');r.state.bag=['BD36','HE32'];return r.state;}
test('BD36 replaces specified consumable by same band/category equal or dearer item once',()=>{const s=setup();const r=dispatch(content,s,{type:'chooseOption',optionId:'donate',itemId:'BD36',params:{substituteId:'HE32'}});assert.deepEqual(r.state.bag,[]);assert.ok(r.effects.some(e=>e.t==='gearGained'&&e.id==='SW40'));assert.throws(()=>dispatch(content,r.state,{type:'chooseOption',optionId:'donate',itemId:'BD36',params:{substituteId:'HE32'}}));});
test('BD36 rejects invalid substitute without changing original run',()=>{for(const id of ['HE31','HE21','AT32','missing']){let s=setup();s.bag=['BD36',id];const before=JSON.stringify(s);assert.throws(()=>dispatch(content,s,{type:'chooseOption',optionId:'donate',itemId:'BD36',params:{substituteId:id}}));assert.equal(JSON.stringify(s),before);}});
test('BD36 refuses cash reward and purchases',()=>{for(const extra of [{effects:[{op:'awardGold',amount:1}]},{cost:{items:['HE31'],gold:1}}]){const original=content.scripts.events['F4-13'];const c=withScripts(content,{events:{'F4-13':{...original,options:original.options.map(o=>o.id==='donate'?{...o,...extra}:o)}}});const s=setup(c);assert.throws(()=>dispatch(c,s,{type:'chooseOption',optionId:'donate',itemId:'BD36',params:{substituteId:'HE32'}}));assert.deepEqual(s.bag,['BD36','HE32']);}});
test('BD36 rejects a cheaper substitute, nested cash reward and standalone use',()=>{
 const original=content.scripts.events['F4-13'];
 const c=withScripts(content,{events:{'F4-13':{...original,options:original.options.map(o=>o.id==='donate'?{...o,cost:{items:['HE32']}}:o)}}});
 let s=setup(c);s.bag=['BD36','HE31'];assert.throws(()=>dispatch(c,s,{type:'chooseOption',optionId:'donate',itemId:'BD36',params:{substituteId:'HE31'}}));
 s=setup();assert.throws(()=>dispatch(content,s,{type:'useItem',itemId:'BD36',params:{substituteId:'HE32'}}));
 const cash=withScripts(content,{events:{'F4-13':{...original,options:original.options.map(o=>o.id==='donate'?{...o,effects:[{op:'if',cond:true,then:[{op:'awardGold',amount:1}]}]}:o)}}});
 assert.throws(()=>dispatch(cash,setup(cash),{type:'chooseOption',optionId:'donate',itemId:'BD36',params:{substituteId:'HE32'}}));
});
