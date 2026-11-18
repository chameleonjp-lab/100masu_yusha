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
for(const event of ['skip','mute-after-bell','hide-after-bell'])test(`gate UI still works after ${event}`,async()=>{const f=await ready();f.api.castle({type:'fade',key:'r:2'});f.api.castle({type:'arrive',key:'r:2'});if(event==='skip')f.api.castle({type:'skip',key:'r:2'});else{fire(f,1000);if(event==='mute-after-bell'){f.api.configure({mute:true});f.api.configure({mute:false});}else{f.visibility(true);f.visibility(false);await f.api.unlock();}}f.api.scene({phase:'gate',board:{band:{id:5}}});const n=f.sources.length;f.api.play('ui.tap');assert.ok(f.sources.length>n,'gate preparation should not remain permanently muted');});

test('cancelled quiet stays blocked until explicit gate, then stale movement and bell stay suppressed',async()=>{const f=await ready();f.api.castle({type:'fade',key:'r:2'});f.api.castle({type:'arrive',key:'r:2'});f.api.castle({type:'skip',key:'r:2'});let n=f.sources.length;f.api.play('ui.tap');assert.equal(f.sources.length,n);f.api.scene(null);f.api.play('ui.tap');assert.equal(f.sources.length,n);f.api.scene({phase:'gate',board:{band:{id:5}}});f.api.play('ui.tap');assert.ok(f.sources.length>n);n=f.sources.length;for(const cue of ['step','step.first','land','bell'])f.api.play(cue);f.api.effects([{t:'moved',steps:2,stop:'castle'},{t:'castleReached'}],'r:2');assert.equal(f.sources.length,n);assert.equal([...f.timers.values()].filter(t=>t.ms===1000).length,0);});
test('active quiet gate render does not release silence or reschedule bell',async()=>{const f=await ready();f.api.castle({type:'fade',key:'r:2'});f.api.castle({type:'arrive',key:'r:2'});f.api.scene({phase:'gate'});let n=f.sources.length;f.api.play('ui.tap');assert.equal(f.sources.length,n);fire(f,1000);f.api.play('ui.tap');assert.ok(f.sources.length>n);assert.equal(bell(f).length,1);});
