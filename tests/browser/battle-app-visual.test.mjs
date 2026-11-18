// Real session commit/readback and real bridge/player, with DOM/clock/audio boundaries only.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {getContent,exampleRun,startBattle} from '../fixtures/helpers.mjs';
import {createSession} from '../../src/ui/session.js';import {createMemoryStore} from '../../src/save/index.js';import {createMeta} from '../../src/engine/index.js';
import {planPresentation,createPresentationPlayer} from '../../src/ui/presentation-timeline.js';import {effectText} from '../../src/ui/presentation.js';
import {displayText,loadMessages} from '../../src/ui/i18n.js';
const content=await getContent(),source=readFileSync(new URL('../../src/ui/app.js',import.meta.url),'utf8');
async function fixture(){const b=startBattle(content,exampleRun(content,'M'),'EN09',{die:3}),store=createMemoryStore();await store.startNew({run:b.state,meta:createMeta()});const session=createSession(b.content,store);await session.load();const before=structuredClone(session.view),effects=await session.act({type:'attack'}),after=structuredClone(session.view);return {session,store,before,after,effects};}
function setup(f,settings={}){
 let now=0,id=0;const timers=new Map(),calls=[],controls=[{disabled:false},{disabled:true}];
 const node=()=>({dataset:{},style:{},children:[],textContent:'',append(...a){this.children.push(...a)},setAttribute(){},removeAttribute(){},addEventListener(){},remove(){this.removed=true},animate(frames,options){calls.push(['animate',this,frames,options]);return {cancel(){}}}});
 const hero=node(),enemy=node(),root=node();root.querySelectorAll=()=>controls;root.querySelector=s=>s==='.hero'?hero:s==='.enemy'?enemy:null;
 const session={run:f.after,meta:{settings},view:f.after};
 const c=vm.createContext({planPresentation,createPresentationPlayer,structuredClone,Set,document:{hidden:false},session,screen:'game',reduced:{matches:false},root,stage:{update(){}},lastAction:'',notice:'confirmed result',content,
 render:v=>calls.push(['render',v]),sound:{play:cue=>calls.push(['sound',cue]),scene(){}},el:(tag,cls,text)=>Object.assign(node(),{className:cls,textContent:text||''}),actionLabel:()=>'',
 effectText,localizedContent:x=>x,displayText,locale:()=> settings.language||'ja',pendingCommittedSound:null,setArt:(actor,key)=>{actor.pose=key;calls.push(['pose',actor,key])},getComputedStyle:()=>({transform:'matrix(1,0,0,1,-40,-70)'}),
 scheduleCommittedSound:(...args)=>calls.push(['effects',...args]),setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id},clearTimeout:id=>timers.delete(id)});
 const block=source.match(/\/\/ BEGIN committed presentation bridge\n([\s\S]*?)\/\/ END committed presentation bridge/)[1];vm.runInContext(block+'\nglobalThis.api={playCommittedPresentation,cancelPresentation,presentation};',c);
 const tick=t=>{for(;;){const entry=[...timers].filter(([,v])=>v.at<=t).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!entry)break;timers.delete(entry[0]);now=entry[1].at;entry[1].fn()}now=t};
 return {c,root,hero,enemy,calls,controls,tick,api:c.api};
}
for(const [animation,hitAt,end] of [['standard',400,1100],['short',180,460]])test(`normal attack ${animation}: actual committed hit, old telegraph and final effects`,async()=>{
 const f=await fixture(),saved=await f.store.load(),s=setup(f,{animation});assert.equal(s.api.playCommittedPresentation(f.before,f.after,f.effects,true),true);assert.equal(s.controls[0].disabled,true);assert.equal(s.calls.filter(x=>x[0]==='effects').length,1);
 s.tick(hitAt);assert.equal(s.root.dataset.presentation,'battle.enemy.hit');assert.equal(s.enemy.pose,'en09-hit');const status=s.root.children.find(n=>n.className==='presentation-status');assert.equal(status.textContent,effectText(f.effects.find(e=>e.t==='hit'&&e.target==='enemy'),content));
 s.tick(hitAt+(animation==='short'?80:200));assert.equal(s.root.dataset.presentation,'battle.enemy.prepare');assert.equal(status.textContent,f.effects.find(e=>e.t==='enemyAct').name);assert.notEqual(status.textContent,f.after.battle.telegraph.name);
 s.tick(end);assert.equal(s.api.presentation.running,false);assert.equal(s.controls[0].disabled,false);assert.equal(s.controls[1].disabled,true);assert.equal(s.calls.filter(x=>x[0]==='effects').length,1);assert.deepEqual(s.calls.find(x=>x[0]==='effects')[1],f.effects);assert.equal(s.calls.filter(x=>x[0]==='sound').length,0);assert.deepEqual(await f.store.load(),saved);
});
test('reduced battle uses fades, no translate or flashing keyframes',async()=>{const f=await fixture(),s=setup(f,{reducedMotion:true});assert.equal(s.api.playCommittedPresentation(f.before,f.after,f.effects,true),true);s.tick(300);const animations=s.calls.filter(x=>x[0]==='animate');assert.ok(animations.length>0);for(const [,actor,frames,options] of animations){assert.ok(options.duration<=150);assert.ok(frames.every(x=>!x.transform&&!x.filter));}assert.equal(s.api.presentation.running,false)});
test('skip/cancel keep confirmed result and never add or repeat battle sounds',async()=>{for(const mode of ['skip','cancel']){const f=await fixture(),s=setup(f);assert.equal(s.api.playCommittedPresentation(f.before,f.after,f.effects,true),true);s.tick(400);if(mode==='skip')s.api.presentation.skip();else s.api.cancelPresentation();s.tick(5000);assert.equal(s.controls[0].disabled,false);assert.equal(s.calls.filter(x=>x[0]==='sound').length,0);assert.equal(s.calls.filter(x=>x[0]==='effects').length,1);assert.deepEqual(s.calls.find(x=>x[0]==='effects')[1],f.effects);if(mode==='skip')assert.equal(s.c.notice,'confirmed result')}});
test('unsupported turn and stale snapshots remain static',async()=>{const f=await fixture();for(const input of [{...f,effects:[...f.effects,{t:'heal'}]},{...f,before:f.after},{...f,after:{...f.after,phase:'finished'}}]){const s=setup(input);assert.equal(s.api.playCommittedPresentation(input.before,input.after,input.effects,true),false);assert.equal(s.calls.length,0)}});

