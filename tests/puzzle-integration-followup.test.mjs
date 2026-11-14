import test from 'node:test';import assert from 'node:assert/strict';
import {dispatch,view} from '../src/engine/index.js';import {getContent,exampleRun,landOnEvent,withScripts} from './fixtures/helpers.mjs';
const content=await getContent();
function setup(bag=['BD18','BD39']){
 const def={id:'F1-19',kind:'choice',candidates:['blue','red'],answer:'blue',cluePair:{scene:'青糸',option:'青糸'}};
 const c=withScripts(content,{events:{'F1-19':{puzzle:def,options:[{id:'blue',label:'青糸',effects:[{op:'giveGear',id:'AR08'}]},{id:'red',label:'赤糸',cost:{hp:3},effects:[]}]}}});
 for(const id of bag)c.scripts.items[id]={uses:[{where:[id==='BD39'?'puzzleWrong':'puzzle'],effects:[{op:'puzzleAssist',itemId:id}]}]};
 return {c,s:landOnEvent(c,exampleRun(c,'F'),'F1-19',{patch:{hp:20,bag}}).state};
}
test('puzzle preview preserves outcome; first wrong answer waits before any cost',()=>{
 let {c,s}=setup();const pre=dispatch(c,s,{type:'useItem',itemId:'BD18',params:{answer:'red'}});s=pre.state;assert.equal(s.hp,20);assert.equal(s.event.puzzle.attempts,0);
 s=dispatch(c,s,{type:'chooseOption',optionId:'red'}).state;assert.equal(s.hp,20);assert.equal(s.event.puzzle.pendingWrong,'red');
 s=dispatch(c,s,{type:'useItem',itemId:'BD39'}).state;assert.equal(s.hp,20);
 s=dispatch(c,s,{type:'chooseOption',optionId:'blue'}).state;assert.equal(s.gear.some(g=>g.id==='AR08'),true);assert.equal(s.hp,20);
});
test('committing pending error applies its loss once',()=>{
 let {c,s}=setup(['BD39']);s=dispatch(c,s,{type:'chooseOption',optionId:'red'}).state;s=dispatch(c,s,{type:'commitPuzzleWrong'}).state;assert.equal(s.hp,17);assert.notEqual(s.phase,'event');
});
test('no-target puzzle use rejects without consuming and without enabled action',()=>{
 let {c,s}=setup(['BD05']);assert.throws(()=>dispatch(c,s,{type:'useItem',itemId:'BD05'}));assert.deepEqual(s.bag,['BD05']);
});
test('real M1 matching: BD23 fixes one pair without clearing, then a real answer pays 100',()=>{
 let s=landOnEvent(content,exampleRun(content,'M'),'M1-01',{patch:{gold:50,bag:['BD23']}}).state;
 s=dispatch(content,s,{type:'useItem',itemId:'BD23'}).state;
 assert.equal(s.gold,50);assert.equal(s.event.puzzle.resolved,false);assert.deepEqual(s.event.puzzle.fixedPairs,{daisy:'white'});
 assert.throws(()=>dispatch(content,s,{type:'answerPuzzle',answer:{daisy:'purple',violet:'white'}}));
 s=dispatch(content,s,{type:'answerPuzzle',answer:{daisy:'white',violet:'purple'}}).state;assert.equal(s.gold,150);
});
test('real M1 order: BD14 first step and BD34 draft do not commit any gold',()=>{
 let s=landOnEvent(content,exampleRun(content,'M'),'M1-02',{patch:{gold:50,bag:['BD14','BD34']}}).state;
 s=dispatch(content,s,{type:'useItem',itemId:'BD14'}).state;
 assert.deepEqual(s.event.puzzle.fixedPrefix,['layBag']);assert.equal(s.gold,50);
 s=dispatch(content,s,{type:'useItem',itemId:'BD34',params:{answer:['layBag','tieRope','coverHole']}}).state;
 assert.deepEqual(s.event.puzzle.hints.at(-1),{kind:'firstMismatch',index:1});assert.equal(s.gold,50);assert.equal(s.event.puzzle.attempts,0);
 s=dispatch(content,s,{type:'answerPuzzle',answer:['layBag','coverHole','tieRope']}).state;assert.equal(s.gold,210);
});
test('actual F1 clue can be underlined, but equipment-versus-equipment trade cannot',()=>{
 let s=landOnEvent(content,exampleRun(content,'F'),'F1-19',{patch:{bag:['BD33']}}).state;
 s=dispatch(content,s,{type:'useItem',itemId:'BD33'}).state;assert.deepEqual(s.event.puzzle.hints.at(-1),{kind:'underline',scene:'青糸',option:'青糸'});
 const other=landOnEvent(content,exampleRun(content,'F'),'F1-13',{patch:{bag:['BD33']}}).state;
 assert.throws(()=>dispatch(content,other,{type:'useItem',itemId:'BD33'}));assert.deepEqual(other.bag,['BD33']);
});
test('numeric supplemental sample: boundaries, comparison preview, reload and exact reward',()=>{
 const make=()=>landOnEvent(content,exampleRun(content,'M'),'M3-08',{patch:{gold:50,bag:['BD26','BD39']}}).state;
 for(const answer of [0,8]){let s=make();s=dispatch(content,s,{type:'answerPuzzle',answer}).state;assert.equal(s.gold,50);s=dispatch(content,s,{type:'commitPuzzleWrong'}).state;assert.equal(s.gold,50);}
 let s=make();const before=JSON.stringify(s);assert.throws(()=>dispatch(content,s,{type:'useItem',itemId:'BD26',params:{values:[4,4]}}));assert.equal(JSON.stringify(s),before);
 s=dispatch(content,s,{type:'useItem',itemId:'BD26',params:{values:[2,7]}}).state;assert.deepEqual(s.event.puzzle.hints.at(-1),{kind:'closer',index:0});assert.equal(s.gold,50);assert.equal(s.event.puzzle.attempts,0);
 s=JSON.parse(JSON.stringify(s));assert.throws(()=>dispatch(content,s,{type:'useItem',itemId:'BD26',params:{values:[3,5]}}));
 s=dispatch(content,s,{type:'answerPuzzle',answer:4}).state;assert.equal(s.gold,510);
});
test('window supplemental sample: actual matrix diff exactly equals the unique correct candidate',()=>{
 const p=content.scripts.events['M5-15'].puzzle;const diffs=[];
 for(let row=0;row<p.display.reference.length;row++)for(let col=0;col<p.display.reference[row].length;col++)if(p.display.reference[row][col]!==p.display.current[row][col])diffs.push(`r${row}c${col}`);
 assert.deepEqual(diffs,['r0c1']);assert.equal(p.answer,diffs[0]);assert.deepEqual(p.differences.map(x=>x.id),diffs);
 let s=landOnEvent(content,exampleRun(content,'M'),'M5-15',{patch:{gold:10,bag:['BD44','BD05']}}).state;
 s=dispatch(content,s,{type:'useItem',itemId:'BD44'}).state;assert.deepEqual(s.event.puzzle.hints.at(-1),{kind:'difference',id:'r0c1'});assert.equal(s.gold,10);
 s=dispatch(content,s,{type:'useItem',itemId:'BD05'}).state;assert.notEqual(s.event.puzzle.eliminated[0],'r0c1');assert.equal(s.event.puzzle.eliminated.length,1);
 s=dispatch(content,JSON.parse(JSON.stringify(s)),{type:'answerPuzzle',answer:'r0c1'}).state;assert.equal(s.gold,870);
});
test('public view never returns answer metadata and exposes only the right pending actions',()=>{
 let s=landOnEvent(content,exampleRun(content,'M'),'M3-08',{patch:{bag:['BD26','BD39']}}).state;
 const v=view(content,s);assert.equal(Object.hasOwn(v.event.puzzle,'answer'),false);assert.equal(Object.hasOwn(v.event.puzzle,'differences'),false);
 const a=v.actions.find(a=>a.type==='answerPuzzle');assert.equal(a.input.type,'int');assert.equal(a.input.min,0);assert.equal(a.input.max,8);
 const itemAction=v.actions.find(a=>a.type==='useItem'&&a.itemId==='BD26');assert.equal(itemAction.enabled,true);assert.equal(itemAction.needsInput,true);
 s=dispatch(content,s,{type:'answerPuzzle',answer:0}).state;
 const pending=view(content,s);assert.equal(pending.actions.some(a=>['chooseOption','answerPuzzle'].includes(a.type)),false);assert.equal(pending.actions.some(a=>a.type==='commitPuzzleWrong'),true);
 assert.equal(pending.actions.find(a=>a.type==='useItem'&&a.itemId==='BD39').enabled,true);
});
test('unresolved puzzle view hides source answer instructions and reward result',()=>{
 for(const id of ['M1-01','M1-02','F1-15','F1-19']){
  const s=landOnEvent(content,exampleRun(content,id[0]),id).state,v=view(content,s);
  assert.equal(v.event.result,null);assert.notEqual(v.event.action,content.events[id].action);assert.equal(v.event.scene,content.events[id].scene);
  assert.equal(JSON.stringify(v.event).includes('"answer"'),false);
 }
});
