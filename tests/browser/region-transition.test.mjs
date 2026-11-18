import test from 'node:test';
import assert from 'node:assert/strict';
import {planPresentation} from '../../src/ui/presentation-timeline.js';
function input(from=19,to=23){return {before:{runId:'r',revision:1,pos:from,board:{band:{id:Math.ceil(from/20)}}},after:{runId:'r',revision:2,pos:to,board:{band:{id:Math.ceil(to/20),name:'Water'}}},effects:[{t:'moved',from,to,steps:to-from,die:to-from,stop:'normal'}],regionVisual:true};}
const find=p=>p.steps.filter(s=>s.kind==='display'&&s.payload.stage==='region.transition');
for(const [settings,at,banner,duration,motion] of [[{},790,1600,1200,'crossfade'],[{animation:'short'},320,600,400,'crossfade'],[{reducedMotion:true},50,1600,300,'fade'],[{animation:'short',reducedMotion:true},50,600,300,'fade']])test(`region timing ${JSON.stringify(settings)} is concurrent with movement`,()=>{
 const p=planPresentation({...input(),settings}),r=find(p);assert.equal(r.length,1);assert.equal(r[0].atMs,at);assert.equal(r[0].payload.durationMs,duration);assert.equal(r[0].payload.bannerMs,banner);assert.equal(r[0].payload.motion,motion);assert.equal(r[0].payload.pos,21);assert.equal(r[0].payload.fromBand,1);assert.equal(r[0].payload.band.id,2);
 assert.equal(p.steps.filter(s=>s.kind==='sound'&&s.payload.cue==='card.flip').length,1);
 assert.equal(p.steps.some(s=>s.payload.stage==='region.hold'),false);
 if(!settings.reducedMotion)assert.deepEqual(p.steps.filter(s=>s.payload.stage==='walk').map(s=>s.atMs),settings.animation==='short'?[80,200,320,440]:[150,470,790,1110]);
 assert.ok(p.durationMs>=at+Math.max(banner,duration));
});
for(const boundary of [21,41,61,81])test(`boundary ${boundary} comes from committed positions`,()=>{const p=planPresentation(input(boundary-1,boundary));assert.equal(find(p)[0].payload.pos,boundary);});
test('unchanged band, stale revision, inconsistent band or unrelated roll never emits region',()=>{
 for(const x of [input(5,8),{...input(),after:{...input().after,revision:1}},{...input(),after:{...input().after,board:{band:{id:4}}}},{...input(),effects:[]}])assert.equal(find(planPresentation(x)).length,0);
});
test('region remains opt in; source snapshots unchanged',()=>{const x=input(),copy=structuredClone(x);assert.equal(find(planPresentation({...x,regionVisual:false})).length,0);planPresentation(x);assert.deepEqual(x,copy);});
test('castle quiet and bell unaffected',()=>{const p=planPresentation({...input(98,100),effects:[{t:'moved',from:98,to:100,steps:2,stop:'castle'}]});assert.equal(find(p).length,0);assert.equal(p.steps.filter(s=>s.payload.cue==='bell').length,1);assert.equal(p.steps.filter(s=>s.payload.cue==='land').length,0);});
import {getContent,exampleRun,place,rollDie} from '../fixtures/helpers.mjs';
import {createSession} from '../../src/ui/session.js';
import {createMemoryStore} from '../../src/save/index.js';
import {createMeta} from '../../src/engine/index.js';
import {createPresentationPlayer} from '../../src/ui/presentation-timeline.js';
const content=await getContent();
async function move(from,die){const run=rollDie(content,place(exampleRun(content,'M'),from),die).state,store=createMemoryStore();await store.startNew({run,meta:createMeta()});const session=createSession(content,store);await session.load();const before=structuredClone(session.view),effects=await session.act({type:'move'});return {before,after:structuredClone(session.view),effects,store,regionVisual:true};}
test('committed boundary move keeps exact final event/actions and persisted revision',async()=>{const f=await move(20,1),p=planPresentation(f);assert.equal(find(p).length,1);assert.deepEqual(p.finalView,f.after);assert.deepEqual(p.resultEffects,f.effects);assert.equal((await f.store.load()).revision,f.after.revision);});
test('real inn truncation never invents boundary from discarded steps',async()=>{const base=exampleRun(content,'M'),inn=base.board.innPositions[0],f=await move(inn-1,6),p=planPresentation({...f,settings:{animation:'short',reducedMotion:true}});assert.equal(f.after.pos,inn);assert.ok(find(p).every(s=>s.payload.pos<=inn));assert.equal(p.steps.find(s=>s.payload.stage==='inn.stop').payload.durationMs,500);});
test('cancelled concurrent region cannot replay after newer action',()=>{let next=0;const pending=new Map(),all=[],events=[],finals=[],clock={setTimeout(fn,ms){const id=++next;pending.set(id,{fn,ms});all.push(fn);return id},clearTimeout(id){pending.delete(id)}};const player=createPresentationPlayer({clock,onStep:s=>events.push(s),onFinal:r=>finals.push(r)});player.play(planPresentation(input()));player.cancel();const count=events.length;all.forEach(fn=>fn());assert.equal(events.length,count);assert.equal(finals.length,1);assert.equal(finals[0].reason,'cancel');assert.deepEqual(finals[0].finalView,input().after);assert.equal(pending.size,0);});
