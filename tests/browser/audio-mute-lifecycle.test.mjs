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
test('initial and repeated unlock use one context and one scheduler',async()=>{const f=fixture();await f.api.unlock();assert.equal(f.contexts.length,1);assert.ok(f.sources.length>0);assert.equal(f.timers.size,1);await f.api.unlock();assert.equal(f.contexts.length,1);assert.equal(f.timers.size,1)});
test('same committed effect key is scheduled once',async()=>{const f=fixture();f.api.scene({phase:'gate',board:{band:{id:1}}});await f.api.unlock();f.api.effects([{t:'dieRolled'}],'r:1');const n=f.sources.length;assert.ok(n>0);f.api.effects([{t:'dieRolled'}],'r:1');assert.equal(f.sources.length,n)});
test('hide cancels future dice notes and suspends, hidden effects schedule none',async()=>{const f=fixture();f.api.scene({phase:'gate',board:{band:{id:1}}});await f.api.unlock();f.api.effects([{t:'dieRolled'}],'r:1');assert.ok(f.sources.some(x=>x.starts[0]>.6));f.visibility(true);assert.equal(f.timers.size,0);assert.equal(f.contexts[0].suspendCalls,1);assert.ok(f.sources.every(x=>x.stops.includes(undefined)));const n=f.sources.length;f.api.effects([{t:'castleReached'}],'r:2');assert.equal(f.sources.length,n)});
test('visible return alone emits no sound; subsequent unlock restarts road schedule',async()=>{const f=fixture();await f.api.unlock();f.visibility(true);const n=f.sources.length;f.visibility(false);assert.equal(f.sources.length,n);assert.equal(f.timers.size,0);await f.api.unlock();assert.equal(f.contexts.length,1);assert.equal(f.timers.size,1);assert.equal(f.contexts[0].state,'running')});
test('mute and unmute change master gain at current time',async()=>{const f=fixture();await f.api.unlock();f.api.configure({mute:true});assert.equal(f.gains[2].gain.value,0);f.api.configure({mute:false,masterVolume:.4});assert.equal(f.gains[2].gain.value,.4)});
test('muting cancels previously scheduled success notes before unmute',async()=>{const f=fixture();f.api.scene({phase:'gate',board:{band:{id:1}}});await f.api.unlock();f.api.effects([{t:'castleReached'}],'r:1');const notes=[...f.sources];assert.ok(notes.length>0);f.api.configure({mute:true});f.api.configure({mute:false});assert.ok(notes.every(n=>n.stops.includes(undefined)),'old bell nodes must be cancelled rather than becoming audible after unmute');});
test('effects committed while muted are consumed but never queued for unmute',async()=>{const f=fixture();f.api.scene({phase:'gate',board:{band:{id:1}}});await f.api.unlock();f.api.configure({mute:true});f.api.effects([{t:'castleReached'}],'r:2');assert.equal(f.sources.length,0);f.api.configure({mute:false});f.api.effects([{t:'castleReached'}],'r:2');assert.equal(f.sources.length,0)});
test('mute cancels SE without killing the road scheduler',async()=>{const f=fixture();await f.api.unlock();f.api.effects([{t:'dieRolled'}],'r:1');assert.equal(f.timers.size,1);f.api.configure({mute:true});assert.equal(f.timers.size,1)});
