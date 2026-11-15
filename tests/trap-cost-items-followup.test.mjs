import test from 'node:test';import assert from 'node:assert/strict';
import {dispatch} from '../src/engine/index.js';
import {getContent,exampleRun,withScripts} from './fixtures/helpers.mjs';
const base=await getContent();const items={};for(const [id,mode]of [['BD19','paidHeal'],['BD20','replaceItem'],['BD25','discountGold']])items[id]={uses:[{where:['trapChoice'],effects:[{op:'trapItem',mode}]}]};
const c=withScripts(base,{items});
function state(cost){const s=exampleRun(c,'B');s.phase='event';s.hp=10;s.gold=100;s.bag=['BD19','BD20','BD25','HE01','AT01'];s.event={pos:10,eventId:'B3-50',kind:'罠'};s.prompt={kind:'choice',top:true,options:[{id:'pay',cost,effects:[]}],cont:{origin:{kind:'event',pos:10,eventId:'B3-50'},vars:{},rest:[]}};return s;}
const use=(s,itemId)=>dispatch(c,s,{type:'chooseOption',optionId:'pay',itemId}).state;
test('BD19 pays full toll then restores nine, zero toll and unaffordable payment stay atomic',()=>{
 const s=state({gold:70}),out=use(s,'BD19');assert.equal(out.gold,30);assert.equal(out.hp,19);assert.equal(out.bag.includes('BD19'),false);
 for(const gold of [0,101]){const bad=state({gold}),before=JSON.stringify(bad);assert.throws(()=>use(bad,'BD19'));assert.equal(JSON.stringify(bad),before);}
});
test('BD20 replaces only one item loss and heals five, not trade/shop payment',()=>{
 const s=state({items:['HE01','AT01']}),out=use(s,'BD20');assert.equal(out.bag.includes('HE01'),true);assert.equal(out.bag.includes('AT01'),false);assert.equal(out.bag.includes('BD20'),false);assert.equal(out.hp,15);
 s.event.kind='選択';assert.throws(()=>use(s,'BD20'));
});
test('BD25 discounts at most 110 with no change and requires affordable remainder',()=>{
 assert.equal(use(state({gold:70}),'BD25').gold,100);assert.equal(use(state({gold:180}),'BD25').gold,30);
 const s=state({gold:211}),before=JSON.stringify(s);assert.throws(()=>use(s,'BD25'));assert.equal(JSON.stringify(s),before);
});