// Delayed-unlock regression: real preparation/scheduling/generation code; render
// boundary performs its actual invalidateCommittedSound side effect.
function pendingAudio(s){
 let resolveUnlock;const played=[];s.c.sound.unlock=()=>new Promise(r=>{resolveUnlock=r});s.c.sound.effects=(fx,key)=>played.push({fx,key});
 const code=source.slice(source.indexOf('let committedSoundGeneration='),source.indexOf('// BEGIN committed presentation bridge'));vm.runInContext(code,s.c);
 s.c.render=v=>{vm.runInContext('invalidateCommittedSound()',s.c);s.calls.push(['render',v])};
 vm.runInContext('prepareCommittedSound()',s.c);
 return {played,unlock:async()=>{resolveUnlock();await Promise.resolve();await Promise.resolve()}};
}
for(const finish of ['finish','skip'])test(`pending unlock survives visual ${finish} but plays only once`,async()=>{
 const f=await fixture(),s=setup(f),audio=pendingAudio(s);s.api.playCommittedPresentation(f.before,f.after,f.effects,true);assert.equal(audio.played.length,0);
 if(finish==='skip')s.api.presentation.skip();else s.tick(1100);assert.equal(audio.played.length,0);await audio.unlock();assert.equal(audio.played.length,1);assert.deepEqual(audio.played[0].fx,f.effects);s.tick(5000);assert.equal(audio.played.length,1);
});
test('already unlocked effects are not replayed at finish',async()=>{const f=await fixture(),s=setup(f),audio=pendingAudio(s);await audio.unlock();s.api.playCommittedPresentation(f.before,f.after,f.effects,true);assert.equal(audio.played.length,1);s.tick(1100);assert.equal(audio.played.length,1)});
for(const action of ['hidden','settings'])test(`pending unlock is discarded by ${action}`,async()=>{const f=await fixture(),s=setup(f),audio=pendingAudio(s);s.api.playCommittedPresentation(f.before,f.after,f.effects,true);if(action==='hidden')s.c.document.hidden=true;s.api.cancelPresentation();s.c.render();await audio.unlock();assert.equal(audio.played.length,0)});
test('committed enemy action name uses the English catalog, not raw Japanese or next tell',async()=>{await loadMessages('en',async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url,'utf8'))}));const f=await fixture(),s=setup(f,{language:'en'});s.api.playCommittedPresentation(f.before,f.after,f.effects,true);s.tick(600);assert.equal(s.root.children.find(n=>n.className==='presentation-status').textContent,'Grass-Bundle Toss')});
