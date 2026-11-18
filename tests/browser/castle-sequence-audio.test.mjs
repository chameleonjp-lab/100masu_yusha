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
for(const [animation,quiet] of [['standard',1000],['short',500]])test(`castle ${animation} fade, silent arrival and one delayed bell`,async()=>{
 const f=await ready(animation);assert.equal(typeof f.api.castle,'function');f.api.castle({type:'fade',key:'r:2'});
 assert.ok(f.gains[0].gain.events.some(e=>e[0]===0&&e[1]===.6&&e[2]==='linear'));
 f.api.play('step');f.api.castle({type:'arrive',key:'r:2'});assert.equal(bell(f).length,0);assert.ok(f.sources.every(s=>s.stops.includes(undefined)));
 f.api.scene(null);f.api.configure({animation});assert.equal(f.gains[0].gain.events.at(-1)[0],0);
 f.api.effects([{t:'castleReached'}],'r:2');fire(f,quiet);assert.equal(bell(f).length,1);
 f.api.castle({type:'arrive',key:'r:2'});f.api.effects([{t:'castleReached'}],'r:2');assert.equal(bell(f).length,1);
});
for(const how of ['cancel','hide','mute','new-run'])test(`castle ${how} discards pending bell`,async()=>{
 const f=await ready();assert.equal(typeof f.api.castle,'function');f.api.castle({type:'fade',key:'old:2'});f.api.castle({type:'arrive',key:'old:2'});
 const delayed=[...f.timers.values()].find(t=>t.ms===1000).fn;
 if(how==='cancel')f.api.castle({type:'cancel',key:'old:2'});
 if(how==='hide')f.visibility(true);
 if(how==='mute')f.api.configure({mute:true});
 if(how==='new-run')f.api.castle({type:'fade',key:'new:2'});
 delayed();assert.equal(bell(f).length,0);f.api.configure({mute:false});f.api.castle({type:'arrive',key:'old:2'});assert.equal(bell(f).length,0);
});
test('fallback-first batch is not replayed by castle interface',async()=>{const f=await ready();assert.equal(typeof f.api.castle,'function');f.api.effects([{t:'castleReached'}],'r:2');assert.equal(bell(f).length,1);f.api.castle({type:'fade',key:'r:2'});f.api.castle({type:'arrive',key:'r:2'});assert.equal(bell(f).length,1);assert.ok(![...f.timers.values()].some(t=>t.ms===1000));});
test('gate reload has no transition; explicit road restores music after cancel',async()=>{const f=await ready();assert.equal(typeof f.api.castle,'function');f.api.scene({phase:'gate',board:{band:{id:5}}});assert.equal(bell(f).length,0);f.api.castle({type:'fade',key:'r:2'});f.api.castle({type:'cancel',key:'r:2'});f.api.scene(null);assert.equal(f.gains[0].gain.events.at(-1)[0],0);f.api.scene({phase:'board',board:{band:{id:1}}});assert.equal(f.gains[0].gain.events.at(-1)[0],.5);});

test('arrival suppresses late footstep and arbitrary sound during quiet',async()=>{const f=await ready();f.api.castle({type:'fade',key:'r:2'});f.api.castle({type:'arrive',key:'r:2'});const n=f.sources.length;f.api.play('step');f.api.play('bell');f.api.effects([{t:'moved',steps:1,stop:'castle'}],'r:2');assert.equal(f.sources.length,n);fire(f,1000);assert.equal(bell(f).length,1);});
test('configure and null scene do not truncate the active 600ms ramp',async()=>{const f=await ready();f.api.castle({type:'fade',key:'r:2'});const n=f.gains[0].gain.events.length;f.api.configure({masterVolume:.7});f.api.scene(null);assert.equal(f.gains[0].gain.events.length,n);});
for(const how of ['skip','stop'])test(how+' cancels delayed castle bell',async()=>{const f=await ready();f.api.castle({type:'fade',key:'r:2'});f.api.castle({type:'arrive',key:'r:2'});const delayed=[...f.timers.values()].find(t=>t.ms===1000).fn;if(how==='stop')f.api.stop();else f.api.castle({type:'skip',key:'r:2'});delayed();assert.equal(bell(f).length,0);});
test('fallback-first transition cannot restart road or retain scheduled effects',async()=>{const f=await ready();f.api.effects([{t:'castleReached'}],'r:2');f.api.castle({type:'fade',key:'r:2'});f.api.scene(null);assert.equal(f.gains[0].gain.events.at(-1)[0],0);assert.ok(f.sources.every(s=>s.stops.includes(undefined)));});
test('skip during fade suppresses late committed steps until a concrete next scene',async()=>{const f=await ready();f.api.castle({type:'fade',key:'r:2'});f.api.castle({type:'skip',key:'r:2'});const n=f.sources.length;f.api.effects([{t:'moved',steps:1,stop:'castle'},{t:'castleReached'}],'r:2');assert.equal(f.sources.length,n);});
