import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/engine/puzzles.js').catch(()=>({}));
const choice={id:'test-choice',kind:'choice',candidates:['red','blue','green'],answer:'blue',cluePair:{scene:'青糸',option:'青糸'}};
test('BD05 removes one wrong candidate, never settles or changes the source',()=>{
 assert.equal(typeof api.createPuzzleState,'function');const s=api.createPuzzleState(choice);const original=JSON.stringify(s);
 const r=api.assistPuzzle(choice,s,'BD05');assert.deepEqual(r.hint,{kind:'eliminate',candidate:'red'});assert.equal(r.state.resolved,false);assert.equal(JSON.stringify(s),original);
 assert.throws(()=>api.assistPuzzle(choice,r.state,'BD05'));
 assert.throws(()=>api.assistPuzzle({...choice,candidates:['red','blue']},api.createPuzzleState(choice),'BD05'));
});
test('BD14 fixes only the first step and BD34 reports only first incorrect index',()=>{
 const d={id:'sequence',kind:'sequence',candidates:['bag','cloth','rope'],answer:['bag','cloth','rope']};const s=api.createPuzzleState(d);
 const r=api.assistPuzzle(d,s,'BD14');assert.deepEqual(r.hint,{kind:'prefix',values:['bag']});assert.equal(r.state.resolved,false);
 const draft=api.assistPuzzle(d,r.state,'BD34',{answer:['bag','rope','cloth']});assert.deepEqual(draft.hint,{kind:'firstMismatch',index:1});
 assert.deepEqual(api.assistPuzzle(d,s,'BD34',{answer:d.answer}).hint,{kind:'firstMismatch',index:null});
});
test('BD18 is a dry correctness check with no answer, reward or settlement',()=>{
 const r=api.assistPuzzle(choice,api.createPuzzleState(choice),'BD18',{answer:'red'});assert.deepEqual(r.hint,{kind:'correctness',correct:false});assert.equal(r.state.attempts,0);assert.equal(r.state.resolved,false);
 assert.throws(()=>api.assistPuzzle(choice,r.state,'BD18',{answer:'blue'}));
});
test('BD23 fixes only one pair when at least two remain',()=>{
 const d={id:'match',kind:'matching',candidates:['daisy','violet'],targets:['white','purple'],answer:{daisy:'white',violet:'purple'}};
 let r=api.assistPuzzle(d,api.createPuzzleState(d),'BD23');assert.deepEqual(r.hint,{kind:'pair',source:'daisy',target:'white'});assert.equal(r.state.resolved,false);
 assert.throws(()=>api.assistPuzzle(d,{...api.createPuzzleState(d),fixedPairs:{daisy:'white'}},'BD23'));
});
test('BD26 compares two distances without disclosing target or distance',()=>{
 const d={id:'number',kind:'numeric',answer:10,min:0,max:20};const s=api.createPuzzleState(d);
 assert.deepEqual(api.assistPuzzle(d,s,'BD26',{values:[7,11]}).hint,{kind:'closer',index:1});assert.deepEqual(api.assistPuzzle(d,s,'BD26',{values:[9,11]}).hint,{kind:'closer',index:null});
 assert.throws(()=>api.assistPuzzle(d,s,'BD26',{values:[9,9]}));
});
test('BD33 requires an authored clue pair; BD44 highlights first row-major difference only',()=>{
 assert.deepEqual(api.assistPuzzle(choice,api.createPuzzleState(choice),'BD33').hint,{kind:'underline',scene:'青糸',option:'青糸'});
 assert.throws(()=>api.assistPuzzle({...choice,cluePair:null},api.createPuzzleState(choice),'BD33'));
 const d={id:'image',kind:'compare',candidates:['a','b'],answer:'a',differences:[{id:'bottom',row:1,column:0},{id:'right',row:0,column:2},{id:'left',row:0,column:1}]};
 assert.deepEqual(api.assistPuzzle(d,api.createPuzzleState(d),'BD44').hint,{kind:'difference',id:'left'});
 assert.throws(()=>api.assistPuzzle({...d,differences:[]},api.createPuzzleState(d),'BD44'));
});
test('BD39 holds the first wrong answer and permits one reanswer, never a second retry',()=>{
 const start=api.createPuzzleState(choice);const pending=api.resolvePuzzleAnswer(choice,start,'red',{offerRetry:true});assert.equal(pending.outcome,'wrongPending');assert.equal(pending.state.resolved,false);
 const retry=api.assistPuzzle(choice,pending.state,'BD39');assert.equal(retry.state.pendingWrong,null);assert.equal(retry.state.resolved,false);
 const end=api.resolvePuzzleAnswer(choice,retry.state,'green',{offerRetry:true});assert.equal(end.outcome,'wrong');assert.equal(end.state.resolved,true);
 assert.throws(()=>api.assistPuzzle(choice,end.state,'BD39'));
 const correct=api.resolvePuzzleAnswer(choice,start,'blue',{offerRetry:true});assert.equal(correct.outcome,'correct');assert.throws(()=>api.assistPuzzle(choice,correct.state,'BD39'));
});
