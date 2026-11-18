// T4a only: successful real session/view/effects -> pure board plan; fake clock player.
import test from 'node:test';import assert from 'node:assert/strict';
import {getContent,exampleRun,place,rollDie} from '../fixtures/helpers.mjs';import {createSession} from '../../src/ui/session.js';import {createMemoryStore} from '../../src/save/index.js';import {createMeta} from '../../src/engine/index.js';
const m=await import('../../src/ui/presentation-timeline.js').catch(()=>({})),content=await getContent();
async function sessionFor(run){const store=createMemoryStore();await store.startNew({run,meta:createMeta()});const session=createSession(content,store);await session.load();return {store,session};}
async function committed(session,action){const before=structuredClone(session.view),effects=await session.act(action);return {before,after:structuredClone(session.view),effects};}
async function moveFixture(pos=5,die=4){const run=rollDie(content,place(exampleRun(content,'M'),pos),die).state;const f=await sessionFor(run);return {...f,...await committed(f.session,{type:'move'})};}
const displays=(p,stage)=>p.steps.filter(s=>s.kind==='display'&&s.payload.stage===stage);
const sounds=p=>p.steps.filter(s=>s.kind==='sound');
test('actual committed roll becomes dice then preview only; no synthetic movement or input mutation',async()=>{
 assert.equal(typeof m.planPresentation,'function');const f=await sessionFor(exampleRun(content,'M')),input=await committed(f.session,{type:'roll'}),before=structuredClone(input),p=m.planPresentation({...input,settings:{}});
 assert.deepEqual(input,before);assert.deepEqual(p.finalView,input.after);assert.notEqual(p.finalView,input.after);assert.equal(displays(p,'walk').length,0);assert.equal(displays(p,'dice.roll')[0].payload.durationMs,900);assert.equal(displays(p,'dice.lock')[0].atMs,900);
 const preview=displays(p,'preview')[0];assert.deepEqual(preview.payload.preview,input.after.actions.find(a=>a.type==='move'&&!a.adjust).preview);assert.equal(preview.atMs,1100);assert.equal(p.durationMs,1350);
 assert.ok(p.steps[0].kind==='controls'&&!p.steps[0].payload.enabled);assert.ok(p.steps.at(-1).payload.enabled);assert.equal((await f.store.load()).revision,input.after.revision);
});
for(const [animation,perStep] of [['standard',320],['short',120]])test(`actual move ${animation} uses real moved.steps, separate from roll`,async()=>{
 const f=await moveFixture(),moved=f.effects.find(e=>e.t==='moved'),p=m.planPresentation({...f,settings:{animation}}),walks=displays(p,'walk');assert.equal(walks.length,moved.steps);assert.deepEqual(walks.map(s=>s.payload.to),Array.from({length:moved.steps},(_,i)=>moved.from+i+1));assert.ok(walks.every(s=>s.payload.durationMs===perStep));assert.equal(displays(p,'dice.roll').length,0);assert.deepEqual(p.finalView,f.after);assert.ok(p.steps.every(s=>s.atMs<=p.durationMs));
});
test('real inn truncation retains discarded count and full reading hold without walking unused die',async()=>{
 const base=exampleRun(content,'M'),inn=base.board.innPositions[0],f=await sessionFor(rollDie(content,place(base,inn-2),6).state),input=await committed(f.session,{type:'move'}),moved=input.effects.find(e=>e.t==='moved');assert.equal(moved.stop,'inn');assert.equal(moved.steps,2);assert.equal(moved.discarded,4);
 for(const reducedMotion of [false,true]){const p=m.planPresentation({...input,settings:{reducedMotion}});assert.equal(displays(p,'walk').length,reducedMotion?0:2);assert.equal(displays(p,'inn.stop')[0].payload.discarded,4);assert.equal(displays(p,'inn.stop')[0].payload.durationMs,1200);assert.equal(sounds(p).filter(s=>s.payload.cue==='door.bell').length,1);assert.ok(!displays(p,'walk').some(s=>s.payload.to>inn));}
});
test('reduced transforms large roll/move motion to <=150ms fade, retaining reading/static/quiet intervals',async()=>{
 const f=await moveFixture(),p=m.planPresentation({...f,settings:{reducedMotion:true}});assert.equal(displays(p,'walk').length,0);assert.equal(displays(p,'move.fade')[0].payload.durationMs,150);assert.equal(displays(p,'move.fade')[0].payload.motion,'fade');assert.ok(p.steps.filter(s=>s.kind==='display'&&s.payload.motion).every(s=>s.payload.motion==='fade'||s.payload.motion==='none'));assert.ok(!JSON.stringify(p).includes('flash'));
 const q=await sessionFor(exampleRun(content,'M')),input=await committed(q.session,{type:'roll'}),r=m.planPresentation({...input,settings:{reducedMotion:true}});assert.equal(displays(r,'dice.roll')[0].payload.durationMs,150);assert.equal(displays(r,'dice.lock')[0].payload.durationMs,0);assert.equal(displays(r,'preview')[0].payload.durationMs,150);
});
test('castle final step has silence, no land cue, and no departure from100; reload/new-run/stale data silent',async()=>{
 const f=await moveFixture(98,6),p=m.planPresentation({...f,settings:{}});assert.equal(displays(p,'walk').length,2);assert.equal(sounds(p).filter(s=>s.payload.cue==='land').length,0);assert.equal(displays(p,'quiet')[0].payload.durationMs,1000);assert.ok(p.steps.every(s=>s.payload.from===undefined||s.payload.from<100));
 for(const input of [{before:f.after,after:f.after,effects:f.effects},{before:{...f.before,runId:'other'},after:f.after,effects:f.effects},{before:f.after,after:f.after,effects:[]},{before:{...f.after,revision:f.after.revision-1},after:f.after,effects:[{t:'moved',from:100,to:101,steps:1,die:1,discarded:0,stop:'normal'}]}]){const q=m.planPresentation({...input,settings:{}});assert.deepEqual(q.steps,[]);assert.deepEqual(q.finalView,f.after);assert.equal(q.durationMs,0);}
});
test('failed actual write and committed-but-failed-readback never provide a successful pair to present',async()=>{
 for(const kind of ['write','readback']){const f=await sessionFor(exampleRun(content,'M'));if(kind==='write')f.store.backend.failNextWrite=true;else{const tx=f.store.backend.transaction.bind(f.store.backend);let written=false;f.store.backend.transaction=async(mode,fn)=>{if(written&&mode==='read')throw Error('read failed');const result=await tx(mode,fn);if(mode==='write')written=true;return result};}
 let presented=0;await assert.rejects(async()=>{const input=await committed(f.session,{type:'roll'});m.planPresentation(input);presented++});assert.equal(presented,0);}
});
function clock(){let id=0,now=0;const pending=new Map(),all=[];return {setTimeout(fn,ms){const timer=++id,entry={fn,at:now+ms,id:timer};pending.set(timer,entry);all.push(entry);return timer},clearTimeout(id){pending.delete(id)},tick(ms){const end=now+ms;for(;;){const next=[...pending.values()].filter(x=>x.at<=end).sort((a,b)=>a.at-b.at||a.id-b.id)[0];if(!next)break;pending.delete(next.id);now=next.at;next.fn()}now=end},pending,all};}
const smallPlan=(revision=1)=>({steps:[{key:`r:${revision}:presentation:0`,atMs:0,kind:'display',payload:{stage:'test'}},{key:`r:${revision}:presentation:1`,atMs:50,kind:'sound',payload:{cue:'coin.in',role:'committed'}}],durationMs:100,finalView:{runId:'r',revision,actions:[{type:'roll',enabled:true}]}});
test('injectable player finishes finitely with final view/actions, cancels timers and never owns game actions',()=>{
 assert.equal(typeof m.createPresentationPlayer,'function');const c=clock(),steps=[],finals=[],player=m.createPresentationPlayer({clock:c,onStep:s=>steps.push(s),onFinal:x=>finals.push(x)});player.play(smallPlan());assert.equal(player.running,true);c.tick(100);assert.equal(player.running,false);assert.equal(c.pending.size,0);assert.equal(finals.length,1);assert.equal(finals[0].reason,'finish');assert.deepEqual(finals[0].finalView,smallPlan().finalView);assert.deepEqual(finals[0].nextActions,smallPlan().finalView.actions);assert.equal(steps.length,2);
});
for(const mode of ['skip','cancel','error'])test(`player ${mode} restores final committed view/actions, idempotently and without old timer replay`,()=>{
 const c=clock(),steps=[],finals=[],player=m.createPresentationPlayer({clock:c,onStep:s=>{steps.push(s);if(mode==='error')throw Error('renderer failed')},onFinal:x=>finals.push(x)});player.play(smallPlan());if(mode==='error')c.tick(0);else assert.equal(player[mode](),true);assert.equal(player.running,false);assert.equal(finals.length,1);assert.equal(finals[0].reason,mode);assert.deepEqual(finals[0].finalView,smallPlan().finalView);assert.equal(player.skip(),false);assert.equal(player.cancel(),false);const count=steps.length;c.all.forEach(x=>x.fn());assert.equal(steps.length,count);assert.equal(finals.length,1);assert.equal(c.pending.size,0);
});
test('superseding or hidden-style cancel -> new plan prevents old generation changing latest view',()=>{
 for(const cancel of [false,true]){const c=clock(),finals=[],steps=[],player=m.createPresentationPlayer({clock:c,onStep:s=>steps.push(s),onFinal:x=>finals.push(x)});player.play(smallPlan(1));const old=[...c.all];if(cancel)player.cancel();player.play(smallPlan(2));const before=steps.length;old.forEach(x=>x.fn());assert.equal(steps.length,before);c.tick(100);assert.equal(finals.at(-1).finalView.revision,2);assert.equal(player.finalView.revision,2);assert.equal(finals.filter(x=>x.finalView.revision===1).length,cancel?1:0);}
});
test('callback exceptions/reentrant new plan and timer errors cannot leave controls blocked',()=>{
 const c=clock();let player;player=m.createPresentationPlayer({clock:c,onStep:()=>{player.play({...smallPlan(2),steps:[]});throw Error('old callback')},onFinal:()=>{throw Error('final renderer')}});player.play(smallPlan(1));c.tick(100);assert.equal(player.running,false);assert.equal(player.finalView.revision,2);assert.deepEqual(player.finalView.actions,smallPlan(2).finalView.actions);assert.equal(c.pending.size,0);
 const bad=m.createPresentationPlayer({clock:{setTimeout(){throw Error('clock failure')},clearTimeout(){}},onStep(){},onFinal(){}});bad.play(smallPlan());assert.equal(bad.running,false);assert.deepEqual(bad.finalView,smallPlan().finalView);
});
test('skip sound output is pure, pending committed only, priority-stable max2 at 0/120ms; cancel emits none',()=>{
 assert.equal(typeof m.selectSkipSounds,'function');const steps=['dice.rattle','coin.in','shield','levelup','victory','defeat'].map((cue,i)=>({key:`k${i}`,atMs:500,kind:'sound',payload:{cue,role:i?'committed':'decorative'}})),snapshot=structuredClone(steps);
 const selected=m.selectSkipSounds(steps,new Set(['k4']));assert.deepEqual(selected.map(s=>s.payload.cue),['defeat','levelup']);assert.deepEqual(selected.map(s=>s.atMs),[0,120]);assert.deepEqual(steps,snapshot);
 const c=clock(),finals=[],player=m.createPresentationPlayer({clock:c,onStep(){},onFinal:x=>finals.push(x)});player.play({...smallPlan(),durationMs:600,steps});player.skip();assert.equal(finals[0].sounds.length,2);player.play({...smallPlan(2),durationMs:600,steps});player.cancel();assert.deepEqual(finals.at(-1).sounds,[]);
});

