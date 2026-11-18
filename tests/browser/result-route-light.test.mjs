import test from 'node:test';import assert from 'node:assert/strict';
import {getContent,exampleRun,place,walk} from '../fixtures/helpers.mjs';
import {dispatch,createMeta} from '../../src/engine/index.js';import {createMemoryStore} from '../../src/save/index.js';import {createSession} from '../../src/ui/session.js';
import {planPresentation,createPresentationPlayer} from '../../src/ui/presentation-timeline.js';
import {completedKingRouteMap,planResultRouteLight} from '../../src/ui/result-route-light.js';
const c=await getContent();
async function fixture({route='M',bag=false,seed=1}={}){
 const run=dispatch(c,walk(c,place(exampleRun(c,route,seed),99,{level:20,xp:912,hp:78,mp:48,bag:bag?Array(6).fill(Object.keys(c.items)[0]):[]}),1).state,{type:'challengeKing'}).state;
 run.battle.enemy.hp=4;
 const store=createMemoryStore();await store.startNew({run,meta:createMeta()});const s=createSession(c,store);await s.load();
 const winBefore=structuredClone(s.view),winEffects=await s.act({type:'attack'}),winAfter=structuredClone(s.view);
 let resolvedBag=null;
 if(s.view.phase==='bagFull'){const decline=s.view.actions.find(a=>a.type==='bagDecline');assert.ok(decline);const effects=await s.act(decline);resolvedBag={before:winAfter,after:structuredClone(s.view),effects};}
 const before=structuredClone(s.view),effects=await s.act({type:'continue'}),after=structuredClone(s.view);
 return {before,after,effects,store,resolvedBag,win:{before:winBefore,after:winAfter,effects:winEffects}};
}
const p=(f,opts={})=>planPresentation({...f,resultRouteVisual:true,...opts});
const displays=p=>p.steps.filter(x=>x.kind==='display');
for(const [settings,duration,moments,counts] of [[{},1500,[0,300,600,900,1200],[1,2,3,4,5]],[{animation:'short'},500,[0,100,200,300,400],[1,2,3,4,5]],[{animation:'short',reducedMotion:true},0,[0],[5]]])test('real runFinished lights route '+JSON.stringify(settings),async()=>{
 const f=await fixture(),stored=await f.store.load(),r=p(f,{settings});
 assert.equal(r.mode,'result-route-light');assert.equal(r.durationMs,duration);assert.deepEqual(displays(r).map(s=>s.atMs),moments);
 assert.deepEqual(displays(r).map(s=>s.payload.litBands),counts);assert.ok(displays(r).every(s=>s.payload.effectIndex===0&&s.payload.routeId==='M'));
 assert.deepEqual(displays(r).at(-1).payload.segments.map(x=>[x.from,x.to,x.lit]),[[1,20,true],[21,40,true],[41,60,true],[61,80,true],[81,100,true]]);
 assert.equal(r.steps.at(-1).atMs,duration);assert.deepEqual(r.finalView,f.after);assert.deepEqual(r.resultEffects,f.effects);
 assert.equal(r.steps.some(s=>s.kind==='sound'),false);assert.deepEqual(await f.store.load(),stored);
});
for(const route of ['M','F','B','H'])test('saved/reloaded completed map is fully lit without live replay '+route,async()=>{
 const f=await fixture({route}),s=createSession(c,f.store);await s.load();const saved=structuredClone(s.view);
 const r=completedKingRouteMap(saved);
 assert.equal(r.routeId,route);assert.equal(r.litBands,5);assert.ok(r.segments.every(x=>x.lit));
 assert.equal(p({before:saved,after:saved,effects:[]}).steps.length,0);
 assert.equal(p(f,{resultRouteVisual:false}).steps.length,0);
 assert.equal(displays(p(f.win,{victoryVisual:true})).some(x=>x.payload.stage==='result.route.light'),false);
});
for(const [name,change] of Object.entries({
 excess:f=>f.effects.push({t:'future'}),result:f=>f.effects[0].result.rolls++,
 oldRevision:f=>f.after.revision=f.before.revision,route:f=>f.after.route.id='F',
 defeat:f=>f.after.result.defeated=false,unknownResult:f=>f.effects[0].result.extra=true,
 oldVictory:f=>f.before.victory.battleId++,phase:f=>f.before.phase='bagFull',
 activePrompt:f=>f.before.prompt={kind:'bagFull'},stats:f=>f.after.hero.hp--,
}))test('whole-static '+name,async()=>{const f=await fixture();assert.ok(planResultRouteLight(f));change(f);const r=p(f);assert.deepEqual(r.steps,[]);assert.deepEqual(r.finalView,f.after);});
for(const how of ['skip','cancel'])test(how+' settles route without new steps or sounds',async()=>{
 const f=await fixture(),plan=p(f),q=new Map(),seen=[],ended=[];let id=0;
 const player=createPresentationPlayer({clock:{setTimeout:fn=>{q.set(++id,fn);return id},clearTimeout:i=>q.delete(i)},onStep:s=>seen.push(s),onFinal:x=>ended.push(x)});
 player.play(plan);const tasks=[...q.values()];player[how]();tasks.forEach(fn=>fn());
 assert.equal(q.size,0);assert.equal(seen.length,0);assert.equal(ended.length,1);assert.deepEqual(ended[0].sounds,[]);
 assert.equal(completedKingRouteMap(ended[0].finalView).litBands,5);
});

test('bag-full decline is not completion; only the later real continue lights the map',async()=>{
 const f=await fixture({seed:5,bag:true});
 assert.equal(f.win.after.phase,'bagFull');assert.ok(f.resolvedBag);
 assert.equal(f.resolvedBag.after.phase,'battleReward');
 assert.equal(completedKingRouteMap(f.win.after),null);assert.equal(completedKingRouteMap(f.resolvedBag.after),null);
 assert.equal(p(f.resolvedBag).steps.length,0);assert.equal(p(f).mode,'result-route-light');
});
