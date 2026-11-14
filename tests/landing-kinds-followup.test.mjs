import test from 'node:test';import assert from 'node:assert/strict';
import {makeCtx} from '../src/engine/core.js';import {startLandingKinds,recordLandingKind,finishLandingKinds} from '../src/engine/landing-kind-items.js';
import {getContent,exampleRun} from './fixtures/helpers.mjs';const c=await getContent();
function ctx(){const s=exampleRun(c);s.hp=1;s.mp=0;return makeCtx(c,s);}
test('BD37 waits for third distinct event completion and survives JSON reload',()=>{let x=ctx();startLandingKinds(x);for(const [p,k] of [[2,'道具'],[3,'罠']]){x.s.pos=p;recordLandingKind(x,p,k);finishLandingKinds(x);assert.equal(x.s.hp,1);}x.s=JSON.parse(JSON.stringify(x.s));x.s.pos=4;recordLandingKind(x,4,'宿場');assert.equal(x.s.hp,1);finishLandingKinds(x);assert.equal(x.s.hp,11);assert.equal(x.s.mp,4);finishLandingKinds(x);assert.equal(x.s.hp,11);});
test('BD37 duplicates cancel, 1/100 do not count, and death never heals',()=>{let x=ctx();startLandingKinds(x);recordLandingKind(x,1,'道具');recordLandingKind(x,100,'魔王');assert.equal(x.s.flags.bd37.kinds.length,0);recordLandingKind(x,2,'道具');recordLandingKind(x,3,'道具');assert.equal(x.s.flags.bd37,undefined);x=ctx();startLandingKinds(x);for(const [p,k]of [[2,'道具'],[3,'罠'],[4,'戦闘']]){x.s.pos=p;recordLandingKind(x,p,k);}x.s.hp=0;finishLandingKinds(x);assert.equal(x.s.hp,0);assert.equal(x.s.flags.bd37,undefined);});
test('BD37 cannot stack or finish a different square',()=>{const x=ctx();startLandingKinds(x);assert.throws(()=>startLandingKinds(x));for(const [p,k]of [[2,'道具'],[3,'罠'],[4,'戦闘']])recordLandingKind(x,p,k);x.s.pos=3;finishLandingKinds(x);assert.equal(x.s.hp,1);x.s.pos=4;finishLandingKinds(x);assert.equal(x.s.hp,11);});
import {dispatch} from '../src/engine/index.js';import {withScripts,withSquare,walk} from './fixtures/helpers.mjs';
test('BD37 real use counts landings and settles after the third choice, not before',()=>{
 const selected=['道具','罠','回復'].map(kind=>Object.values(c.events).find(e=>e.route==='M'&&e.kind===kind)||Object.values(c.events).find(e=>e.kind===kind));
 // Use existing source kinds with a no-effect explicit completion option to isolate the timing.
 assert.ok(selected.every(Boolean));const events=Object.fromEntries(selected.map(e=>[e.id,{options:[{id:'finish',label:'終える',effects:[]}]}]));const content=withScripts(c,{events});
 let s=exampleRun(content);s.hp=1;s.mp=0;s.bag=['BD37'];s=dispatch(content,s,{type:'useItem',itemId:'BD37'}).state;
 for(let i=0;i<3;i++){
  s=withSquare(s,i+2,selected[i].id);s=walk(content,s,1).state;const hp=s.hp,mp=s.mp;
  s=dispatch(content,s,{type:'chooseOption',optionId:'finish'}).state;
  assert.equal(s.hp,hp+(i===2?10:0));assert.equal(s.mp,mp+(i===2?4:0));
 }
 assert.equal(s.flags.bd37,undefined);assert.equal(s.bag.includes('BD37'),false);
});
import {landOnEvent} from './fixtures/helpers.mjs';
test('BD37 third inn landing waits until leaving the inn',()=>{
 let s=exampleRun(c,'F');s.hp=1;s.mp=0;s.flags.bd37={kinds:['道具','罠'],settlePos:null};
 s=landOnEvent(c,s,Object.values(c.events).find(e=>e.id.startsWith('F1-')&&e.kind==='宿場').id,{pos:s.board.innPositions[0],patch:{hp:1,mp:0}}).state;
 assert.equal(s.phase,'inn');assert.equal(s.flags.bd37.settlePos,s.pos);const hp=s.hp,mp=s.mp;
 s=dispatch(c,s,{type:'leaveInn'}).state;assert.equal(s.hp,hp+10);assert.equal(s.mp,mp+4);assert.equal(s.flags.bd37,undefined);
});