test('non-consecutive revision or mismatched stale die never replays an old roll',async()=>{
 const f=await sessionFor(exampleRun(content,'M')),input=await committed(f.session,{type:'roll'});
 for(const after of [{...input.after,revision:input.after.revision+2},{...input.after,rolled:{...input.after.rolled,die:99}}])assert.deepEqual(m.planPresentation({...input,after}).steps,[]);
});
test('reduced castle quiet interval contains no scheduled footstep/land sounds',async()=>{
 const f=await moveFixture(98,6),p=m.planPresentation({...f,settings:{reducedMotion:true}}),quiet=displays(p,'quiet')[0];
 assert.ok(!sounds(p).some(s=>s.atMs>=quiet.atMs&&s.atMs<quiet.atMs+quiet.payload.durationMs));
});
test('skip never returns a sound step already delivered by the player',()=>{
 const c=clock(),finals=[],player=m.createPresentationPlayer({clock:c,onStep(){},onFinal:x=>finals.push(x)});player.play(smallPlan());c.tick(50);player.skip();assert.deepEqual(finals[0].sounds,[]);assert.equal(finals[0].nextActions[0].enabled,true);
});
test('the actual initial board position1 has a move path, not a discarded plan',async()=>{
 const f=await moveFixture(1,3),p=m.planPresentation({...f,settings:{}}),moved=f.effects.find(e=>e.t==='moved');assert.equal(moved.from,1);assert.equal(displays(p,'walk').length,moved.steps);assert.equal(displays(p,'walk')[0].payload.from,1);assert.equal(displays(p,'arrival')[0].payload.to,f.after.pos);
});
test('short+reduced remain separate: inn reading hold and region hold survive; mute is not timeline duration',async()=>{
 const base=exampleRun(content,'M'),inn=base.board.innPositions[0],f=await sessionFor(rollDie(content,place(base,inn-2),6).state),input=await committed(f.session,{type:'move'}),p=m.planPresentation({...input,settings:{animation:'short',reducedMotion:true}});assert.equal(displays(p,'move.fade')[0].payload.durationMs,150);assert.equal(displays(p,'inn.stop')[0].payload.durationMs,500);
 const region=await moveFixture(20,1);assert.notEqual(region.before.board.band.id,region.after.board.band.id);const q=m.planPresentation({...region,settings:{animation:'short',reducedMotion:true}});assert.equal(displays(q,'region.hold')[0].payload.durationMs,3400);
 assert.deepEqual(m.planPresentation({...input,settings:{mute:true,masterVolume:0,seVolume:0}}),m.planPresentation({...input,settings:{}}));
});
test('async callback rejection is contained; stale rejection cannot end a newer plan',async()=>{
 const c=clock(),finals=[],player=m.createPresentationPlayer({clock:c,onStep:()=>Promise.reject(Error('async renderer')),onFinal:x=>finals.push(x)});player.play(smallPlan());c.tick(0);await new Promise(r=>setImmediate(r));assert.equal(player.running,false);assert.equal(finals[0].reason,'error');assert.equal(c.pending.size,0);
 let reject;const d=clock(),next=m.createPresentationPlayer({clock:d,onStep:()=>new Promise((_,r)=>reject=r),onFinal(){}});next.play(smallPlan(1));d.tick(0);next.play({...smallPlan(2),steps:[]});reject(Error('obsolete renderer'));await new Promise(r=>setImmediate(r));assert.equal(next.running,true);d.tick(100);assert.equal(next.finalView.revision,2);
 const e=clock(),last=m.createPresentationPlayer({clock:e,onStep(){},onFinal:()=>Promise.reject(Error('async final'))});last.play(smallPlan());e.tick(100);await new Promise(r=>setImmediate(r));assert.equal(last.running,false);assert.equal(last.reason,'error');assert.deepEqual(last.finalView,smallPlan().finalView);
});
test('skip/cancel/error keep every original result effect for final text/numbers, without replaying gameplay',async()=>{
 const f=await moveFixture(),p=m.planPresentation({...f,settings:{}});assert.deepEqual(p.resultEffects,f.effects);assert.notEqual(p.resultEffects,f.effects);
 for(const reason of ['skip','cancel','error']){const c=clock(),finals=[],player=m.createPresentationPlayer({clock:c,onStep:()=>{if(reason==='error')throw Error('display failed')},onFinal:x=>finals.push(x)});player.play(p);if(reason==='error')c.tick(0);else player[reason]();assert.deepEqual(finals[0].effects,f.effects);assert.deepEqual(finals[0].finalView,f.after);}
});
test('P2 sound handed to reentrant skip callback is consumed before skip selection',()=>{
 const c=clock(),delivered=[],finals=[];let player;player=m.createPresentationPlayer({clock:c,onStep:step=>{if(step.kind==='sound'){delivered.push(step.key);player.skip()}},onFinal:value=>finals.push(value)});
 const plan={steps:[{key:'r:1:p:coin',atMs:0,kind:'sound',payload:{cue:'coin.in',role:'committed'}},{key:'r:1:p:level',atMs:50,kind:'sound',payload:{cue:'levelup',role:'committed'}}],durationMs:100,finalView:{runId:'r',revision:1,actions:[]}};
 player.play(plan);c.tick(0);assert.deepEqual(delivered,['r:1:p:coin']);assert.deepEqual(finals[0].sounds.map(s=>s.key),['r:1:p:level']);assert.ok(finals[0].sounds.every(s=>!delivered.includes(s.key)));assert.equal(c.pending.size,0);assert.equal(player.running,false);assert.equal(player.skip(),false);assert.equal(player.cancel(),false);c.all.forEach(x=>x.fn());assert.equal(finals.length,1);assert.deepEqual(delivered,['r:1:p:coin']);
});

