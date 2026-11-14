import test from 'node:test';import assert from 'node:assert/strict';
import {dispatch} from '../src/engine/index.js';
import {exampleRun,getContent,place,withSquare,walk,withScripts} from './fixtures/helpers.mjs';
const c=await getContent();
function arrive(content,id,patch={}){const b=exampleRun(content,'B'),pos=b.board.innPositions[0];return walk(content,place(withSquare(b,pos,id),pos-1,{hp:1,mp:0,...patch}),1).state;}
test('rest option selection is required, atomic, once-only and applied after ordinary rest',()=>{
 const content=withScripts(c,{events:{'B2-40':{inn:{restOptions:[{id:'feet',label:'足湯',effects:[{op:'hp',delta:2}]},{id:'hands',label:'手湯',effects:[{op:'mp',delta:2}]}]}}}});
 const s=arrive(content,'B2-40'),before=JSON.stringify(s);
 assert.throws(()=>dispatch(content,s,{type:'rest'}),/rest_choice_required/);assert.equal(JSON.stringify(s),before);
 assert.throws(()=>dispatch(content,s,{type:'rest',choiceId:'bad'}),/bad_rest_choice/);
 const feet=dispatch(content,s,{type:'rest',choiceId:'feet'}).state;assert.equal(feet.hp,23);assert.equal(feet.mp,5);
 const hands=dispatch(content,s,{type:'rest',choiceId:'hands'}).state;assert.equal(hands.hp,21);assert.equal(hands.mp,7);
 assert.throws(()=>dispatch(content,feet,{type:'rest',choiceId:'hands'}),/rest_used/);
});
test('nextTrapLoss reservation waits for the chosen positive resource loss and consumes once',()=>{
 const content=withScripts(c,{events:{'B4-41':{inn:{services:[{id:'tie',label:'結ぶ',effects:[{op:'reserve',slot:'nextTrapLoss',resource:'mp',amount:2}]}]}}}});
 let s=arrive(content,'B4-41',{mp:5});s=dispatch(content,s,{type:'service',serviceId:'tie'}).state;
 const base=place(s,9,{mp:5});base.board.squares[9]={position:10,contentId:'B3-50'};
 const landed=walk(content,base,1).state;
 const hp=dispatch(content,landed,{type:'chooseOption',optionId:'cloth'}).state;assert.equal(hp.reservations.filter(x=>x.slot==='nextTrapLoss').length,1);
 const mp=dispatch(content,landed,{type:'chooseOption',optionId:'board'}).state;assert.equal(mp.mp,4);assert.equal(mp.reservations.filter(x=>x.slot==='nextTrapLoss').length,0);
});

test('trap reservation does not discount BD16 item MP payment',()=>{
 const s=exampleRun(c,'B');s.phase='event';s.hp=30;s.mp=8;s.bag=['BD16'];
 s.reservations=[{slot:'nextTrapLoss',resource:'mp',amount:2}];
 s.event={pos:10,eventId:'B3-50',kind:'罠'};
 s.prompt={kind:'choice',top:true,options:[{id:'pay',cost:{hp:8},effects:[]}],cont:{origin:{kind:'event',pos:10,eventId:'B3-50'},vars:{},rest:[]}};
 const out=dispatch(c,s,{type:'chooseOption',optionId:'pay',itemId:'BD16',params:{mp:4}}).state;
 assert.equal(out.mp,4);assert.equal(out.hp,30);assert.equal(out.reservations.filter(x=>x.slot==='nextTrapLoss').length,1);
});

test('targetTrapHalf halves both trap resources without consuming on the first resource',()=>{
 const s=exampleRun(c,'B');s.phase='event';s.pos=10;s.hp=30;s.mp=8;
 s.reservations=[{rid:'half',slot:'targetTrapHalf',pos:10,withinMoves:3,movesUsed:1}];
 s.event={pos:10,eventId:'B3-50',kind:'罠'};
 s.prompt={kind:'choice',top:true,options:[{id:'pay',cost:{hp:7,mp:5},effects:[]}],cont:{origin:{kind:'event',pos:10,eventId:'B3-50'},vars:{},rest:[]}};
 const out=dispatch(c,s,{type:'chooseOption',optionId:'pay'}).state;
 assert.equal(out.hp,26);assert.equal(out.mp,5);assert.equal(out.reservations.some(r=>r.rid==='half'),true);
});
