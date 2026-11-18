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


const view={phase:'battle',board:{band:{id:5}},battle:{kind:'king',stage:'fight',phase:{index:0}}};
const after={...view,phase:'battleReward',battle:{...view.battle,stage:'won'}};
async function ready(){const f=fixture();f.api.scene({phase:'gate',board:{band:{id:5}}});await f.api.unlock();return f}
test('victory owns old score until stop then cue exactly once and reward scene stays silent',async()=>{const f=await ready();f.api.kingVictory({type:'start',key:'v',view});assert.ok(f.timers.size);f.api.kingVictory({type:'stop',key:'v'});assert.equal(f.timers.size,0);f.api.kingVictory({type:'cue',key:'v'});const n=f.sources.length;f.api.kingVictory({type:'cue',key:'v'});f.api.play('victory');assert.equal(f.sources.length,n);f.api.kingVictory({type:'finish',key:'v',view:after});f.api.scene(after);assert.equal(f.timers.size,0)});
for(const how of ['cancel','skip','hide','mute','stop'])test('victory '+how+' prevents residual/replayed audio',async()=>{const f=await ready();f.api.kingVictory({type:'start',key:'v',view});f.api.kingVictory({type:'stop',key:'v'});f.api.kingVictory({type:'cue',key:'v'});if(how==='cancel'||how==='skip')f.api.kingVictory({type:how,key:'v'});if(how==='hide')f.visibility(true);if(how==='mute')f.api.configure({mute:true});if(how==='stop')f.api.stop();const n=f.sources.length;f.api.kingVictory({type:'start',key:'v',view});f.api.kingVictory({type:'cue',key:'v'});assert.equal(f.sources.length,n);assert.equal(f.timers.size,0);assert.ok(f.sources.every(s=>s.stops.includes(undefined)));});
test('locked victory never plays after unlock',async()=>{const f=fixture();f.api.kingVictory({type:'start',key:'v',view});await f.api.unlock();f.api.kingVictory({type:'stop',key:'v'});f.api.kingVictory({type:'cue',key:'v'});assert.equal(f.sources.length,0)});
for(const phase of ['battleReward','bagFull'])test('reload won king '+phase+' does not resume boss score',async()=>{const f=await ready();f.api.scene({...after,phase});assert.equal(f.timers.size,0);assert.equal(f.sources.length,0)});
test('stale key cannot stop newer victory owner',async()=>{const f=await ready();f.api.kingVictory({type:'start',key:'a',view});f.api.kingVictory({type:'start',key:'b',view});f.api.kingVictory({type:'stop',key:'a'});assert.ok(f.timers.size)});