// T4 battle slice: real memory commit/readback, one nonterminal normal attack. No app/audio.
import {startBattle} from '../fixtures/helpers.mjs';
async function battleFixture(){
 const b=startBattle(content,exampleRun(content,'M'),'EN09',{die:3}),store=createMemoryStore();
 await store.startNew({run:b.state,meta:createMeta()});const session=createSession(b.content,store);await session.load();
 return {store,session,...await committed(session,{type:'attack'})};
}
const battleStages=p=>p.steps.filter(s=>s.kind==='display');
const battlePlan=input=>m.planPresentation({...input,battleVisual:true});
for(const [animation,want] of [['standard',[[0,250],[250,150],[400,200],[600,500],[1100,0],[1100,0],[1100,0]]],['short',[[0,100],[100,80],[180,80],[260,200],[460,0],[460,0],[460,0]]]])test(`battle attack ${animation} presents committed hits in order, not the next tell or potential damage`,async()=>{
 const f=await battleFixture(),snapshot=structuredClone({before:f.before,after:f.after,effects:f.effects}),stored=await f.store.load(),p=battlePlan({...f,settings:{animation}}),d=battleStages(p);
 assert.deepEqual(d.map(s=>s.payload.stage),['battle.hero.prepare','battle.hero.slash','battle.enemy.hit','battle.enemy.prepare','battle.hero.block','battle.hero.hit','battle.result']);
 assert.deepEqual(d.map(s=>[s.atMs,s.payload.durationMs]),want);
 assert.equal(d[2].payload.hit.amount,5);assert.equal(d[2].payload.hit.hp,8);assert.equal(d[2].payload.flashMs,80);assert.equal(d[2].payload.recoilMs,animation==='short'?80:200);
 assert.equal(d[3].payload.enemyAct.name,'草束を投げる');assert.notEqual(d[3].payload.enemyAct.name,f.after.battle.telegraph.name);assert.equal(d[3].payload.enemyAct.round,1);
 assert.equal(d[4].payload.blocked,4);assert.deepEqual(d[4].payload.sources,[{t:'dieSoften',amount:4}]);
 assert.equal(d[5].payload.hit.amount,1);assert.equal(d[5].payload.hit.hp,39);assert.equal(d[5].payload.hit.base,5);assert.equal(d[5].payload.hit.potentialDamage,1);
 assert.equal(d[6].payload.persistent,true);assert.equal(d[6].payload.round,1);assert.equal(p.durationMs,animation==='short'?460:1100);
 assert.deepEqual(p.resultEffects,f.effects);assert.deepEqual(p.finalView,f.after);assert.notEqual(p.resultEffects,f.effects);assert.notEqual(p.finalView,f.after);assert.ok(Object.isFrozen(d[2].payload.hit));
 assert.equal(sounds(p).length,0);assert.deepEqual(m.selectSkipSounds(p.steps),[]);assert.equal(p.steps[0].payload.enabled,false);assert.equal(p.steps.at(-1).payload.enabled,true);
 assert.deepEqual({before:f.before,after:f.after,effects:f.effects},snapshot);assert.deepEqual(await f.store.load(),stored);
});
for(const animation of ['standard','short'])test(`battle reduced ${animation} is two150ms fades without advance, slash, flash or recoil`,async()=>{
 const f=await battleFixture(),p=battlePlan({...f,settings:{animation,reducedMotion:true}}),d=battleStages(p);
 assert.ok(d.length>0);assert.deepEqual(d.map(s=>[s.atMs,s.payload.durationMs]),[[0,0],[0,0],[0,150],[150,150],[300,0],[300,0],[300,0]]);
 assert.deepEqual(d.map(s=>s.payload.motion),['none','none','fade','fade','none','none','none']);assert.equal(d[2].payload.flashMs,0);assert.equal(d[2].payload.recoilMs,0);assert.equal(p.durationMs,300);assert.equal(d.at(-1).payload.persistent,true);assert.equal(sounds(p).length,0);
 assert.deepEqual(battlePlan({...f,settings:{animation,reducedMotion:true,mute:true,masterVolume:0,seVolume:0}}),p);
});
test('battle incomplete, malformed, stale, nonnormal or different actions retain only the static final view',async()=>{
 const f=await battleFixture();assert.ok(battlePlan(f).steps.length>0);
 const changes=[
  ['run',x=>x.before.runId='other'],['revision',x=>x.after.revision+=1],['before phase',x=>x.before.phase='gate'],['after phase',x=>x.after.phase='finished'],
  ['king',x=>x.before.battle.kind=x.after.battle.kind='king'],['optional',x=>x.before.battle.kind=x.after.battle.kind='optional'],['battle id',x=>x.after.battle.id='other'],['enemy id',x=>x.after.battle.enemy.id='EN01'],['round',x=>x.after.battle.round+=1],
  ['dead hero',x=>x.after.hero.hp=0],['dead enemy',x=>x.after.battle.enemy.hp=0],['no completed history',x=>x.after.battle.history=x.after.battle.history.filter(r=>r.round!==1)],
  ...['guard','spell','item','extra','flee'].map(type=>[type,x=>x.after.battle.history.find(r=>r.round===1).action.type=type]),
  ['choice',x=>x.after.battle.history.find(r=>r.round===1).action.choiceId='other'],['history amount',x=>x.after.battle.history.find(r=>r.round===1).hpLost=90],
  ['missing hit',x=>x.effects=x.effects.filter(e=>e.t!=='hit'||e.target!=='hero')],['missing act',x=>x.effects=x.effects.filter(e=>e.t!=='enemyAct')],['wrong act round',x=>x.effects.find(e=>e.t==='enemyAct').round=2],
  ['wrong act name',x=>x.effects.find(e=>e.t==='enemyAct').name='next action'],['duplicate hit',x=>x.effects.push({...x.effects.find(e=>e.t==='hit')})],
  ...['amount','hp','blocked','base','potentialDamage'].flatMap(key=>[NaN,undefined,-1,'1'].map(value=>[`${key}:${String(value)}`,x=>x.effects.find(e=>e.t==='hit'&&e.target==='hero')[key]=value])),
  ['wrong hit order',x=>x.effects.reverse()],['invalid soften',x=>x.effects.find(e=>e.t==='dieSoften').amount=99],
  ['wrong final hp',x=>x.after.hero.hp=38],['missing hero',x=>delete x.after.hero],['null effects',x=>x.effects=null],['null entry',x=>x.effects.push(null)],
  ...['victory','defeat','phaseChange','runFinished','fled','spellCast','itemUsed','guard'].map(t=>[t,x=>x.effects.push({t})])
 ];
 for(const [name,change] of changes){const input=structuredClone({before:f.before,after:f.after,effects:f.effects});change(input);const snapshot=structuredClone(input),p=battlePlan(input);assert.deepEqual(p.steps,[],name);assert.equal(p.durationMs,0,name);assert.deepEqual(p.finalView,input.after,name);assert.deepEqual(input,snapshot,name);}
});
test('battle zero actual loss stays zero, never reconstructed as base minus a guessed guard',async()=>{
 const f=await battleFixture(),input=structuredClone({before:f.before,after:f.after,effects:f.effects}),hit=input.effects.find(e=>e.t==='hit'&&e.target==='hero');
 // Boundary payload of a surviving fully blocked hit: planner must consume explicit values, not combat math.
 Object.assign(hit,{amount:0,potentialDamage:0,blocked:5,hp:40});input.after.hero.hp=40;input.after.battle.history.find(r=>r.round===1).hpLost=0;
 const p=battlePlan(input),d=displays(p,'battle.hero.hit');assert.equal(d.length,1);assert.equal(d[0].payload.hit.amount,0);assert.equal(d[0].payload.hit.hp,40);assert.equal(displays(p,'battle.hero.block')[0].payload.blocked,5);assert.equal(p.steps.at(-2).payload.persistent,true);
});
for(const reason of ['finish','skip','cancel','error'])test(`real battle plan ${reason} retains all final numbers with no extra session act or replay`,async()=>{
 const f=await battleFixture(),p=battlePlan(f);assert.ok(p.steps.length>0);const run=structuredClone(f.session.run),stored=await f.store.load(),c=clock(),finals=[],delivered=[];
 const player=m.createPresentationPlayer({clock:c,onStep:s=>{delivered.push(s);if(reason==='error')throw Error('battle renderer failed')},onFinal:x=>finals.push(x)});player.play(p);
 if(reason==='finish')c.tick(p.durationMs);else if(reason==='error')c.tick(0);else{c.tick(0);player[reason]();}
 assert.equal(player.running,false);assert.equal(finals.length,1);assert.equal(finals[0].reason,reason);assert.deepEqual(finals[0].finalView,f.after);assert.deepEqual(finals[0].effects,f.effects);assert.deepEqual(finals[0].nextActions,f.after.actions);assert.deepEqual(finals[0].sounds,[]);assert.equal(c.pending.size,0);
 const count=delivered.length;c.all.forEach(x=>x.fn());assert.equal(delivered.length,count);assert.equal(player.skip(),false);assert.equal(player.cancel(),false);assert.equal(finals.length,1);assert.deepEqual(f.session.run,run);assert.deepEqual(await f.store.load(),stored);
});

test('battle visual is unconnected by default and accepts only an explicit nonpersistent boolean true',async()=>{
 const f=await battleFixture();
 for(const options of [{},{battleVisual:undefined},{battleVisual:false},{battleVisual:1},{battleVisual:'true'},{battleVisual:{}},{battleVisual:[]},{settings:{battleVisual:true}}]){
  const input={...f,...options},p=m.planPresentation(input);assert.deepEqual(p.steps,[],JSON.stringify(options));assert.equal(p.durationMs,0);assert.deepEqual(p.finalView,f.after);
 }
 assert.ok(m.planPresentation({...f,battleVisual:true}).steps.length>0);
 assert.equal('battleVisual' in f.session.meta.settings,false);assert.equal('battleVisual' in (await f.store.load()).meta.settings,false);
});
