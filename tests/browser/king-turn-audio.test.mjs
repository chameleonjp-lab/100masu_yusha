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
 const param=()=>({value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push([v,t])},setTargetAtTime(v,t,c){this.value=v;this.events.push([v,t,c])},linearRampToValueAtTime(v,t){this.events.push([v,t,'linear'])},cancelScheduledValues(t){this.events.push([null,t,'cancel'])},exponentialRampToValueAtTime(){}});
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


const view={phase:'battle',board:{band:{id:5}},battle:{kind:'king',phase:{index:0}}};
const after={...view,battle:{kind:'king',phase:{index:1}}};
async function ready(){const f=fixture();f.api.scene({phase:'gate',board:{band:{id:5}}});await f.api.unlock();return f}
test('turn pauses and resumes old score, holds new phase until finish',async()=>{const f=await ready();f.api.kingTurn({type:'start',key:'r:3',view});assert.ok(f.sources.length);f.api.kingTurn({type:'pause',key:'r:3'});assert.equal(f.timers.size,0);const n=f.sources.length;f.api.scene(after);f.api.configure({bgmVolume:.3});assert.equal(f.sources.length,n);f.api.kingTurn({type:'resume',key:'r:3'});assert.ok(f.timers.size);f.api.kingTurn({type:'finish',key:'r:3',view:after});assert.ok(f.timers.size);});
for(const how of ['cancel','hide','mute','stop'])test(`turn ${how} stops voices and consumes key`,async()=>{const f=await ready();f.api.kingTurn({type:'start',key:'r:3',view});f.api.play('crown.crack');if(how==='cancel')f.api.kingTurn({type:'cancel',key:'r:3'});if(how==='hide')f.visibility(true);if(how==='mute')f.api.configure({mute:true});if(how==='stop')f.api.stop();const n=f.sources.length;f.api.kingTurn({type:'resume',key:'r:3'});f.api.kingTurn({type:'start',key:'r:3',view});assert.equal(f.sources.length,n);assert.equal(f.timers.size,0);assert.ok(f.sources.every(s=>s.stops.includes(undefined)));});
test('consumed locked start never replays at unlock',async()=>{const f=fixture();f.api.kingTurn({type:'start',key:'r:3',view});await f.api.unlock();assert.equal(f.sources.length,0);});
test('stale commands do not cancel current turn',async()=>{const f=await ready();f.api.kingTurn({type:'start',key:'old',view});f.api.kingTurn({type:'start',key:'new',view});const n=f.sources.length;f.api.kingTurn({type:'pause',key:'old'});f.api.kingTurn({type:'cancel',key:'old'});assert.equal(f.sources.length,n);assert.ok(f.timers.size)});
test('phase switches only on eight-step bar after finish, not scene(after)',async()=>{const f=await ready();f.api.kingTurn({type:'start',key:'bar',view});f.api.scene(after);const advance=t=>{while(f.contexts[0].currentTime<t){f.contexts[0].currentTime+=.025;const [id,task]=f.timers.entries().next().value;f.timers.delete(id);task.fn()}};advance(1.2);const expectedThird=.03+3*30/92;assert.ok(f.sources.some(s=>s.starts.some(t=>Math.abs(t-expectedThird)<1e-9)));f.api.kingTurn({type:'finish',key:'bar',view:after});advance(2.6);advance(3.3);const expectedTenth=.03+8*30/92+2*30/104;assert.ok(f.sources.some(s=>s.starts.some(t=>Math.abs(t-expectedTenth)<1e-9)));});
