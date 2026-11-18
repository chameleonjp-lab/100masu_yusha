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
async function ready(){const f=fixture();f.api.scene({phase:'gate',board:{band:{id:5}}});await f.api.unlock();return f}
test('king start ramps music to configured gain in 800ms and scene/configure preserve ramp',async()=>{const f=await ready();f.api.configure({bgmVolume:.4});f.api.king({type:'start',key:'r:2',view});assert.ok(f.gains[0].gain.events.some(e=>e[0]===.4&&e[1]===.8&&e[2]==='linear'));const n=f.gains[0].gain.events.length;f.api.scene(view);f.api.configure({bgmVolume:.4});assert.equal(f.gains[0].gain.events.length,n);f.api.king({type:'finish',key:'r:2'});assert.equal(f.gains[0].gain.events.at(-1)[0],.4);});
for(const how of ['cancel','hide','mute','stop'])test(`king ${how} invalidates fade and never replays same key`,async()=>{const f=await ready();f.api.king({type:'start',key:'r:2',view});if(how==='cancel')f.api.king({type:'cancel',key:'r:2'});if(how==='hide')f.visibility(true);if(how==='mute')f.api.configure({mute:true});if(how==='stop')f.api.stop();const n=f.sources.length;f.api.king({type:'start',key:'r:2',view});assert.equal(f.sources.length,n);assert.ok(f.sources.every(s=>s.stops.includes(undefined)));});
test('reload has no entry ramp and late unlock never replays consumed entry',async()=>{const f=fixture();f.api.king({type:'start',key:'r:2',view});await f.api.unlock();assert.equal(f.sources.length,0);f.api.scene(view);assert.equal(f.gains[0].gain.events.filter(e=>e[2]==='linear').length,0);});
test('new generation cancels old ramp and old finish cannot disturb the new ramp',async()=>{const f=await ready();f.api.king({type:'start',key:'old:2',view});f.api.king({type:'start',key:'new:2',view});const n=f.gains[0].gain.events.length;f.api.king({type:'finish',key:'old:2'});assert.equal(f.gains[0].gain.events.length,n);assert.equal(f.gains[0].gain.events.at(-1)[2],'linear');});
