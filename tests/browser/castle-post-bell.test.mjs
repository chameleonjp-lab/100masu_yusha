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


const bell=f=>f.sources.filter(s=>s.frequency.events.some(([v])=>v===98));
async function ready(animation='standard'){const f=fixture();f.api.configure({animation});await f.api.unlock();return f}
function fire(f,ms){const row=[...f.timers].find(([,t])=>t.ms===ms);assert.ok(row,`timer ${ms}`);f.timers.delete(row[0]);row[1].fn()}
test('gate preparation audio resumes after the castle bell without replaying the bell',async()=>{const f=await ready();f.api.castle({type:'fade',key:'r:2'});f.api.castle({type:'arrive',key:'r:2'});fire(f,1000);const count=f.sources.length;f.api.scene({phase:'gate',board:{band:{id:5}}});f.api.play('ui.tap');assert.ok(f.sources.length>count,'ordinary UI cue must work after quiet ends');});

test('quiet blocks UI then bell ends quiet without allowing same-key castle replay',async()=>{const f=await ready();f.api.castle({type:'fade',key:'r:2'});f.api.castle({type:'arrive',key:'r:2'});const before=f.sources.length;f.api.play('ui.tap');assert.equal(f.sources.length,before);fire(f,1000);assert.equal(bell(f).length,1);f.api.effects([{t:'castleReached'}],'r:2');f.api.castle({type:'arrive',key:'r:2'});assert.equal(bell(f).length,1);const after=f.sources.length;f.api.play('ui.tap');assert.ok(f.sources.length>after);});
