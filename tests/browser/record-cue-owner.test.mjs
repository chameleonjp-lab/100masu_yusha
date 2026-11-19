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
 const param=()=>({value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push([v,t])},setTargetAtTime(v,t,c){this.value=v;this.events.push([v,t,c])},cancelScheduledValues(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
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

import * as timeline from '../../src/ui/presentation-timeline.js';
const cue=(name='new.entry',revision=1)=>({key:`r:${revision}:meta:${name}`,cue:name});
const plan=()=>({steps:[{kind:'sound',key:'r:1:0',atMs:0,payload:{role:'committed',cue:'victory'}},{kind:'sound',key:'r:1:1',atMs:10,payload:{role:'committed',cue:'levelup'}}],durationMs:20,finalView:{runId:'r',revision:1},resultEffects:[]});
const augment=(p,c)=>timeline.addCommittedRecordCues?.(p,c)??p;
async function ready(){const f=fixture();f.api.scene({phase:'gate',board:{band:{id:1}}});await f.api.unlock();return f;}
test('timeline appends validated committed cue without changing original plan',()=>{const p=plan(),r=augment(p,[cue()]);assert.equal(r.steps.length,3);assert.equal(p.steps.length,2);assert.equal(r.steps[2].key,cue().key);assert.equal(r.steps[2].payload.recordCue,true);assert.equal(r.steps[2].atMs,20);assert.equal(r.durationMs,20);});
test('skip all committed cues share priority, cap and 120ms spacing',()=>{const p=augment(plan(),[cue()]);const s=timeline.selectSkipSounds(p.steps);assert.deepEqual(s.map(x=>x.payload.cue),['victory','levelup']);assert.deepEqual(s.map(x=>x.atMs),[0,120]);const rest=timeline.selectSkipSounds(p.steps,new Set(['r:1:0']));assert.deepEqual(rest.map(x=>x.payload.cue),['levelup','new.entry']);});
for(const [name,cues] of [['duplicate',[cue(),cue()]],['unknown',[{...cue(),cue:'future'}]],['other revision',[cue('new.entry',2)]],['bad key',[{...cue(),key:'x'}]],['extra',[{...cue(),extra:true}]]])test('invalid '+name+' list is rejected whole',()=>{assert.equal(augment(plan(),cues).steps.length,2);});
test('record cue plays once across direct and batch owners',async()=>{const f=await ready();f.api.recordCue?.(cue());assert.equal(f.sources.length,1);f.api.effects([],'r:1',{committedCues:[cue()]});assert.equal(f.sources.length,1);});
test('static batch retains original effects and appends one discovery cue',async()=>{const f=await ready();f.api.effects([{t:'gold',delta:1}],'r:1',{committedCues:[cue()]});assert.ok(f.sources.some(n=>n.frequency.value===1318.5));const n=f.sources.length;f.api.effects([{t:'gold',delta:1}],'r:1',{committedCues:[cue()]});assert.equal(f.sources.length,n);});
for(const mode of ['locked','hidden','mute','discard'])test(mode+' consumes record cue without replay',async()=>{const f=fixture();f.api.scene({phase:'gate',board:{band:{id:1}}});if(mode!=='locked')await f.api.unlock();if(mode==='hidden')f.document.hidden=true;if(mode==='mute')f.api.configure({mute:true});if(mode==='discard')f.api.discardRecordCues?.([cue()]);else f.api.recordCue?.(cue());assert.equal(f.sources.length,0);f.document.hidden=false;f.api.configure({mute:false});await f.api.unlock();f.api.recordCue?.(cue());assert.equal(f.sources.length,0);});
test('locked static batch consumes record cue before early return',async()=>{const f=fixture();f.api.scene({phase:'gate',board:{band:{id:1}}});f.api.effects([],'r:1',{committedCues:[cue()]});await f.api.unlock();f.api.recordCue?.(cue());assert.equal(f.sources.length,0);});
test('audio rejects duplicate/unknown/wrong-key list without partial emission',async()=>{for(const cues of [[cue(),cue()],[cue(),{...cue('best'),cue:'future'}],[cue('new.entry',2)]]){const f=await ready();f.api.effects([],'r:1',{committedCues:cues});assert.equal(f.sources.length,0);}});
const selected=(cueName='victory',index=0)=>({kind:'sound',key:`r:1:presentation:${index}`,atMs:index*120,payload:{role:'committed',cue:cueName}});
test('prepared selected victory survives dedicated cancellation without reopening it',async()=>{const f=await ready();f.api.kingVictory({type:'start',key:'r:1',view:{phase:'battle',board:{band:{id:5}},battle:{kind:'king',stage:'fight',phase:{index:0}}}});const h=f.api.prepareCommittedSkip?.('r:1',[selected()]);assert.ok(h);f.api.kingVictory({type:'skip',key:'r:1'});const before=f.sources.length;h.play(selected().key);assert.ok(f.sources.length>before);const n=f.sources.length;h.play(selected().key);f.api.play('victory');assert.equal(f.sources.length,n);assert.ok(f.sources.slice(before).every(s=>!s.stops.includes(undefined)));h.cancel();assert.ok(f.sources.slice(before).every(s=>s.stops.includes(undefined)));});
test('skip handle rejects outside selection and duplicate transaction',async()=>{const f=await ready(),h=f.api.prepareCommittedSkip?.('r:1',[selected('levelup')]);assert.ok(h);h.play('r:1:bogus');assert.equal(f.sources.length,0);h.play(selected().key);const n=f.sources.length;const again=f.api.prepareCommittedSkip?.('r:1',[selected('levelup')]);again?.play(selected().key);assert.equal(f.sources.length,n);});
for(const mode of ['locked','mute','hidden','cancel'])test('skip handle '+mode+' never revives after unlock',async()=>{const f=fixture();f.api.scene({phase:'gate',board:{band:{id:1}}});if(mode!=='locked')await f.api.unlock();if(mode==='hidden')f.document.hidden=true;if(mode==='mute')f.api.configure({mute:true});const h=f.api.prepareCommittedSkip?.('r:1',[selected('levelup')]);assert.ok(h);if(mode==='cancel')h.cancel();f.document.hidden=false;f.api.configure({mute:false});await f.api.unlock();h.play(selected().key);assert.equal(f.sources.length,0);});
test('discard cancels record notes only while finish leaves natural tail',async()=>{const f=await ready();f.api.recordCue?.(cue('best'));const own=[...f.sources];assert.ok(own.length>0);assert.ok(own.every(s=>!s.stops.includes(undefined)));f.api.play('heal');const other=f.sources.slice(own.length);f.api.discardRecordCues?.([cue('best')]);assert.ok(own.every(s=>s.stops.includes(undefined)));assert.ok(other.every(s=>!s.stops.includes(undefined)));});
test('skip selected metadata reserves key before delayed handoff and cancels owned nodes',async()=>{const f=await ready(),step={kind:'sound',key:cue().key,atMs:0,payload:{role:'committed',cue:'new.entry',recordCue:true}};const h=f.api.prepareCommittedSkip('r:1',[step]);f.api.recordCue(cue());assert.equal(f.sources.length,0);h.play(step.key);assert.equal(f.sources.length,1);f.api.discardRecordCues([cue()]);assert.ok(f.sources.every(s=>s.stops.includes(undefined)));});
test('bell selected at skip survives castle cancellation but regular bell stays blocked',async()=>{const f=await ready();f.api.castle({type:'fade',key:'r:1'});const step=selected('bell'),h=f.api.prepareCommittedSkip('r:1',[step]);f.api.castle({type:'skip',key:'r:1'});h.play(step.key);const n=f.sources.length;assert.ok(n>0);f.api.play('bell');assert.equal(f.sources.length,n);});
for(const how of ['hide','mute','stop'])test('pending skip '+how+' cannot replay on return',async()=>{const f=await ready(),step=selected('levelup'),h=f.api.prepareCommittedSkip('r:1',[step]);if(how==='hide'){f.visibility(true);f.visibility(false)}if(how==='mute'){f.api.configure({mute:true});f.api.configure({mute:false})}if(how==='stop')f.api.stop();h.play(step.key);assert.equal(f.sources.length,0);});
for(const steps of [[selected(),selected('levelup',1),selected('new.entry',2)],[{...selected(),atMs:1}],[{...selected(),payload:{role:'decorative',cue:'victory'}}],[{...selected(),key:'other:1:0'}]])test('malformed skip batch never emits',async()=>{const f=await ready(),h=f.api.prepareCommittedSkip('r:1',steps);for(const s of steps)h.play(s.key);assert.equal(f.sources.length,0);});
test('malformed record getters are rejected without throwing',async()=>{const f=await ready(),c={key:'r:1:meta:best',get cue(){throw Error('bad')}};assert.doesNotThrow(()=>f.api.recordCue(c));assert.doesNotThrow(()=>augment(plan(),[c]));assert.equal(f.sources.length,0);});
for(const name of ['tell.attack','tell.guard','tell.open','support','dice.lock'])test('supported committed plan cue '+name+' does not reject whole skip batch',async()=>{const f=await ready(),steps=[selected('levelup'),selected(name,1)],h=f.api.prepareCommittedSkip('r:1',steps);h.play(steps[0].key);const n=f.sources.length;assert.ok(n>0);h.play(steps[1].key);assert.ok(f.sources.length>n);});
test('suspension encountered on first skip handoff consumes remainder forever',async()=>{const f=await ready(),steps=[selected('levelup'),selected('coin.in',1)],h=f.api.prepareCommittedSkip('r:1',steps);f.contexts[0].state='suspended';h.play(steps[0].key);f.contexts[0].state='running';h.play(steps[1].key);assert.equal(f.sources.length,0);});
for(const name of ['support','join.answer'])test('invalid '+name+' options rejects entire prepare batch without exception',async()=>{const f=await ready(),s=selected(name);s.payload.options={role:'invalid'};const h=f.api.prepareCommittedSkip('r:1',[s]);assert.doesNotThrow(()=>h.play(s.key));assert.equal(f.sources.length,0);});
for(const role of ['shield','medic','thrower','lantern','archer'])test('known role '+role+' remains supported',async()=>{const f=await ready(),s=selected('support');s.payload.options={role};const h=f.api.prepareCommittedSkip('r:1',[s]);h.play(s.key);assert.ok(f.sources.length>0);});
test('options getters never execute',async()=>{const f=await ready(),s=selected('support');let reads=0;Object.defineProperty(s.payload,'options',{enumerable:true,get(){reads++;return {role:'shield'}}});const h=f.api.prepareCommittedSkip('r:1',[s]);h.play(s.key);assert.equal(reads,0);assert.equal(f.sources.length,0);});
test('sparse selected array is invalid without throwing',async()=>{const f=await ready(),steps=Array(1);assert.doesNotThrow(()=>f.api.prepareCommittedSkip('r:1',steps));});
test('castle shadow is end-only and default plan unchanged',()=>{const p=plan();p.steps.push({kind:'display',atMs:1,key:'r:1:a',payload:{stage:'castle.arrive'}});const r=timeline.addOwnedCastleBell?.(p)??p;assert.equal(r.steps.length,p.steps.length+1);assert.equal(r.steps.at(-1).atMs,p.durationMs);assert.equal(r.steps.at(-1).payload.skipOnly,true);assert.equal(r.steps.at(-1).payload.cue,'bell');assert.equal(timeline.addOwnedCastleBell(r).steps.length,r.steps.length);});
for(const short of [false,true])for(const alreadyPlayed of [false,true])test(`castle actual quiet timer short=${short} played=${alreadyPlayed} governs skip`,async()=>{
 const f=await ready();f.api.configure({animation:short?'short':'standard'});f.api.castle({type:'fade',key:'r:1'});f.api.castle({type:'arrive',key:'r:1'});
 const task=[...f.timers.values()].find(t=>t.ms===(short?500:1000));assert.ok(task);if(alreadyPlayed)task.fn();const n=f.sources.length;
 const step=selected('bell'),h=f.api.prepareCommittedSkip('r:1',[step]);f.api.castle({type:'skip',key:'r:1'});h.play(step.key);assert.equal(f.sources.length>n,!alreadyPlayed);
 const count=f.sources.length;task.fn();h.play(step.key);assert.equal(f.sources.length,count);
});
