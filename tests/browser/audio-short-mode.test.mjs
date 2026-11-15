import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const {SFX}=await import(`${ROOT}/src/ui/audio-recipes.js`);
const source=await readFile(process.env.AUDIO_SOURCE||`${ROOT}/src/ui/audio.js`,'utf8');
function fixture(){
 const sources=[],gains=[],timers=new Map(),listeners=new Map(),contexts=[];let tid=0;
 const param=()=>({value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push([v,t])},setTargetAtTime(v,t,c){this.value=v;this.events.push([v,t,c])},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({connect(){},disconnect(){}});
 class Context{
  constructor(){this.currentTime=0;this.state='suspended';this.sampleRate=8;this.destination=node();this.resumeCalls=0;this.suspendCalls=0;contexts.push(this)}
  async resume(){this.resumeCalls++;this.state='running'}
  async suspend(){this.suspendCalls++;this.state='suspended'}
  createGain(){const n={...node(),gain:param()};gains.push(n);return n}
  createDynamicsCompressor(){return {...node(),threshold:param(),ratio:param(),attack:param(),release:param()}}
  createBuffer(){return {getChannelData(){return new Float32Array(8)}}}
  createBiquadFilter(){return {...node(),frequency:param(),Q:param()}}
  createStereoPanner(){return {...node(),pan:param()}}
  newSource(){const n={...node(),frequency:param(),detune:param(),starts:[],stops:[],start(t){this.starts.push(t)},stop(t){this.stops.push(t)}};sources.push(n);return n}
  createOscillator(){return this.newSource()}
  createBufferSource(){return this.newSource()}
 }
 const document={hidden:false,addEventListener(name,fn){listeners.set(name,fn)}};
 const sandbox={SFX,document,navigator:{},AudioContext:Context,setTimeout(fn,ms){const id=++tid;timers.set(id,{fn,ms});return id},clearTimeout(id){timers.delete(id)}};
 vm.createContext(sandbox);
 vm.runInContext(source.replace(/^import .*;\n/,'').replaceAll('export function ','function ')+'\nglobalThis.api=createAudio();',sandbox);
 return {api:sandbox.api,sources,gains,timers,contexts,document,visibility(hidden){document.hidden=hidden;listeners.get('visibilitychange')();},pendingSE(){return sources.filter(s=>s.starts.length&&!s.stops.includes(undefined))}};
}

const {dispatch}=await import(`${ROOT}/src/engine/index.js`);
const {getContent,exampleRun,startBattle,place,walk}=await import(`${ROOT}/tests/fixtures/helpers.mjs`);
const content=await getContent();
function victoryFx(){
 const b=startBattle(content,exampleRun(content,'M'),'EN09',{die:3});
 const state=structuredClone(b.state);state.battle.enemy.hp=1;state.xp=11;
 const r=dispatch(b.content,state,{type:'attack'},{rolls:[.99,.99]});
 assert.equal(r.state.phase,'battleReward');
 assert.equal(r.state.level,2);
 const ts=r.effects.map(e=>e.t);assert.ok(ts.indexOf('victory')<ts.indexOf('gold'));assert.ok(ts.indexOf('gold')<ts.indexOf('levelUp'));
 return r.effects;
}
async function ready(animation='standard',extra={}){const f=fixture();f.api.scene({phase:'gate',board:{band:{id:1}}});f.api.configure({animation,...extra});await f.api.unlock();return f;}
function notes(f){return f.sources.map(s=>({type:s.type||'noise',f:s.frequency.value,starts:[...s.starts]}));}
function hasPattern(f,pattern){return f.sources.some((_,i)=>{const a=f.sources.slice(i,i+pattern.length);return a.length===pattern.length&&a.every((s,j)=>s.frequency.value===pattern[j][0]&&Math.abs((s.starts[0]-a[0].starts[0])-pattern[j][1])<1e-9);});}
const victoryPattern=[[523.25,0],[659.25,.08],[783.99,.16],[1046.5,.24]];
const defeatPattern=[[329.63,0],[261.63,.26],[130.81,.52]];
const actualVictory= victoryFx();
test('real engine victory with gold and level-up retains the committed audio sequence in short mode',async()=>{const a=await ready(),b=await ready('short');a.api.effects(actualVictory,'real:1');b.api.effects(actualVictory,'real:1');assert.ok(a.sources.length>0);assert.deepEqual(notes(b),notes(a));assert.ok(hasPattern(b,victoryPattern));});
for(const [name,fx] of [
 ['healing',[{t:'hp',delta:5}]],['equipment',[{t:'equipped',slot:'armor'}]],['guard',[{t:'guard'}]],['defeat',[{t:'defeat'}]],['job',[{t:'jobChanged'}]],['companion',[{t:'companionJoined',id:'CP01'}]],['item',[{t:'itemGained',id:'HE01'}]],['spell',[{t:'spellCast',id:'SP01'}]] ]){
 test(`short animation does not drop committed ${name} cue`,async()=>{const a=await ready(),b=await ready('short');a.api.effects(fx,'one:1');b.api.effects(fx,'one:1');assert.ok(a.sources.length>0);assert.deepEqual(notes(b),notes(a));});
}
test('short dice retains exactly three rattles and lock at 210ms',async()=>{const a=await ready(),b=await ready('short');a.api.effects([{t:'dieRolled'}],'dice:1');b.api.effects([{t:'dieRolled'}],'dice:1');assert.equal(a.sources.length,17);assert.equal(b.sources.length,9);assert.deepEqual(b.sources.slice(0,6).map(s=>Math.round(s.starts[0]*1000)),[10,10,90,90,190,190]);assert.deepEqual(b.sources.slice(6).map(s=>Math.round(s.starts[0]*1000)),[210,210,210]);assert.deepEqual(a.sources.slice(-3).map(s=>Math.round(s.starts[0]*1000)),[660,660,660]);});
test('short victory same key is consumed once; a new revision is distinct',async()=>{const f=await ready('short');f.api.effects(actualVictory,'r:1');const n=f.sources.length;assert.ok(n>0);f.api.effects(actualVictory,'r:1');assert.equal(f.sources.length,n);f.api.effects(actualVictory,'r:2');assert.equal(f.sources.length,2*n);});
test('muted short effects are consumed without deferred replay',async()=>{const f=await ready('short',{mute:true});f.api.effects(actualVictory,'r:1');assert.equal(f.sources.length,0);f.api.configure({animation:'short',mute:false});f.api.effects(actualVictory,'r:1');assert.equal(f.sources.length,0);});
test('hidden short effects do not schedule and visibility itself does not replay',async()=>{const f=await ready('short');f.visibility(true);f.api.effects(actualVictory,'r:1');assert.equal(f.sources.length,0);f.visibility(false);assert.equal(f.sources.length,0);});
test('existing short SE muting does not stop road BGM timer',async()=>{const f=fixture();f.api.configure({animation:'short'});await f.api.unlock();f.api.effects(actualVictory,'r:1');assert.equal(f.timers.size,1);f.api.configure({animation:'short',mute:true});assert.equal(f.timers.size,1);});
test('real engine input and returned effects are not mutated by audio',async()=>{const f=await ready('short');const fx=structuredClone(actualVictory),before=structuredClone(fx);f.api.effects(fx,'r:1');assert.deepEqual(fx,before);});

function defeatFx(){const b=startBattle(content,exampleRun(content,'M'),'EN09',{die:6});const state=structuredClone(b.state);state.hp=1;state.battle.enemy.hp=999;state.battle.enemy.maxHp=999;const r=dispatch(b.content,state,{type:'attack'});assert.equal(r.state.phase,'retryOffer');assert.ok(r.effects.some(e=>e.t==='defeat'));assert.ok(!r.effects.some(e=>e.t==='runFinished'));return r.effects;}
test('real engine first defeat at retry offer retains defeat cue in short mode',async()=>{const fx=defeatFx(),a=await ready(),b=await ready('short');a.api.effects(fx,'loss:1');b.api.effects(fx,'loss:1');assert.ok(a.sources.length>0);assert.deepEqual(notes(b),notes(a));assert.ok(hasPattern(b,defeatPattern));});

test('real engine multi-level gain emits one levelUp event and one recipe in both modes',async()=>{const r=walk(content,place(exampleRun(content,'M'),10,{xp:22,hp:25}),6);const ups=r.effects.filter(e=>e.t==='levelUp');assert.deepEqual(ups.map(e=>[e.from,e.to]),[[1,3]]);const a=await ready(),b=await ready('short');a.api.effects(ups,'up:1');b.api.effects(ups,'up:1');assert.equal(a.sources.length,6);assert.deepEqual(notes(b),notes(a));});
function finalDefeatFx(){const b=startBattle(content,exampleRun(content,'M'),'EN09',{die:6});const s=structuredClone(b.state);s.hp=1;s.battle.enemy.hp=999;s.battle.enemy.maxHp=999;s.retry.used=true;const r=dispatch(b.content,s,{type:'attack'});assert.equal(r.state.phase,'finished');assert.deepEqual(r.effects.filter(e=>['defeat','runFinished'].includes(e.t)).map(e=>e.t),['defeat','runFinished']);return r.effects;}
function countPattern(f,pattern){return f.sources.reduce((n,_,i)=>{const a=f.sources.slice(i,i+pattern.length);return n+Number(a.length===pattern.length&&a.every((s,j)=>s.frequency.value===pattern[j][0]&&Math.abs((s.starts[0]-a[0].starts[0])-pattern[j][1])<1e-9));},0);}
for(const mode of ['standard','short']){
 test(`${mode}: real terminal defeat commits one defeat recipe, same key once, new revision again`,async()=>{const f=await ready(mode),fx=finalDefeatFx();f.api.effects(fx,'last:1');assert.equal(countPattern(f,defeatPattern),1);const n=f.sources.length;f.api.effects(fx,'last:1');assert.equal(f.sources.length,n);f.api.effects(fx,'last:2');assert.equal(countPattern(f,defeatPattern),2);});
 test(`${mode}: terminal false alone and retry defeat alone remain audible`,async()=>{for(const fx of [[{t:'runFinished',result:{defeated:false}}],[{t:'defeat'}]]){const f=await ready(mode);f.api.effects(fx,'alone:1');assert.equal(countPattern(f,defeatPattern),1);}});
 test(`${mode}: victory and missing result do not suppress defeat`,async()=>{for(const result of [{defeated:true},undefined]){const f=await ready(mode);f.api.effects([{t:'defeat'},{t:'runFinished',result}],'negative:1');assert.equal(countPattern(f,defeatPattern),result?1:2);}});
 test(`${mode}: legitimate repeated gold cues are preserved`,async()=>{const a=await ready(mode),b=await ready(mode);a.api.effects([{t:'gold',delta:2}],'gold:1');b.api.effects([{t:'gold',delta:2},{t:'gold',delta:3}],'gold:1');assert.ok(a.sources.length>0);assert.equal(b.sources.length,a.sources.length*2);});
}
