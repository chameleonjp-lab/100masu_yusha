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

import {getContent,exampleRun,place,rollDie} from '../fixtures/helpers.mjs';
import {createSession} from '../../src/ui/session.js';import {createMemoryStore} from '../../src/save/index.js';import {createMeta} from '../../src/engine/index.js';
const content=await getContent();
async function committed(pos){const run=rollDie(content,place(exampleRun(content,'M'),pos),6).state,store=createMemoryStore();await store.startNew({run,meta:createMeta()});const session=createSession(content,store);await session.load();const effects=await session.act({type:'move'});return {session,store,effects}}
async function ready(){const f=fixture();f.api.scene({phase:'gate',board:{band:{id:5}}});await f.api.unlock();return f}
const landVoices=f=>f.sources.filter(s=>s.frequency.events.some(([v])=>v===90));
const bellVoices=f=>f.sources.filter(s=>s.frequency.events.some(([v])=>v===98));
for(const animation of ['standard','short'])test(`castle ${animation}: real committed move has no land voice and one bell, same batch never repeats`,async()=>{
 const x=await committed(98),snapshot=await x.store.load();assert.equal(x.session.view.phase,'gate');assert.equal(x.effects.find(e=>e.t==='moved').stop,'castle');
 const f=await ready();f.api.configure({animation});f.api.effects(x.effects,'castle:1');assert.equal(landVoices(f).length,0);assert.equal(bellVoices(f).length,1);const n=f.sources.length;f.api.effects(x.effects,'castle:1');assert.equal(f.sources.length,n);assert.deepEqual(await x.store.load(),snapshot);
});
for(const stop of ['normal','inn'])test(`${stop}: existing land voice remains`,async()=>{const f=await ready();f.api.effects([{t:'moved',from:1,to:3,steps:2,stop}],'move:1');assert.equal(landVoices(f).length,1)});
test('loading gate scene alone never plays a bell or land',async()=>{const f=await ready();assert.equal(f.sources.length,0);f.api.scene({phase:'gate',board:{band:{id:5}}});assert.equal(f.sources.length,0)});
test('mute consumes castle effects without replay at unmute',async()=>{const x=await committed(98),f=await ready();f.api.configure({mute:true});f.api.effects(x.effects,'mute:1');assert.equal(f.sources.length,0);f.api.configure({mute:false});f.api.effects(x.effects,'mute:1');assert.equal(f.sources.length,0)});
test('hidden castle effects and returning visible do not schedule notes',async()=>{const x=await committed(98),f=await ready();f.visibility(true);f.api.effects(x.effects,'hidden:1');assert.equal(f.sources.length,0);f.visibility(false);assert.equal(f.sources.length,0)});
