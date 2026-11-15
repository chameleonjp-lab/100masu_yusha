import test from 'node:test';import assert from 'node:assert/strict';
import {dispatch} from '../src/engine/index.js';
import {getContent,exampleRun,withScripts,walk} from './fixtures/helpers.mjs';
const base=await getContent();
test('reveals expire only on confirmed moves, persist through reload, and never change fixed information',()=>{
 const c=withScripts(base,{events:{'M1-01':{onLand:[]}}});
 let s=exampleRun(c);s.reveals=[{kind:'sixOutcomes',turn:0,data:{outcomes:[{die:1,to:2}]},remainingMoves:2},{kind:'squaresAhead',turn:0,data:{squares:[]}}];
 s.board.squares[1].contentId='M1-01';s.board.squares[2].contentId='M1-01';
 const rolled=dispatch(c,s,{type:'roll'},{rolls:[0]}).state;
 assert.equal(rolled.reveals[0].remainingMoves,2);
 let moved=dispatch(c,JSON.parse(JSON.stringify(rolled)),{type:'move'}).state;
 assert.equal(moved.reveals[0].remainingMoves,1);assert.deepEqual(moved.reveals[0].data,s.reveals[0].data);
 moved=walk(c,moved,1).state;
 assert.equal(moved.reveals.length,1);assert.equal(moved.reveals[0].kind,'squaresAhead');
});
