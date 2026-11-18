import test from 'node:test';
import assert from 'node:assert/strict';
import {makePolicy,installGuard} from './pages-guard.mjs';
test('manifest traversal and cross-origin syntax fail closed',()=>{
 for(const p of ['../x','src/../x','./x','/x','//remote.invalid/x','http://remote.invalid/x','src\\x','x%2fy','x?y','x#y','a//b','a/',''])assert.throws(()=>makePolicy('http://localhost:8123/game/',[p]),p);
});
test('all unsafe verbs rejected for otherwise exact resource',()=>{
 const p=makePolicy('http://localhost:8123/game/',['index.html']);
 for(const m of ['POST','PUT','PATCH','DELETE','HEAD','OPTIONS','CONNECT','get',''])assert.equal(p('http://localhost:8123/game/index.html',m),false);
});
test('all redirect status codes and redirected request origins denied before next hop',async()=>{
 let handler;const context={routeWebSocket:async()=>{},route:async(_,h)=>handler=h};const blocked=[];
 await installGuard(context,makePolicy('http://localhost:8123/',['index.html']),blocked);
 for(const status of [300,301,302,303,304,305,307,308,399]){
  let fetched=0,aborted=0;await handler({request:()=>({url:()=> 'http://localhost:8123/',method:()=> 'GET',redirectedFrom:()=>null}),fetch:async options=>{assert.deepEqual(options,{maxRedirects:0,maxRetries:0});fetched++;return {status:()=>status}},abort:async()=>aborted++,fulfill:async()=>assert.fail('redirect fulfilled')});assert.equal(fetched,1);assert.equal(aborted,1);
 }
 let aborted=0;await handler({request:()=>({url:()=> 'http://localhost:8123/',method:()=> 'GET',redirectedFrom:()=>({})}),fetch:async()=>assert.fail('redirected request fetched'),abort:async()=>aborted++});assert.equal(aborted,1);
 assert.equal(blocked.length,10);
});
test('successful approved response is fulfilled without continue or redirect following',async()=>{
 let handler;await installGuard({routeWebSocket:async()=>{},route:async(_,h)=>handler=h},()=>true,[]);
 const response={status:()=>200};let received;await handler({request:()=>({url:()=> 'http://localhost:8123/',method:()=> 'GET',redirectedFrom:()=>null}),fetch:async()=>response,fulfill:async data=>received=data,continue:async()=>assert.fail('continue bypass'),abort:async()=>assert.fail('unexpected abort')});assert.equal(received.response,response);
});
test('fetch failure aborts and records a failed guard request',async()=>{let handler,aborted=false;const blocked=[],context={routeWebSocket:async()=>{},route:async(_,h)=>handler=h};await installGuard(context,()=>true,blocked);await handler({request:()=>({url:()=> 'http://127.0.0.1:8123/index.html',method:()=> 'GET',redirectedFrom:()=>null}),fetch:async()=>{throw Error('network down')},abort:async()=>{aborted=true}});assert.equal(aborted,true);assert.deepEqual(blocked,[{kind:'fetch'}]);});
