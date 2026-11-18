import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBase,makePolicy,installGuard} from './pages-guard.mjs';
test('base rejects non-loopback, credentials, implicit port and URL payloads',()=>{
 for(const u of ['https://example.com:8000/','http://user@localhost:8000/','http://localhost/','http://127.0.0.1:8000/?x=1','http://localhost:8000/#x']) assert.throws(()=>validateBase(u));
 assert.equal(validateBase('http://127.0.0.1:8123/100masu_yusha/').pathname,'/100masu_yusha/');
});
test('policy permits only exact static GET resources beneath artifact path',()=>{
 const p=makePolicy('http://localhost:8123/game/',['index.html','src/app.js']);
 assert.equal(p('http://localhost:8123/game/','GET'),true);
 assert.equal(p('http://localhost:8123/game/src/app.js','GET'),true);
 for(const [u,m] of [['http://localhost:8123/game/src/app.js','POST'],['http://localhost:8123/out','GET'],['http://example.com/game/','GET'],['http://localhost:8123/game/src/app.js?x=1','GET'],['http://localhost:8123/game/%73rc/app.js','GET']]) assert.equal(p(u,m),false);
});
test('context guard rejects unsupported websocket interception before HTTP routing',async()=>{
 let called=false; await assert.rejects(installGuard({route:()=>{called=true}},()=>true,[]));assert.equal(called,false);
});
test('redirects never forwarded and unknown URLs never fetched',async()=>{
 let handler,wsHandler; const c={routeWebSocket:async(_,h)=>wsHandler=h,route:async(_,h)=>handler=h};const blocked=[];
 await installGuard(c,makePolicy('http://localhost:8123/',['index.html']),blocked);
 let fetched=0,fulfilled=0,aborted=0;const route={request:()=>({url:()=> 'http://localhost:8123/',method:()=> 'GET',redirectedFrom:()=>null}),fetch:async opts=>{assert.equal(opts.maxRedirects,0);fetched++;return {status:()=>302}},abort:async()=>aborted++,fulfill:async()=>fulfilled++};
 await handler(route);assert.equal(fetched,1);assert.equal(fulfilled,0);assert.equal(aborted,1);
 route.request=()=>({url:()=> 'http://external.invalid/',method:()=> 'GET',redirectedFrom:()=>null});await handler(route);assert.equal(fetched,1);
 let closed=false;await wsHandler({close:()=>closed=true});assert.equal(closed,true);assert.equal(blocked.length,3);
});
