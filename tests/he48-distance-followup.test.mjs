import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, view } from '../src/engine/index.js';
import { evalExpr } from '../src/engine/expr.js';
import { getContent, exampleRun, place, walk } from './fixtures/helpers.mjs';
const content=await getContent();
const distance=s=>evalExpr({ctx:{content,s}},{ref:'sinceInn'});
function atSecondInn(){
 const s=exampleRun(content,'H'),[first,second]=s.board.innPositions;
 s.inns[first].visited=true;
 return {s:walk(content,place(s,second-2,{hp:1,mp:0,bag:['HE48']}),6).state,first,second};
}
test('HE48: current inn arrival does not overwrite the previously departed inn',()=>{
 const {s,first,second}=atSecondInn();assert.equal(s.phase,'inn');assert.equal(s.inns[second].visited,true);
 assert.equal(distance(s),second-first);
 const r=dispatch(content,s,{type:'useItem',itemId:'HE48'});
 const groups=Math.min(8,Math.floor((second-first)/2));assert.equal(r.state.hp,1+groups*2);assert.equal(r.state.mp,groups);
});
test('HE48: leaving current inn resets distance without changing save schema',()=>{
 const {s,second}=atSecondInn();const left=dispatch(content,s,{type:'leaveInn'}).state;
 assert.equal(left.phase,'board');assert.equal(distance(left),0);
 const restored=JSON.parse(JSON.stringify(left));restored.pos=second+1;assert.equal(distance(restored),1);
 restored.pos=second+2;assert.equal(distance(restored),2);
});
test('HE48: before the first inn, distance starts at departure square 1',()=>{
 const s=exampleRun(content,'H');s.pos=3;assert.equal(distance(s),2);
});
test('HE48: legacy snapshot with no new departure field uses visited inns',()=>{
 const {s,first,second}=atSecondInn();const restored=JSON.parse(JSON.stringify(s));assert.equal(Object.hasOwn(restored,'lastDepartedInnPos'),false);assert.equal(distance(restored),second-first);
});
