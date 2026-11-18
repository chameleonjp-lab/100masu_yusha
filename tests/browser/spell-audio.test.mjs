import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {SFX} from '../../src/ui/audio-recipes.js';
const source=await readFile(new URL('../../src/ui/audio.js',import.meta.url),'utf8');
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


const start={type:'start',key:'r:4',spellId:'SP01'};const cast={type:'cue',key:'r:4',cue:'cast'},spark={...cast,cue:'cast.sp01'};
async function ready(){const f=fixture();f.api.scene({phase:'gate',board:{band:{id:5}}});await f.api.unlock();return f}
test('SP01 base five voices then one spark; cue duplicate and out of order blocked',async()=>{const f=await ready();f.api.spell(start);f.api.spell(spark);assert.equal(f.sources.length,0);f.api.spell(cast);assert.equal(f.sources.length,5);f.api.spell(cast);assert.equal(f.sources.length,5);f.api.spell(spark);assert.equal(f.sources.length,6);f.api.spell(spark);assert.equal(f.sources.length,6);const voiceGain=f.gains.at(-1).gain;assert.ok(voiceGain.events.filter(e=>e[2]==='linear').length>=5)});
for(const how of ['cancel','skip','hide','mute','stop'])test('SP01 '+how+' stops owned sources and blocks late cue',async()=>{const f=await ready();f.api.spell(start);f.api.spell(cast);if(how==='hide')f.visibility(true);else if(how==='mute')f.api.configure({mute:true});else if(how==='stop')f.api.stop();else f.api.spell({type:how,key:'r:4'});f.api.spell(spark);f.api.spell(start);assert.equal(f.sources.length,5);assert.ok(f.sources.every(s=>s.stops.includes(undefined)))});
test('locked start consumed and finish closes unplayed cue',async()=>{const f=fixture();f.api.scene({phase:'gate',board:{band:{id:5}}});f.api.spell(start);await f.api.unlock();f.api.spell(cast);assert.equal(f.sources.length,0);const g=await ready();g.api.spell(start);g.api.spell({type:'finish',key:'r:4'});g.api.spell(cast);assert.equal(g.sources.length,0)});
test('unsupported spell and stale key cannot play or cancel new owner',async()=>{const f=await ready();f.api.spell({...start,spellId:'SP04'});f.api.spell(cast);assert.equal(f.sources.length,0);f.api.spell(start);f.api.spell({...cast,key:'old'});assert.equal(f.sources.length,0);f.api.spell(cast);f.api.spell({type:'cancel',key:'old'});assert.ok(f.sources.every(s=>!s.stops.includes(undefined)))});
test('later static spell batch is not suppressed by finished SP01 ownership',async()=>{const f=await ready();f.api.spell(start);f.api.spell(cast);f.api.spell({type:'finish',key:'r:4'});const n=f.sources.length;f.api.effects([{t:'spellCast',id:'SP04'}],'r:5');assert.equal(f.sources.length,n+5)});
